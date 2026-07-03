import {
	createHarpistBridgeClient,
	type HarpistBridgeClient,
} from "@harpist/core/bridge-client";
import { buildHar, hostOfEntries, type PendingEntry } from "@harpist/core/har";
import {
	type ActiveDocumentation,
	type ActiveRecording,
	activePageFromTab,
	type BackgroundResponse,
	DEFAULT_SETTINGS,
	type HarpistSettings,
	mergeProfile,
	messageOf,
	normaliseServerUrl,
	type PopupState,
	PROFILES_KEY,
	type ProfilesStore,
	RECORDINGS_KEY,
	type RecordingArchive,
	type RecordingIndexStore,
	SETTINGS_KEY,
	type StopResult,
	summariseRecording,
} from "@harpist/core/profiles";
import { browser, defineBackground } from "#imports";
import {
	readDiagnostics,
	writeDiagnostic,
	writeErrorDiagnostic,
} from "../lib/diagnostics";
import {
	getRecording,
	getRecordingIndex,
	patchRecordingIndexEntry,
	putRecording,
} from "../lib/recording-db";

type Controller = {
	start: (tabId: number) => Promise<void>;
	state: () => {
		entryCount: number;
		recording: boolean;
		tabId: number | null;
	};
	stop: () => Promise<PendingEntry[]>;
};

let activeRecording: ActiveRecording | null = null;
let captureController: Controller | null = null;
let legacyRecordingStorageCleared = false;
let syncInFlight: Promise<SyncResult> | null = null;
let lastSyncState: Pick<SyncResult, "active" | "message" | "syncedAt"> | null =
	null;
let lastScheduledSyncAt = 0;

type SyncResult = {
	active: boolean;
	message?: string;
	profiles: ProfilesStore;
	recordings: RecordingIndexStore;
	syncedAt?: string;
};

const SLOW_OPERATION_MS = 5000;
const BACKGROUND_SYNC_MIN_INTERVAL_MS = 10_000;

const clearLegacyRecordingStorage = async () => {
	if (legacyRecordingStorageCleared) {
		return;
	}
	legacyRecordingStorageCleared = true;
	await browser.storage.local.remove(RECORDINGS_KEY);
};

const getCaptureController = async () => {
	if (!captureController) {
		const { createCaptureController } = await import("../lib/capture");
		captureController = createCaptureController();
	}
	return captureController;
};

const getSettings = async (): Promise<HarpistSettings> => {
	const stored = await browser.storage.local.get(SETTINGS_KEY);
	return {
		...DEFAULT_SETTINGS,
		...((stored[SETTINGS_KEY] as Partial<HarpistSettings>) ?? {}),
	};
};

const saveSettings = async (patch: Partial<HarpistSettings>) => {
	await browser.storage.local.set({
		[SETTINGS_KEY]: {
			...(await getSettings()),
			...patch,
		},
	});
};

const getProfiles = async (): Promise<ProfilesStore> => {
	const stored = await browser.storage.local.get(PROFILES_KEY);
	return (stored[PROFILES_KEY] as ProfilesStore | undefined) ?? {};
};

const saveProfiles = async (profiles: ProfilesStore) => {
	await browser.storage.local.set({
		[PROFILES_KEY]: profiles,
	});
};

const elapsedMs = (startedAt: number) => Date.now() - startedAt;

const maxSyncedAt = (recordings: RecordingIndexStore) =>
	Object.values(recordings)
		.map((recording) => recording.syncedAt)
		.filter((syncedAt): syncedAt is string => Boolean(syncedAt))
		.sort((left, right) => right.localeCompare(left))[0];

const unsyncedRecordingCount = (recordings: RecordingIndexStore) =>
	Object.values(recordings).filter((recording) => !recording.syncedAt).length;

const profilesForHosts = (profiles: ProfilesStore, hosts: Set<string>) =>
	[...hosts]
		.map((host) => profiles[host])
		.filter((profile): profile is ProfilesStore[string] => Boolean(profile));

const slowOperationDiagnostic = async (
	operation: string,
	startedAt: number,
	context?: Record<string, string | number | boolean | null>,
) => {
	const durationMs = elapsedMs(startedAt);
	if (durationMs < SLOW_OPERATION_MS) {
		return;
	}
	await writeDiagnostic({
		context,
		durationMs,
		level: "warn",
		message: "Operation took longer than expected.",
		operation,
	});
};

const profilesFromBridge = (
	profiles: Awaited<ReturnType<HarpistBridgeClient["profiles"]["list"]>>,
): ProfilesStore =>
	Object.fromEntries(profiles.map((profile) => [profile.host, profile]));

const recordingForBridge = (recording: RecordingArchive) => ({
	auth: recording.auth,
	authBundle: recording.authBundle,
	createdAt: recording.createdAt,
	derivedEndpointCount: recording.derivedEndpointCount,
	durationMs: recording.durationMs,
	entryCount: recording.entryCount,
	har: recording.har,
	host: recording.host,
	id: recording.id,
	latestAuth: recording.latestAuth,
	methodBreakdown: recording.methodBreakdown,
	processedAt: recording.processedAt,
	processingStatus: recording.processingStatus,
	scannedEndpointCount: recording.scannedEndpointCount,
	sourceUrl: recording.sourceUrl,
});

const activeTab = async () => {
	const tabs = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});
	const tab = tabs[0];
	if (!tab?.id) {
		throw new Error("No active website tab.");
	}
	return tab;
};

const docsHostFromBridgeUrl = (
	tabUrl: string | undefined,
	settings: HarpistSettings,
) => {
	if (!tabUrl) {
		return null;
	}
	try {
		const url = new URL(tabUrl);
		const bridgeUrl = new URL(normaliseServerUrl(settings.serverUrl));
		if (!isBridgeHost(url, bridgeUrl)) {
			return null;
		}
		const match = url.pathname.match(/^\/profiles\/([^/]+)\/docs(?:\/.*)?$/);
		if (!match?.[1]) {
			return null;
		}
		const host = decodeURIComponent(match[1]);
		return host || null;
	} catch {
		return null;
	}
};

const normaliseLoopbackHostname = (hostname: string) => {
	const normalised = hostname.toLowerCase();
	return normalised === "localhost" ||
		normalised === "127.0.0.1" ||
		normalised === "[::1]" ||
		normalised === "::1"
		? "localhost"
		: normalised;
};

const isBridgeHost = (url: URL, bridgeUrl: URL) =>
	url.port === bridgeUrl.port &&
	normaliseLoopbackHostname(url.hostname) ===
		normaliseLoopbackHostname(bridgeUrl.hostname);

const activeDocumentationFromTab = (
	tab: Awaited<ReturnType<typeof activeTab>>,
	settings: HarpistSettings,
	profiles: ProfilesStore,
): ActiveDocumentation | null => {
	const host = docsHostFromBridgeUrl(tab.url, settings);
	if (!host || !tab.url) {
		return null;
	}
	const profile = profiles[host];
	return {
		host,
		siteUrl: profile?.origin ?? `https://${host}`,
		title: tab.title ?? `${host} documentation`,
		url: tab.url,
	};
};

const setBadge = (recording: boolean) => {
	void browser.action.setBadgeBackgroundColor({
		color: "#e11d48",
	});
	void browser.action.setBadgeText({
		text: recording ? "REC" : "",
	});
};

const connectBridge = async (settings: HarpistSettings) => {
	const bridgeUrl = normaliseServerUrl(settings.serverUrl);
	const client = createHarpistBridgeClient(bridgeUrl);
	try {
		await client.bridge.health({});
		return {
			active: true as const,
			client,
			message: "Bridge active",
			url: bridgeUrl,
		};
	} catch (error) {
		return {
			active: false as const,
			message: `Bridge offline: ${messageOf(error)}`,
			url: bridgeUrl,
		};
	}
};

const syncWithBridge = async (
	settings: HarpistSettings,
	options: {
		activeHost?: string;
		force?: boolean;
	} = {},
): Promise<SyncResult> => {
	const startedAt = Date.now();
	const profiles = await getProfiles();
	const recordingIndex = await getRecordingIndex();
	const bridge = await connectBridge(settings);
	if (!bridge.active) {
		const result = {
			active: false,
			message: bridge.message,
			profiles,
			recordings: recordingIndex,
			syncedAt: maxSyncedAt(recordingIndex),
		};
		lastSyncState = result;
		return result;
	}

	const candidates = Object.values(recordingIndex).filter((recording) =>
		options.force
			? !options.activeHost || recording.host === options.activeHost
			: !recording.syncedAt,
	);
	let canonicalProfiles = profiles;
	let lastSyncedAt = maxSyncedAt(recordingIndex);
	let failedCount = 0;

	try {
		if (candidates.length === 0) {
			const pullStartedAt = Date.now();
			const result = await bridge.client.sync.pullExtensionState({});
			canonicalProfiles = profilesFromBridge(result.profiles);
			lastSyncedAt = result.pulledAt;
			await saveProfiles(canonicalProfiles);
			await slowOperationDiagnostic("sync.pullExtensionState", pullStartedAt, {
				profileCount: result.profiles.length,
			});
		}

		for (const candidate of candidates) {
			const attemptAt = new Date().toISOString();
			await patchRecordingIndexEntry(candidate, {
				lastSyncAttemptAt: attemptAt,
				lastSyncError: undefined,
			});

			const archive = await getRecording(candidate);
			if (!archive) {
				failedCount += 1;
				await patchRecordingIndexEntry(candidate, {
					lastSyncError: "Missing local HAR archive.",
				});
				await writeDiagnostic({
					context: {
						host: candidate.host,
						recordingId: candidate.id,
					},
					level: "error",
					message: "Recording index exists, but the HAR archive is missing.",
					operation: "sync.loadRecordingArchive",
				});
				continue;
			}

			const pushStartedAt = Date.now();
			try {
				const result = await bridge.client.sync.pushExtensionSnapshot({
					activeHost: options.activeHost,
					extensionId: browser.runtime.id,
					profiles: profilesForHosts(
						canonicalProfiles,
						new Set(
							[candidate.host, options.activeHost].filter(
								(host): host is string => Boolean(host),
							),
						),
					),
					recordings: [recordingForBridge(archive)],
				});
				canonicalProfiles = profilesFromBridge(result.profiles);
				lastSyncedAt = result.syncedAt;
				await saveProfiles(canonicalProfiles);
				if (result.appliedRecordingIds.includes(candidate.id)) {
					await patchRecordingIndexEntry(candidate, {
						lastSyncAttemptAt: attemptAt,
						lastSyncError: undefined,
						syncedAt: result.syncedAt,
					});
				}
				await slowOperationDiagnostic(
					"sync.pushExtensionSnapshot",
					pushStartedAt,
					{
						archiveEntryCount:
							candidate.archiveEntryCount ?? archive.har.log.entries.length,
						derivedEndpointCount: candidate.derivedEndpointCount,
						host: candidate.host,
						recordingId: candidate.id,
					},
				);
			} catch (error) {
				failedCount += 1;
				await patchRecordingIndexEntry(candidate, {
					lastSyncError: messageOf(error),
				});
				await writeErrorDiagnostic("sync.pushExtensionSnapshot", error, {
					context: {
						archiveEntryCount:
							candidate.archiveEntryCount ?? archive.har.log.entries.length,
						derivedEndpointCount: candidate.derivedEndpointCount,
						host: candidate.host,
						recordingId: candidate.id,
					},
					durationMs: elapsedMs(pushStartedAt),
				});
			}
		}

		const nextRecordings = await getRecordingIndex();
		const result = {
			active: true,
			message:
				failedCount > 0
					? `Bridge sync incomplete: ${failedCount} recording${
							failedCount === 1 ? "" : "s"
						} failed`
					: "Bridge synced",
			profiles: canonicalProfiles,
			recordings: nextRecordings,
			syncedAt: lastSyncedAt,
		};
		lastSyncState = result;
		await slowOperationDiagnostic("syncWithBridge", startedAt, {
			candidateCount: candidates.length,
			failedCount,
			pendingRecordingCount: unsyncedRecordingCount(nextRecordings),
		});
		return result;
	} catch (error) {
		await writeErrorDiagnostic("syncWithBridge", error, {
			context: {
				candidateCount: candidates.length,
				pendingRecordingCount: unsyncedRecordingCount(recordingIndex),
			},
			durationMs: elapsedMs(startedAt),
		});
		const result = {
			active: true,
			message: `Bridge sync failed: ${messageOf(error)}`,
			profiles,
			recordings: recordingIndex,
			syncedAt: maxSyncedAt(recordingIndex),
		};
		lastSyncState = result;
		return result;
	}
};

const scheduleSyncWithBridge = (
	settings: HarpistSettings,
	options: {
		activeHost?: string;
		force?: boolean;
		urgent?: boolean;
	} = {},
) => {
	if (syncInFlight) {
		return syncInFlight;
	}
	if (
		!(options.force || options.urgent) &&
		Date.now() - lastScheduledSyncAt < BACKGROUND_SYNC_MIN_INTERVAL_MS
	) {
		return null;
	}
	lastScheduledSyncAt = Date.now();
	syncInFlight = syncWithBridge(settings, {
		activeHost: options.activeHost,
		force: options.force,
	}).finally(() => {
		syncInFlight = null;
	});
	return syncInFlight;
};

const readState = async (
	controller: Controller | null,
): Promise<PopupState> => {
	await clearLegacyRecordingStorage();
	const settings = await getSettings();
	const tab = await activeTab().catch(() => null);
	const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
	const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
	const activeHost = docsHost ?? activePage?.host;
	const profiles = await getProfiles();
	const recordingIndex = await getRecordingIndex();
	const pendingRecordingCount = unsyncedRecordingCount(recordingIndex);
	const bridge = syncInFlight
		? {
				active: lastSyncState?.active ?? true,
				message: "Syncing with bridge",
				syncedAt: lastSyncState?.syncedAt ?? maxSyncedAt(recordingIndex),
			}
		: {
				...(await connectBridge(settings)),
				syncedAt: lastSyncState?.syncedAt ?? maxSyncedAt(recordingIndex),
			};
	if (bridge.active && !syncInFlight) {
		const scheduledSync = scheduleSyncWithBridge(settings, {
			activeHost,
		});
		if (scheduledSync) {
			void scheduledSync.catch((error: unknown) =>
				writeErrorDiagnostic("sync.background", error, {
					context: {
						activeHost: activeHost ?? null,
					},
				}),
			);
		}
	}
	const activeDocumentation = tab
		? activeDocumentationFromTab(tab, settings, profiles)
		: null;
	return {
		activeDocumentation,
		activePage,
		activeRecording,
		bridge: {
			active: bridge.active,
			lastSyncedAt: bridge.syncedAt,
			message: bridge.message,
			pendingRecordingCount,
			syncing: Boolean(syncInFlight),
			url: normaliseServerUrl(settings.serverUrl),
		},
		capture: controller?.state() ?? {
			entryCount: 0,
			recording: false,
			tabId: null,
		},
		diagnostics: await readDiagnostics(),
		profiles,
		settings,
	};
};

const startRecording = async (controller: Controller) => {
	const tab = await activeTab();
	const page = activePageFromTab(tab);
	if (!page) {
		throw new Error("Open a website tab before recording.");
	}
	await controller.start(tab.id as number);
	activeRecording = {
		...page,
		startedAt: new Date().toISOString(),
		tabId: tab.id as number,
	};
	setBadge(true);
	return readState(controller);
};

const fallbackMeta = (entries: PendingEntry[]): ActiveRecording => {
	const host = hostOfEntries(entries) || "unknown";
	const origin = host === "unknown" ? "" : `https://${host}`;
	return {
		host,
		origin,
		startedAt: entries[0]?.startedDateTime ?? new Date().toISOString(),
		tabId: 0,
		title: host,
		url: entries[0]?.url ?? origin,
	};
};

const stopRecording = async (controller: Controller): Promise<StopResult> => {
	const entries = await controller.stop();
	setBadge(false);
	const meta = activeRecording ?? fallbackMeta(entries);
	activeRecording = null;

	const endedAt = new Date().toISOString();
	const har = buildHar(entries);
	const summary = summariseRecording(entries, meta, {
		endedAt,
		startedAt: meta.startedAt,
	});
	const profiles = await getProfiles();
	const profile = mergeProfile(profiles[meta.host], meta, summary, {
		message: "Stored locally",
		status: "idle",
	});
	profiles[meta.host] = profile;
	await saveProfiles(profiles);

	await putRecording({
		...summary.recording,
		har,
		host: meta.host,
	});

	const settings = await getSettings();
	const scheduledSync = scheduleSyncWithBridge(settings, {
		activeHost: meta.host,
		urgent: true,
	});
	if (scheduledSync) {
		void scheduledSync.catch((error: unknown) =>
			writeErrorDiagnostic("sync.afterStopRecording", error, {
				context: {
					host: meta.host,
					recordingId: summary.recording.id,
				},
			}),
		);
	}

	return {
		profile,
		recording: summary.recording,
		synced: false,
	};
};

const handleMessage = async (message: {
	settings?: Partial<HarpistSettings>;
	type?: string;
}): Promise<BackgroundResponse<unknown>> => {
	try {
		if (message.type === "GET_STATE") {
			return {
				data: await readState(captureController),
				ok: true,
			};
		}
		if (message.type === "START_RECORDING") {
			const controller = await getCaptureController();
			return {
				data: await startRecording(controller),
				ok: true,
			};
		}
		if (message.type === "STOP_RECORDING") {
			const controller = await getCaptureController();
			return {
				data: await stopRecording(controller),
				ok: true,
			};
		}
		if (message.type === "SYNC_BRIDGE") {
			const settings = await getSettings();
			const tab = await activeTab().catch(() => null);
			const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
			const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
			await (scheduleSyncWithBridge(settings, {
				activeHost: docsHost ?? activePage?.host,
				force: true,
			}) ?? Promise.resolve());
			return {
				data: await readState(captureController),
				ok: true,
			};
		}
		if (message.type === "SAVE_SETTINGS") {
			await saveSettings(message.settings ?? {});
			return {
				data: await readState(captureController),
				ok: true,
			};
		}
		throw new Error(`Unknown message '${message.type ?? ""}'.`);
	} catch (error) {
		await writeErrorDiagnostic("background.handleMessage", error, {
			context: {
				messageType: message.type ?? null,
			},
		});
		return {
			error: messageOf(error),
			ok: false,
		};
	}
};

export default defineBackground({
	main() {
		browser.runtime.onMessage.addListener((message) =>
			handleMessage(
				(message ?? {}) as {
					settings?: Partial<HarpistSettings>;
					type?: string;
				},
			),
		);
	},
});
