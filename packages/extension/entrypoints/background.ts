import { browser, defineBackground } from "#imports";
import {
	createHarpistBridgeClient,
	type HarpistBridgeClient,
} from "@harpist/core/bridge-client";
import { buildHar, hostOfEntries, type PendingEntry } from "@harpist/core/har";
import {
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
	SETTINGS_KEY,
	type StopResult,
	type SyncResult,
	summariseRecording,
} from "@harpist/core/profiles";
import {
	getRecordings,
	putRecording,
	putRecordings,
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
	const profiles = await getProfiles();
	const bridge = await connectBridge(settings);
	if (!bridge.active) {
		return {
			active: false,
			message: bridge.message,
			profiles,
			recordings: {},
		};
	}

	const recordings = await getRecordings();
	const candidates = Object.values(recordings).filter(
		(recording) => options.force || !recording.syncedAt,
	);
	try {
		const result =
			candidates.length > 0
				? await bridge.client.sync.pushExtensionSnapshot({
						activeHost: options.activeHost,
						extensionId: browser.runtime.id,
						profiles: Object.values(profiles),
						recordings: candidates.map(recordingForBridge),
					})
				: await bridge.client.sync.pullExtensionState({});
		const canonicalProfiles = profilesFromBridge(result.profiles);
		const syncedAt = "syncedAt" in result ? result.syncedAt : result.pulledAt;
		const appliedIds =
			"appliedRecordingIds" in result
				? new Set(result.appliedRecordingIds)
				: new Set<string>();
		const nextRecordings = { ...recordings };
		for (const [key, recording] of Object.entries(nextRecordings)) {
			if (options.force || appliedIds.has(recording.id)) {
				nextRecordings[key] = {
					...recording,
					syncedAt,
				};
			}
		}
		await saveProfiles(canonicalProfiles);
		await putRecordings(nextRecordings);
		return {
			active: true,
			message: "Bridge synced",
			profiles: canonicalProfiles,
			recordings: nextRecordings,
			syncedAt,
		};
	} catch (error) {
		return {
			active: true,
			message: `Bridge sync failed: ${messageOf(error)}`,
			profiles,
			recordings,
		};
	}
};

const readState = async (
	controller: Controller | null,
): Promise<PopupState> => {
	await clearLegacyRecordingStorage();
	const settings = await getSettings();
	const tab = await activeTab().catch(() => null);
	const activePage = tab ? activePageFromTab(tab) : null;
	const sync = await syncWithBridge(settings, {
		activeHost: activePage?.host,
	});
	return {
		activePage,
		activeRecording,
		bridge: {
			active: sync.active,
			lastSyncedAt: sync.syncedAt,
			message: sync.message,
			url: normaliseServerUrl(settings.serverUrl),
		},
		capture: controller?.state() ?? {
			entryCount: 0,
			recording: false,
			tabId: null,
		},
		profiles: sync.profiles,
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
	const sync = await syncWithBridge(settings, {
		activeHost: meta.host,
	});
	const syncedProfile = sync.profiles[meta.host] ?? profile;

	return {
		profile: syncedProfile,
		recording: summary.recording,
		synced: Boolean(sync.syncedAt),
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
			const activePage = tab ? activePageFromTab(tab) : null;
			await syncWithBridge(settings, {
				activeHost: activePage?.host,
				force: true,
			});
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
