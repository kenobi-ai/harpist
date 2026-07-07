import {
	createHarpistBridgeClient,
	type HarpistBridgeClient,
} from "@harpist/core/bridge-client";
import { buildHar, hostOfEntries, type PendingEntry } from "@harpist/core/har";
import { captureAutoStopSignal } from "@harpist/core/login-url";
import {
	type ActiveDocumentation,
	type ActiveRecording,
	activePageFromTab,
	type BackgroundResponse,
	DEFAULT_SETTINGS,
	type HarpistSettings,
	latestRecordingForProfile,
	latestRecordingNeedsRefinement,
	mergeProfile,
	messageOf,
	normaliseServerUrl,
	type PopupState,
	PROFILES_KEY,
	type ProfilesStore,
	type RecordingIndexStore,
	SETTINGS_KEY,
	type SiteProfile,
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
	deleteRecording,
	getRecordingIndex,
	getRecordingUploadChunk,
	getRecordingUploadPlan,
	patchRecordingIndexEntry,
	putRecording,
} from "../lib/recording-db";

type Controller = {
	entries: () => PendingEntry[];
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
let stopRecordingInFlight: Promise<StopResult> | null = null;
let syncInFlight: Promise<SyncResult> | null = null;
let lastSyncState: Pick<SyncResult, "active" | "message" | "syncedAt"> | null =
	null;
let lastScheduledSyncAt = 0;
let lastRecordingIndexState: {
	pendingRecordingCount: number;
	syncedAt?: string;
} = {
	pendingRecordingCount: 0,
};

type SyncResult = {
	active: boolean;
	message?: string;
	profiles: ProfilesStore;
	recordings: RecordingIndexStore;
	syncedAt?: string;
};

const SLOW_OPERATION_MS = 5000;
const BACKGROUND_SYNC_MIN_INTERVAL_MS = 10_000;
const BRIDGE_HEALTH_TIMEOUT_MS = 2500;
const BRIDGE_WRITE_TIMEOUT_MS = 6000;
const STOP_RECORDING_SLOW_PHASE_MS = 1000;
const REFINED_PROFILES_KEY = "harpist.refinedProfiles";
const PENDING_PROFILE_RESTORES_KEY = "harpist.pendingProfileRestores";
const ACTIVE_RECORDING_KEY = "harpist.activeRecording";
const PROFILE_RESTORE_PENDING_MESSAGE = "Profile restore pending";
const DEBUG_BUILD_MARKER = "stop-fire-and-poll-v3";

type PendingProfileRestore = {
	createdAt: string;
	host: string;
	profile: SiteProfile | null;
	removedRecordingId: string;
};

const withTimeout = async <T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> => {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
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

const saveActiveRecording = async (recording: ActiveRecording | null) => {
	if (recording) {
		await browser.storage.local.set({
			[ACTIVE_RECORDING_KEY]: recording,
		});
		return;
	}
	await browser.storage.local.remove(ACTIVE_RECORDING_KEY);
};

const getRefinedProfiles = async (): Promise<ProfilesStore> => {
	const stored = await browser.storage.local.get(REFINED_PROFILES_KEY);
	return (stored[REFINED_PROFILES_KEY] as ProfilesStore | undefined) ?? {};
};

const saveRefinedProfiles = async (profiles: ProfilesStore) => {
	await browser.storage.local.set({
		[REFINED_PROFILES_KEY]: profiles,
	});
};

const saveRefinedProfileSnapshot = async (profile: SiteProfile) => {
	if (latestRecordingNeedsRefinement(profile)) {
		return;
	}
	const snapshots = await getRefinedProfiles();
	snapshots[profile.host] = profile;
	await saveRefinedProfiles(snapshots);
};

const saveRefinedProfileSnapshots = async (profiles: ProfilesStore) => {
	const snapshots = await getRefinedProfiles();
	let changed = false;
	for (const profile of Object.values(profiles)) {
		if (latestRecordingNeedsRefinement(profile)) {
			continue;
		}
		snapshots[profile.host] = profile;
		changed = true;
	}
	if (changed) {
		await saveRefinedProfiles(snapshots);
	}
};

const removeRefinedProfileSnapshot = async (host: string) => {
	const snapshots = await getRefinedProfiles();
	if (!(host in snapshots)) {
		return;
	}
	delete snapshots[host];
	await saveRefinedProfiles(snapshots);
};

const getPendingProfileRestores = async () => {
	const stored = await browser.storage.local.get(PENDING_PROFILE_RESTORES_KEY);
	return (
		(stored[PENDING_PROFILE_RESTORES_KEY] as
			| Record<string, PendingProfileRestore>
			| undefined) ?? {}
	);
};

const savePendingProfileRestores = async (
	restores: Record<string, PendingProfileRestore>,
) => {
	await browser.storage.local.set({
		[PENDING_PROFILE_RESTORES_KEY]: restores,
	});
};

const savePendingProfileRestore = async (restore: PendingProfileRestore) => {
	const restores = await getPendingProfileRestores();
	restores[restore.host] = restore;
	await savePendingProfileRestores(restores);
};

const removePendingProfileRestore = async (host: string) => {
	const restores = await getPendingProfileRestores();
	if (!(host in restores)) {
		return;
	}
	delete restores[host];
	await savePendingProfileRestores(restores);
};

const throwIfProfileRestorePending = async () => {
	const count = Object.keys(await getPendingProfileRestores()).length;
	if (count > 0) {
		throw new Error(
			`${PROFILE_RESTORE_PENDING_MESSAGE} for ${count} profile${
				count === 1 ? "" : "s"
			}.`,
		);
	}
};

const elapsedMs = (startedAt: number) => Date.now() - startedAt;

const maxSyncedAt = (recordings: RecordingIndexStore) =>
	Object.values(recordings)
		.map((recording) => recording.syncedAt)
		.filter((syncedAt): syncedAt is string => Boolean(syncedAt))
		.sort((left, right) => right.localeCompare(left))[0];

const unsyncedRecordingCount = (recordings: RecordingIndexStore) =>
	Object.values(recordings).filter((recording) => !recording.syncedAt).length;

const rememberRecordingIndex = (recordings: RecordingIndexStore) => {
	lastRecordingIndexState = {
		pendingRecordingCount: unsyncedRecordingCount(recordings),
		syncedAt: maxSyncedAt(recordings),
	};
	return lastRecordingIndexState;
};

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

const stopPhaseDiagnostic = async (
	operation: string,
	startedAt: number,
	context?: Record<string, string | number | boolean | null>,
) => {
	const durationMs = elapsedMs(startedAt);
	if (durationMs < STOP_RECORDING_SLOW_PHASE_MS) {
		return;
	}
	await writeDiagnostic({
		context,
		durationMs,
		level: "warn",
		message: "Stop recording phase took longer than expected.",
		operation,
	});
};

const preserveEntriesForStorage = (entries: PendingEntry[]) => {
	return {
		entries,
		strippedBodyCount: 0,
	};
};

const profilesFromBridge = (
	profiles: Awaited<ReturnType<HarpistBridgeClient["profiles"]["list"]>>,
): ProfilesStore =>
	Object.fromEntries(profiles.map((profile) => [profile.host, profile]));

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
		await withTimeout(
			client.bridge.health({}),
			BRIDGE_HEALTH_TIMEOUT_MS,
			`Bridge health timed out after ${BRIDGE_HEALTH_TIMEOUT_MS}ms.`,
		);
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

const pushPendingProfileRestores = async (client: HarpistBridgeClient) => {
	const restores = Object.values(await getPendingProfileRestores());
	let canonicalProfiles: ProfilesStore | null = null;
	let failedCount = 0;
	for (const restore of restores) {
		try {
			const result = await withTimeout(
				client.sync.restoreExtensionProfile({
					extensionId: browser.runtime.id,
					host: restore.host,
					profile: restore.profile,
					removedRecordingId: restore.removedRecordingId,
				}),
				BRIDGE_WRITE_TIMEOUT_MS,
				`Bridge restore timed out after ${BRIDGE_WRITE_TIMEOUT_MS}ms.`,
			);
			canonicalProfiles = profilesFromBridge(result.profiles);
			await removePendingProfileRestore(restore.host);
		} catch (error) {
			failedCount += 1;
			await writeErrorDiagnostic("sync.restoreExtensionProfile", error, {
				context: {
					host: restore.host,
					recordingId: restore.removedRecordingId,
				},
			});
		}
	}
	if (canonicalProfiles) {
		await saveProfiles(canonicalProfiles);
		await saveRefinedProfileSnapshots(canonicalProfiles);
	}
	return {
		failedCount,
		profiles: canonicalProfiles,
		restoreCount: restores.length,
	};
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
	rememberRecordingIndex(recordingIndex);
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

	let canonicalProfiles = profiles;
	let lastSyncedAt = maxSyncedAt(recordingIndex);
	const restoreResult = await pushPendingProfileRestores(bridge.client);
	if (restoreResult.profiles) {
		canonicalProfiles = restoreResult.profiles;
		lastSyncedAt = new Date().toISOString();
	}
	if (restoreResult.failedCount > 0) {
		const nextRecordings = await getRecordingIndex();
		rememberRecordingIndex(nextRecordings);
		const result = {
			active: true,
			message: `Bridge restore pending: ${restoreResult.failedCount} rollback${
				restoreResult.failedCount === 1 ? "" : "s"
			} failed`,
			profiles: canonicalProfiles,
			recordings: nextRecordings,
			syncedAt: lastSyncedAt,
		};
		lastSyncState = result;
		return result;
	}

	const candidates = Object.values(recordingIndex).filter((recording) =>
		options.force
			? !options.activeHost || recording.host === options.activeHost
			: !recording.syncedAt,
	);
	let failedCount = 0;

	try {
		if (candidates.length === 0) {
			const pullStartedAt = Date.now();
			const result = await bridge.client.sync.pullExtensionState({});
			await throwIfProfileRestorePending();
			canonicalProfiles = profilesFromBridge(result.profiles);
			lastSyncedAt = result.pulledAt;
			await saveProfiles(canonicalProfiles);
			await saveRefinedProfileSnapshots(canonicalProfiles);
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

			const upload = await getRecordingUploadPlan(candidate);
			if (!upload) {
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
				const profiles = profilesForHosts(
					canonicalProfiles,
					new Set(
						[candidate.host, options.activeHost].filter(
							(host): host is string => Boolean(host),
						),
					),
				);
				let completeResult: Awaited<
					ReturnType<HarpistBridgeClient["sync"]["pushExtensionRecordingChunk"]>
				> | null = null;
				for (let chunkIndex = 0; chunkIndex < upload.chunkCount; chunkIndex++) {
					const chunk = await getRecordingUploadChunk(
						candidate,
						chunkIndex,
						upload.chunkCount,
					);
					if (!chunk) {
						throw new Error(
							`Missing local HAR chunk ${chunkIndex + 1}/${upload.chunkCount}.`,
						);
					}
					const result = await withTimeout(
						bridge.client.sync.pushExtensionRecordingChunk({
							activeHost: options.activeHost,
							chunk,
							extensionId: browser.runtime.id,
							profiles,
							recording: upload.recording,
						}),
						BRIDGE_WRITE_TIMEOUT_MS,
						`Bridge chunk write timed out after ${BRIDGE_WRITE_TIMEOUT_MS}ms.`,
					);
					await throwIfProfileRestorePending();
					if (result.complete) {
						completeResult = result;
						break;
					}
				}
				if (!completeResult) {
					throw new Error(
						`Bridge accepted ${upload.chunkCount} chunk${
							upload.chunkCount === 1 ? "" : "s"
						}, but did not assemble the recording.`,
					);
				}
				const result = completeResult;
				await throwIfProfileRestorePending();
				canonicalProfiles = profilesFromBridge(result.profiles);
				lastSyncedAt = result.syncedAt;
				await saveProfiles(canonicalProfiles);
				await saveRefinedProfileSnapshots(canonicalProfiles);
				if (result.appliedRecordingIds.includes(candidate.id)) {
					await patchRecordingIndexEntry(candidate, {
						lastSyncAttemptAt: attemptAt,
						lastSyncError: undefined,
						syncedAt: result.syncedAt,
					});
				}
				await slowOperationDiagnostic(
					"sync.pushExtensionRecordingChunk",
					pushStartedAt,
					{
						archiveEntryCount:
							candidate.archiveEntryCount ?? upload.archiveEntryCount,
						chunkCount: upload.chunkCount,
						derivedEndpointCount: candidate.derivedEndpointCount,
						host: candidate.host,
						recordingId: candidate.id,
					},
				);
			} catch (error) {
				if (messageOf(error).startsWith(PROFILE_RESTORE_PENDING_MESSAGE)) {
					throw error;
				}
				failedCount += 1;
				await patchRecordingIndexEntry(candidate, {
					lastSyncError: messageOf(error),
				});
				await writeErrorDiagnostic("sync.pushExtensionRecordingChunk", error, {
					context: {
						archiveEntryCount:
							candidate.archiveEntryCount ?? upload.archiveEntryCount,
						chunkCount: upload.chunkCount,
						derivedEndpointCount: candidate.derivedEndpointCount,
						host: candidate.host,
						recordingId: candidate.id,
					},
					durationMs: elapsedMs(pushStartedAt),
				});
			}
		}

		const nextRecordings = await getRecordingIndex();
		rememberRecordingIndex(nextRecordings);
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
			profiles: await getProfiles(),
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

const scheduleStateRefresh = (
	settings: HarpistSettings,
	activeHost?: string,
) => {
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
};

const readState = async (
	controller: Controller | null,
): Promise<PopupState> => {
	const settings = await getSettings();
	const tab = await activeTab().catch(() => null);
	const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
	const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
	const activeHost = docsHost ?? activePage?.host;
	const profiles = await getProfiles();
	const bridge = syncInFlight
		? {
				active: lastSyncState?.active ?? true,
				message: "Syncing with bridge",
				syncedAt: lastSyncState?.syncedAt ?? lastRecordingIndexState.syncedAt,
			}
		: (lastSyncState ?? {
				active: false,
				message: "Bridge not checked",
				syncedAt: lastRecordingIndexState.syncedAt,
			});
	if (!syncInFlight) {
		scheduleStateRefresh(settings, activeHost);
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
			pendingRecordingCount: lastRecordingIndexState.pendingRecordingCount,
			syncing: Boolean(syncInFlight),
			url: normaliseServerUrl(settings.serverUrl),
		},
		capture: {
			...(controller?.state() ?? {
				entryCount: 0,
				recording: false,
				tabId: null,
			}),
			stopping: Boolean(stopRecordingInFlight),
		},
		diagnostics: await readDiagnostics(),
		profiles,
		settings,
	};
};

const readDebugInfo = async () => {
	const manifest = browser.runtime.getManifest();
	const recordingIndex = await getRecordingIndex().catch(() => ({}));
	const pendingRestores = await getPendingProfileRestores().catch(() => ({}));
	const diagnostics = await readDiagnostics().catch(() => []);
	const state = await readState(captureController).catch((error: unknown) => ({
		error: messageOf(error),
	}));
	return {
		build: DEBUG_BUILD_MARKER,
		captureControllerState: captureController?.state() ?? null,
		diagnostics,
		generatedAt: new Date().toISOString(),
		manifest: {
			name: manifest.name,
			version: manifest.version,
		},
		pendingProfileRestores: Object.values(pendingRestores).map((restore) => ({
			createdAt: restore.createdAt,
			host: restore.host,
			hasProfile: Boolean(restore.profile),
			removedRecordingId: restore.removedRecordingId,
		})),
		recordingIndex: Object.values(recordingIndex),
		runtimeId: browser.runtime.id,
		state,
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
	await saveActiveRecording(activeRecording);
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
	const startedAt = Date.now();
	const stopStartedAt = Date.now();
	const entries = await controller.stop();
	await stopPhaseDiagnostic("stopRecording.detachDebugger", stopStartedAt, {
		entryCount: entries.length,
	});
	if (entries.length === 0 && !activeRecording) {
		throw new Error("No recording is in progress.");
	}
	setBadge(false);
	const meta = activeRecording ?? fallbackMeta(entries);
	activeRecording = null;

	const endedAt = new Date().toISOString();
	const compactStartedAt = Date.now();
	const compacted = preserveEntriesForStorage(entries);
	await stopPhaseDiagnostic("stopRecording.compactEntries", compactStartedAt, {
		entryCount: entries.length,
		strippedBodyCount: compacted.strippedBodyCount,
	});
	const buildHarStartedAt = Date.now();
	const har = buildHar(compacted.entries);
	await stopPhaseDiagnostic("stopRecording.buildHar", buildHarStartedAt, {
		entryCount: har.log.entries.length,
		strippedBodyCount: compacted.strippedBodyCount,
	});
	const summarizeStartedAt = Date.now();
	const summary = summariseRecording(compacted.entries, meta, {
		endedAt,
		inferBodies: false,
		startedAt: meta.startedAt,
	});
	await stopPhaseDiagnostic(
		"stopRecording.summariseRecording",
		summarizeStartedAt,
		{
			derivedEndpointCount: summary.templateKeys.size,
			entryCount: compacted.entries.length,
		},
	);
	const profileStartedAt = Date.now();
	const profiles = await getProfiles();
	const previousProfile = profiles[meta.host];
	if (previousProfile && !latestRecordingNeedsRefinement(previousProfile)) {
		await saveRefinedProfileSnapshot(previousProfile);
	}
	const profile = mergeProfile(profiles[meta.host], meta, summary, {
		message: "Needs refinement",
		status: "idle",
	});
	profiles[meta.host] = profile;
	await saveProfiles(profiles);
	await stopPhaseDiagnostic("stopRecording.saveProfile", profileStartedAt, {
		host: meta.host,
		recordingId: summary.recording.id,
	});

	const persistStartedAt = Date.now();
	await putRecording({
		...summary.recording,
		har,
		host: meta.host,
	});
	await saveActiveRecording(null);
	lastRecordingIndexState = {
		...lastRecordingIndexState,
		pendingRecordingCount: lastRecordingIndexState.pendingRecordingCount + 1,
	};
	await stopPhaseDiagnostic(
		"stopRecording.persistRecording",
		persistStartedAt,
		{
			entryCount: har.log.entries.length,
			host: meta.host,
			recordingId: summary.recording.id,
		},
	);

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
	await slowOperationDiagnostic("stopRecording", startedAt, {
		derivedEndpointCount: summary.recording.derivedEndpointCount,
		entryCount: summary.recording.entryCount,
		host: meta.host,
		recordingId: summary.recording.id,
		strippedBodyCount: compacted.strippedBodyCount,
	});

	return {
		profile,
		recording: summary.recording,
		synced: false,
	};
};

const stopRecordingOnce = (controller: Controller) => {
	if (!stopRecordingInFlight) {
		stopRecordingInFlight = stopRecording(controller).finally(() => {
			stopRecordingInFlight = null;
		});
	}
	return stopRecordingInFlight;
};

const undoLatestRecording = async (host?: string) => {
	const settings = await getSettings();
	const tab = await activeTab().catch(() => null);
	const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
	const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
	const targetHost = host ?? docsHost ?? activePage?.host;
	if (!targetHost) {
		throw new Error("No profile selected to undo.");
	}
	const profiles = await getProfiles();
	const profile = profiles[targetHost];
	if (!profile) {
		throw new Error(`No profile exists for '${targetHost}'.`);
	}
	const latestRecording = latestRecordingForProfile(profile);
	if (!latestRecording || !latestRecordingNeedsRefinement(profile)) {
		throw new Error("Latest recording does not need refinement.");
	}

	const snapshots = await getRefinedProfiles();
	const refinedProfile = snapshots[targetHost] ?? null;
	if (refinedProfile) {
		profiles[targetHost] = refinedProfile;
	} else {
		delete profiles[targetHost];
		await removeRefinedProfileSnapshot(targetHost);
	}
	await saveProfiles(profiles);
	await deleteRecording({
		host: targetHost,
		id: latestRecording.id,
	});
	await savePendingProfileRestore({
		createdAt: new Date().toISOString(),
		host: targetHost,
		profile: refinedProfile,
		removedRecordingId: latestRecording.id,
	});

	const scheduledSync = scheduleSyncWithBridge(settings, {
		activeHost: targetHost,
		urgent: true,
	});
	if (scheduledSync) {
		void scheduledSync.catch((error: unknown) =>
			writeErrorDiagnostic("sync.afterUndoRecording", error, {
				context: {
					host: targetHost,
					recordingId: latestRecording.id,
				},
			}),
		);
	}
};

const AUTO_CAPTURE_TIMEOUT_MS = 3 * 60 * 1000;
const AUTO_CAPTURE_GRACE_MS = 10_000;
const AUTO_CAPTURE_POLL_MS = 2_000;
const COMMAND_ALARM_NAME = "harpist-command-poll";

let autoCaptureTimer: ReturnType<typeof setInterval> | null = null;

const clearAutoCaptureTimer = () => {
	if (autoCaptureTimer !== null) {
		clearInterval(autoCaptureTimer);
		autoCaptureTimer = null;
	}
};

/**
 * Watch an automatic login capture and stop it once the session-grant
 * signal is satisfied (plus a grace window so the post-login page finishes
 * its API calls), or after a hard timeout. The active debugger session
 * keeps the service worker alive for the duration, same as manual capture.
 */
const watchAutoCapture = (controller: Controller, host: string) => {
	const startedAt = Date.now();
	let graceDeadline: number | null = null;
	clearAutoCaptureTimer();
	autoCaptureTimer = setInterval(() => {
		if (!controller.state().recording) {
			clearAutoCaptureTimer();
			return;
		}
		const now = Date.now();
		if (
			graceDeadline === null &&
			captureAutoStopSignal(controller.entries(), host).satisfied
		) {
			graceDeadline = now + AUTO_CAPTURE_GRACE_MS;
		}
		if (
			(graceDeadline !== null && now >= graceDeadline) ||
			now - startedAt >= AUTO_CAPTURE_TIMEOUT_MS
		) {
			clearAutoCaptureTimer();
			void stopRecordingOnce(controller).catch((error: unknown) =>
				writeErrorDiagnostic("commands.autoCaptureStop", error, {
					context: { host },
				}),
			);
		}
	}, AUTO_CAPTURE_POLL_MS);
};

const executeCaptureAuth = async (payload: {
	host: string;
	loginUrl: string;
}) => {
	const url = new URL(payload.loginUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("capture-auth requires an http(s) login URL.");
	}
	const controller = await getCaptureController();
	if (controller.state().recording || activeRecording) {
		await browser.tabs.create({ active: true, url: url.toString() });
		throw new Error(
			"A recording is already in progress; opened the login page without auto-recording.",
		);
	}
	const tab = await browser.tabs.create({ active: true, url: url.toString() });
	if (tab.id === undefined) {
		throw new Error("Could not open a tab for the login page.");
	}
	await controller.start(tab.id);
	activeRecording = {
		host: payload.host,
		origin: `https://${payload.host}`,
		startedAt: new Date().toISOString(),
		tabId: tab.id,
		title: `Login capture — ${payload.host}`,
		url: url.toString(),
	};
	setBadge(true);
	watchAutoCapture(controller, payload.host);
};

let commandPullInFlight = false;

const pullAndRunCommands = async () => {
	if (commandPullInFlight) {
		return;
	}
	commandPullInFlight = true;
	try {
		const settings = await getSettings();
		const bridge = await connectBridge(settings);
		if (!bridge.active) {
			return;
		}
		const result = await bridge.client.commands.pull({
			consumerId: browser.runtime.id,
		});
		for (const command of result.commands) {
			try {
				if (command.kind === "capture-auth") {
					await executeCaptureAuth(command.payload);
				}
				await bridge.client.commands.complete({ id: command.id });
			} catch (error) {
				await bridge.client.commands
					.complete({ error: messageOf(error), id: command.id })
					.catch(() => undefined);
				await writeErrorDiagnostic("commands.execute", error, {
					context: {
						commandId: command.id,
						host: command.payload.host,
						kind: command.kind,
					},
				});
			}
		}
	} catch (error) {
		await writeErrorDiagnostic("commands.pull", error, {});
	} finally {
		commandPullInFlight = false;
	}
};

const handleExternalWake = (message: unknown, senderTabId?: number) => {
	if ((message as { type?: string } | null)?.type !== "PULL_COMMANDS") {
		return undefined;
	}
	setTimeout(() => {
		if (senderTabId !== undefined) {
			void browser.tabs.remove(senderTabId).catch(() => undefined);
		}
		void pullAndRunCommands();
	}, 300);
	return { ok: true };
};

const handleMessage = async (message: {
	activeHost?: string;
	host?: string;
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
			void getCaptureController()
				.then((controller) =>
					stopRecordingOnce(controller).catch((error: unknown) =>
						writeErrorDiagnostic("recording.stop", error, {
							context: {
								messageType: message.type ?? null,
							},
						}),
					),
				)
				.catch((error: unknown) => {
					void writeErrorDiagnostic("recording.stop.start", error, {
						context: {
							messageType: message.type ?? null,
						},
					});
				});
			return {
				ok: true,
			};
		}
		if (message.type === "GET_DEBUG_INFO") {
			return {
				data: await readDebugInfo(),
				ok: true,
			};
		}
		if (message.type === "UNDO_LATEST_RECORDING") {
			await undoLatestRecording(message.host);
			return {
				data: await readState(captureController),
				ok: true,
			};
		}
		if (message.type === "SYNC_BRIDGE") {
			const settings = await getSettings();
			const tab = await activeTab().catch(() => null);
			const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
			const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
			await (scheduleSyncWithBridge(settings, {
				activeHost: message.activeHost ?? docsHost ?? activePage?.host,
				force: true,
			}) ?? Promise.resolve());
			return {
				data: await readState(captureController),
				ok: true,
			};
		}
		if (message.type === "SCHEDULE_SYNC_BRIDGE") {
			const settings = await getSettings();
			const tab = await activeTab().catch(() => null);
			const docsHost = tab ? docsHostFromBridgeUrl(tab.url, settings) : null;
			const activePage = tab && !docsHost ? activePageFromTab(tab) : null;
			const activeHost = message.activeHost ?? docsHost ?? activePage?.host;
			const scheduledSync = scheduleSyncWithBridge(settings, {
				activeHost,
				urgent: true,
			});
			if (scheduledSync) {
				void scheduledSync.catch((error: unknown) =>
					writeErrorDiagnostic("sync.scheduled", error, {
						context: {
							activeHost: activeHost ?? null,
						},
					}),
				);
			}
			return {
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
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			void handleMessage(
				(message ?? {}) as {
					activeHost?: string;
					host?: string;
					settings?: Partial<HarpistSettings>;
					type?: string;
				},
			)
				.then(sendResponse)
				.catch((error: unknown) => {
					sendResponse({
						error: messageOf(error),
						ok: false,
					});
				});
			return true;
		});
		// Chrome: bridge-served loopback pages wake the service worker via
		// externally_connectable, so commands arrive without any polling.
		browser.runtime.onMessageExternal?.addListener((message, sender) =>
			Promise.resolve(handleExternalWake(message, sender.tab?.id)),
		);
		// Firefox has no externally_connectable; poll on the platform-minimum
		// alarm cadence instead. The bridge treats command pulls as
		// maintenance traffic, so this never keeps an idle bridge alive.
		if (import.meta.env.FIREFOX) {
			void browser.alarms?.create(COMMAND_ALARM_NAME, {
				periodInMinutes: 0.5,
			});
			browser.alarms?.onAlarm.addListener((alarm) => {
				if (alarm.name === COMMAND_ALARM_NAME) {
					void pullAndRunCommands();
				}
			});
		}
	},
});
