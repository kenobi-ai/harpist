import {
	type ActiveRecording,
	activePageFromTab,
	authMethodsForProfile,
	type BackgroundResponse,
	buildAgentHandoffText,
	capturedAuthDetailLabel,
	DEFAULT_SETTINGS,
	type ExtensionDiagnostic,
	hostLabel,
	latestRecordingForProfile,
	latestRecordingNeedsRefinement,
	messageOf,
	normaliseServerUrl,
	type PopupState,
	PROFILES_KEY,
	type ProfileAccessMethod,
	type ProfilesStore,
	SETTINGS_KEY,
	type SiteProfile,
} from "@harpist/core/profiles";
import {
	ArrowCounterClockwiseIcon,
	BookOpenTextIcon,
	BridgeIcon,
	BroadcastIcon,
	CheckCircleIcon,
	CopyIcon,
	FingerprintIcon,
	GlobeIcon,
	KeyIcon,
	PencilSimpleLineIcon,
	RecordIcon,
	ShieldWarningIcon,
	StopCircleIcon,
	VoicemailIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "#imports";
import { AGENT_BRIDGE_START_COMMAND } from "../../lib/bridge";
import { copyText } from "../../lib/clipboard";
import { buildDebugSnapshot } from "../../lib/debug-snapshot";
import { writeErrorDiagnostic } from "../../lib/diagnostics";
import { selectPopupProfile } from "../../lib/profile-selection";

const MESSAGE_TIMEOUT_MS = 12_000;
const DIAGNOSTIC_MAX_AGE_MS = 2 * 60 * 1000;
const ACTIVE_RECORDING_KEY = "harpist.activeRecording";
const DEBUG_BUILD_MARKER = "popup-local-debug-v1";
const DIAGNOSTICS_KEY = "harpist.diagnostics";

const timeoutForMessage = (type?: string) =>
	type === "STOP_RECORDING" ? null : MESSAGE_TIMEOUT_MS;

const sendMessage = async <T,>(
	message: Record<string, unknown> & {
		type?: string;
	},
): Promise<BackgroundResponse<T>> => {
	let timeout: number | undefined;
	try {
		const timeoutMs = timeoutForMessage(message.type);
		if (timeoutMs === null) {
			return (await browser.runtime.sendMessage(
				message,
			)) as BackgroundResponse<T>;
		}
		return (await Promise.race([
			browser.runtime.sendMessage(message),
			new Promise<never>((_resolve, reject) => {
				timeout = window.setTimeout(
					() =>
						reject(
							new Error(
								`Harpist background timed out during ${
									message.type ?? "message"
								}.`,
							),
						),
					timeoutMs,
				);
			}),
		])) as BackgroundResponse<T>;
	} finally {
		if (timeout) {
			window.clearTimeout(timeout);
		}
	}
};

type WorkflowStatus =
	| "Bridge active"
	| "Bridge offline"
	| "Checking bridge"
	| "Complete"
	| "Finishing recording"
	| "No recording"
	| "Ready for agent"
	| "Recording in progress";

const DEFAULT_SPRITE_FRAME = 12;
const FIRST_SPRITE_FRAME = 1;
const SPRITE_PATHS = [
	"/sprites/harpist-1.webp",
	"/sprites/harpist-2.webp",
	"/sprites/harpist-3.webp",
	"/sprites/harpist-4.webp",
	"/sprites/harpist-5.webp",
	"/sprites/harpist-6.webp",
	"/sprites/harpist-7.webp",
	"/sprites/harpist-8.webp",
	"/sprites/harpist-9.webp",
	"/sprites/harpist-10.webp",
	"/sprites/harpist-11.webp",
	"/sprites/harpist-12.webp",
	"/sprites/harpist-13.webp",
	"/sprites/harpist-14.webp",
	"/sprites/harpist-15.webp",
	"/sprites/harpist-16.webp",
] as const;
const LAST_SPRITE_FRAME = SPRITE_PATHS.length;

const spritePathForFrame = (frame: number) =>
	SPRITE_PATHS[
		Math.min(Math.max(frame, FIRST_SPRITE_FRAME), LAST_SPRITE_FRAME) - 1
	] ?? SPRITE_PATHS[DEFAULT_SPRITE_FRAME - 1];

const isRecentDiagnostic = (diagnostic: { at: string }) => {
	const at = Date.parse(diagnostic.at);
	return Number.isFinite(at) && Date.now() - at <= DIAGNOSTIC_MAX_AGE_MS;
};

const isMessageChannelClosedText = (message: string) =>
	message.includes("message channel closed before a response was received") ||
	message.includes("message port closed before a response was received");

const isAsyncMessageChannelClosedError = (error: unknown) =>
	isMessageChannelClosedText(messageOf(error));

const isAsyncMessageChannelClosedDiagnostic = (diagnostic: {
	message: string;
	operation: string;
}) =>
	diagnostic.operation === "popup.recordingAction" &&
	isMessageChannelClosedText(diagnostic.message);

const isUserFacingDiagnostic = (diagnostic: {
	level: "error" | "info" | "warn";
	message: string;
	operation: string;
}) => {
	if (isAsyncMessageChannelClosedDiagnostic(diagnostic)) {
		return false;
	}
	if (
		diagnostic.level === "warn" &&
		diagnostic.message.includes("took longer than expected")
	) {
		return false;
	}
	return diagnostic.level === "error" || diagnostic.level === "warn";
};

const isBackgroundTimeoutText = (message: string) =>
	message.includes("Harpist background timed out during");

const readLocalFallbackState = async (): Promise<PopupState> => {
	const [storage, tabs] = await Promise.all([
		browser.storage.local.get([
			ACTIVE_RECORDING_KEY,
			DIAGNOSTICS_KEY,
			PROFILES_KEY,
			SETTINGS_KEY,
		]),
		browser.tabs.query({
			active: true,
			currentWindow: true,
		}),
	]);
	const activeRecording =
		(storage[ACTIVE_RECORDING_KEY] as ActiveRecording | undefined) ?? null;
	const settings = {
		...DEFAULT_SETTINGS,
		...((storage[SETTINGS_KEY] as Partial<typeof DEFAULT_SETTINGS>) ?? {}),
	};
	return {
		activeDocumentation: null,
		activePage: activePageFromTab(tabs[0] ?? {}) ?? activeRecording,
		activeRecording,
		bridge: {
			active: false,
			availability: "checking",
			message: "Background busy",
			pendingRecordingCount: 0,
			syncing: false,
			url: normaliseServerUrl(settings.serverUrl),
		},
		capture: {
			entryCount: 0,
			recording: Boolean(activeRecording),
			stopping: false,
			tabCount: activeRecording ? 1 : 0,
			tabId: activeRecording?.tabId ?? null,
		},
		diagnostics:
			(storage[DIAGNOSTICS_KEY] as ExtensionDiagnostic[] | undefined) ?? [],
		profiles: (storage[PROFILES_KEY] as ProfilesStore | undefined) ?? {},
		settings,
	};
};

function App() {
	const [state, setState] = useState<PopupState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [bridgeCommandCopied, setBridgeCommandCopied] = useState(false);
	const [debugCopied, setDebugCopied] = useState(false);
	const [handoffCopied, setHandoffCopied] = useState(false);
	const [spriteState, setSpriteState] = useState({
		direction: 1,
		frame: DEFAULT_SPRITE_FRAME,
	});
	const stateRef = useRef<PopupState | null>(null);

	const load = useCallback(async () => {
		try {
			const response = await sendMessage<PopupState>({
				type: "GET_STATE",
			});
			if (!(response.ok && response.data)) {
				throw new Error(response.error ?? "Could not read Harpist state.");
			}
			stateRef.current = response.data;
			setState(response.data);
			setError(null);
		} catch (loadError) {
			if (stateRef.current && isBackgroundTimeoutText(messageOf(loadError))) {
				return;
			}
			const fallbackState = await readLocalFallbackState();
			stateRef.current = fallbackState;
			setState(fallbackState);
			if (isBackgroundTimeoutText(messageOf(loadError))) {
				setError(null);
				return;
			}
			throw loadError;
		}
	}, []);

	useEffect(() => {
		void load().catch((loadError: unknown) => {
			setError(messageOf(loadError));
			void writeErrorDiagnostic("popup.loadState", loadError);
		});
		const timer = window.setInterval(() => {
			void load().catch(() => undefined);
		}, 1500);
		return () => window.clearInterval(timer);
	}, [load]);
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const documentation = state?.activeDocumentation ?? null;
	const activeHost = state?.activePage?.host ?? null;
	const profile = state
		? selectPopupProfile({
				activeHost,
				documentationHost: documentation?.host,
				profiles: state.profiles,
			})
		: undefined;
	const isStopping = state?.capture.stopping ?? false;
	const isRecording = state?.capture.recording ?? false;
	const bridgeOnline = state?.bridge.availability === "online";
	const profileHost = profile?.host ?? null;
	const needsRefinement = latestRecordingNeedsRefinement(profile);
	useEffect(() => {
		for (const path of SPRITE_PATHS) {
			const image = new Image();
			image.src = browser.runtime.getURL(path);
		}
	}, []);
	useEffect(() => {
		if (!isRecording) {
			setSpriteState({
				direction: 1,
				frame: DEFAULT_SPRITE_FRAME,
			});
			return;
		}
		setSpriteState({
			direction: 1,
			frame: DEFAULT_SPRITE_FRAME,
		});
		const timer = window.setInterval(() => {
			setSpriteState((current) => {
				if (current.frame >= LAST_SPRITE_FRAME) {
					return {
						direction: -1,
						frame: LAST_SPRITE_FRAME - 1,
					};
				}
				if (current.frame <= FIRST_SPRITE_FRAME) {
					return {
						direction: 1,
						frame: FIRST_SPRITE_FRAME + 1,
					};
				}
				return {
					direction: current.direction,
					frame: current.frame + current.direction,
				};
			});
		}, 120);
		return () => window.clearInterval(timer);
	}, [isRecording]);
	useEffect(() => {
		setHandoffCopied(false);
	}, [profileHost]);
	useEffect(() => {
		if (state?.bridge.availability === "online") {
			setBridgeCommandCopied(false);
		}
	}, [state?.bridge.availability]);

	const copyDebugInfo = () => {
		const debugInfo = {
			build: DEBUG_BUILD_MARKER,
			error,
			generatedAt: new Date().toISOString(),
			location: window.location.href,
			manifest: browser.runtime.getManifest(),
			runtimeId: browser.runtime.id,
			state: buildDebugSnapshot(stateRef.current),
		};
		void copyText(JSON.stringify(debugInfo, null, 2))
			.then(() => setDebugCopied(true))
			.catch((copyError: unknown) => {
				setError(`Could not copy debug info: ${messageOf(copyError)}`);
			});
	};
	const copyBridgeCommand = () => {
		void copyText(AGENT_BRIDGE_START_COMMAND)
			.then(() => setBridgeCommandCopied(true))
			.catch((copyError: unknown) => {
				setError(`Could not copy bridge command: ${messageOf(copyError)}`);
			});
	};
	const status = workflowStatus(
		isRecording,
		isStopping,
		state?.bridge.availability ?? "checking",
		profile,
		handoffCopied,
	);
	const endpointCount =
		profile?.derivedEndpointCount || profile?.scannedEndpointCount || 0;
	const authMethods = authMethodsForProfile(profile);
	const capturedAuthDetail = capturedAuthDetailLabel(profile);
	const host = !state
		? "Checking website"
		: isRecording
			? state.activeRecording?.host
			: (documentation?.host ??
				(needsRefinement ? profile?.host : undefined) ??
				activeHost ??
				profile?.host);
	const bridgeMessage = state?.bridge.syncing
		? state.bridge.pendingRecordingCount
			? `Syncing ${state.bridge.pendingRecordingCount} recording${
					state.bridge.pendingRecordingCount === 1 ? "" : "s"
				}`
			: "Refreshing bridge"
		: activeHost && !profile
			? state?.bridge.availability === "online"
				? "No recording for this site"
				: (state?.bridge.message ?? "Bridge not checked")
			: state?.bridge.availability === "offline"
				? (state.bridge.message ?? "Bridge offline")
				: (profile?.lastBridgeMessage ??
					state?.bridge.message ??
					"Bridge not checked");
	const supportingContentLocked = isRecording || isStopping || !profile;
	const showBridgeUnavailable =
		state?.bridge.availability === "offline" &&
		Boolean(profile) &&
		!needsRefinement &&
		!isRecording &&
		!isStopping;
	const spriteUrl = browser.runtime.getURL(
		spritePathForFrame(spriteState.frame),
	);
	const latestDiagnostic = state?.diagnostics.find(
		(diagnostic) =>
			isRecentDiagnostic(diagnostic) && isUserFacingDiagnostic(diagnostic),
	);

	const runRecordingAction = async () => {
		setBusy(true);
		setError(null);
		try {
			if (isStopping) {
				return;
			}
			if (isRecording) {
				const response = await sendMessage<PopupState>({
					type: "STOP_RECORDING",
				});
				if (!response.ok) {
					throw new Error(response.error ?? "Could not stop recording.");
				}
				if (response.data) {
					setState(response.data);
				} else {
					await load();
				}
				setHandoffCopied(false);
			} else {
				const response = await sendMessage<PopupState>({
					type: "START_RECORDING",
				});
				if (!response.ok) {
					throw new Error(response.error ?? "Could not start recording.");
				}
				if (response.data) {
					setState(response.data);
				} else {
					await load();
				}
				setHandoffCopied(false);
			}
		} catch (actionError) {
			if (isRecording && isAsyncMessageChannelClosedError(actionError)) {
				await load().catch(() => undefined);
				return;
			}
			setError(
				isRecording && messageOf(actionError).includes("STOP_RECORDING")
					? "Still finishing recording. Harpist is saving a large capture."
					: messageOf(actionError),
			);
			void writeErrorDiagnostic("popup.recordingAction", actionError, {
				context: {
					action: isRecording ? "stop" : "start",
				},
			});
		} finally {
			setBusy(false);
		}
	};

	const openDocs = async (selected?: SiteProfile) => {
		if (!(selected && bridgeOnline)) {
			return;
		}
		await browser.tabs.create({
			url:
				selected.remoteDocsUrl ??
				`${normaliseServerUrl(
					state.settings.serverUrl,
				)}/profiles/${encodeURIComponent(selected.host)}/docs`,
		});
	};

	const openSiteToRecordMore = async () => {
		if (!documentation) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await browser.tabs.create({
				active: true,
				url: documentation.siteUrl,
			});
			const activePage = activePageFromTab({
				title: profile?.host ?? documentation.host,
				url: documentation.siteUrl,
			});
			setState((current) =>
				current
					? {
							...current,
							activeDocumentation: null,
							activePage,
						}
					: current,
			);
			await load();
		} catch (actionError) {
			setError(messageOf(actionError));
			void writeErrorDiagnostic("popup.openSiteToRecordMore", actionError);
		} finally {
			setBusy(false);
		}
	};

	const recordMore = async () => {
		if (!(profile && state)) {
			return;
		}
		if (state.activePage?.host === profile.host) {
			await runRecordingAction();
			return;
		}
		const sourceUrl =
			latestRecordingForProfile(profile)?.sourceUrl ?? profile.origin;
		setBusy(true);
		setError(null);
		try {
			await browser.tabs.create({
				active: true,
				url: sourceUrl,
			});
		} catch (actionError) {
			setError(messageOf(actionError));
			void writeErrorDiagnostic("popup.openRecordedSite", actionError, {
				context: { host: profile.host },
			});
		} finally {
			setBusy(false);
		}
	};

	const copyHandoff = async () => {
		if (!(profile && state)) {
			return;
		}
		try {
			await copyText(
				buildAgentHandoffText(
					state.profiles[profile.host] ?? profile,
					state.settings,
				),
			);
			setHandoffCopied(true);
		} catch (copyError) {
			setError(messageOf(copyError));
			void writeErrorDiagnostic("popup.copyHandoff", copyError, {
				context: {
					host: profile.host,
				},
			});
		}
	};

	const undoLatestRecording = async () => {
		if (!profile) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const response = await sendMessage<PopupState>({
				host: profile.host,
				type: "UNDO_LATEST_RECORDING",
			});
			if (!(response.ok && response.data)) {
				throw new Error(response.error ?? "Could not undo recording.");
			}
			setState(response.data);
			setHandoffCopied(false);
		} catch (undoError) {
			setError(messageOf(undoError));
			void writeErrorDiagnostic("popup.undoLatestRecording", undoError, {
				context: {
					host: profile.host,
				},
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<main className="w-[360px] bg-olive-900 p-3 text-zinc-950 font-sans">
			<section className="rounded-xs bg-amber-50 border border-emerald-800">
				<header className="relative overflow-hidden text-white border-b border-emerald-950 bg-emerald-900 before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:130px_130px] before:opacity-45 before:mix-blend-overlay before:content-[''] p-1">
					<div className="relative z-10 flex items-start justify-between gap-3">
						<div className="min-w-0 pl-4 py-2">
							<p className="font-display text-4xl leading-none text-amber-50">
								Harpist
							</p>
							<p className="mt-1 truncate text-sm text-emerald-50/75">
								{hostLabel(host)}
							</p>
						</div>
						<div className="flex size-20 shrink-0 items-center justify-center overflow-hidden bg-amber-50 rounded-xs p-1">
							<img
								alt=""
								className="size-full object-contain"
								src={spriteUrl}
							/>
						</div>
					</div>
				</header>

				<div className="space-y-4 p-4">
					{error ? (
						<div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm">
							<WarningCircleIcon className="mt-0.5 shrink-0" size={16} />
							<div className="min-w-0 flex-1 space-y-2">
								<span className="block min-w-0 break-words">{error}</span>
								<button
									className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-rose-900/20 bg-white/70 px-2 font-bold text-rose-900 text-xs transition hover:bg-white"
									onClick={() => void copyDebugInfo()}
									type="button"
								>
									<CopyIcon size={13} />
									{debugCopied ? "Debug copied" : "Copy debug"}
								</button>
							</div>
						</div>
					) : null}

					{!error && latestDiagnostic ? (
						<div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-100 px-3 py-2 text-amber-950 text-xs">
							<WarningCircleIcon className="mt-0.5 shrink-0" size={15} />
							<div className="min-w-0 flex-1 space-y-2">
								<span className="block min-w-0 break-words">
									Last issue: {latestDiagnostic.operation}:{" "}
									{latestDiagnostic.message}
								</span>
								<button
									className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-amber-900/20 bg-amber-50 px-2 font-bold text-amber-900 transition hover:bg-white"
									onClick={() => void copyDebugInfo()}
									type="button"
								>
									<CopyIcon size={13} />
									{debugCopied ? "Debug copied" : "Copy debug"}
								</button>
							</div>
						</div>
					) : null}

					{showBridgeUnavailable ? (
						<BridgeUnavailableNotice
							copied={bridgeCommandCopied}
							onCopy={copyBridgeCommand}
						/>
					) : null}

					{documentation ? (
						<DocumentationPane
							busy={busy}
							onGoToSite={() => void openSiteToRecordMore()}
						/>
					) : needsRefinement && profile ? (
						<div className="relative min-h-[230px]">
							<div
								aria-hidden
								className="pointer-events-none select-none space-y-4 blur-[2px] opacity-35"
							>
								<MetadataLine
									authHint={capturedAuthDetail}
									endpointCount={String(endpointCount)}
									methods={authMethods}
								/>
								<div className="grid grid-cols-2 gap-2">
									<ActionButton disabled icon="Docs" label="Docs" />
									<ActionButton disabled icon="Prompt" label="Agent prompt" />
								</div>
								<div className="flex items-center justify-between gap-2 pt-1">
									<p className="min-w-0 truncate text-xs text-amber-900/70">
										{bridgeMessage}
									</p>
									<StatusBadge status={status} />
								</div>
							</div>
							<RecordingReadyPane
								busy={busy}
								handoffCopied={handoffCopied}
								onCopy={() => void copyHandoff()}
								onRecordMore={() => void recordMore()}
								onUndo={() => void undoLatestRecording()}
								recordMoreLabel={
									state?.activePage?.host === profile.host
										? "Record more"
										: "Open recorded site"
								}
							/>
						</div>
					) : (
						<>
							<button
								className="relative isolate inline-flex h-12 w-full translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-rose-900/30 bg-rose-300 px-3 font-bold text-rose-950 text-sm shadow-[0_4px_0_#9f1239,0_8px_14px_rgb(127_29_29/0.14),inset_0_1px_0_rgb(255_255_255/0.48)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.22] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/55 after:content-[''] hover:translate-y-[2px] hover:bg-rose-200 hover:shadow-[0_3px_0_#9f1239,0_6px_11px_rgb(127_29_29/0.13),inset_0_1px_0_rgb(255_255_255/0.5)] active:translate-y-[3px] active:shadow-[0_1px_0_#9f1239,0_3px_7px_rgb(127_29_29/0.11),inset_0_1px_0_rgb(255_255_255/0.45)] disabled:cursor-not-allowed disabled:opacity-45"
								disabled={
									busy || isStopping || !(state?.activePage || isRecording)
								}
								onClick={() => void runRecordingAction()}
								type="button"
							>
								<span className="relative z-10 inline-flex items-center gap-2">
									{isRecording ? (
										<StopCircleIcon size={18} weight="fill" />
									) : (
										<VoicemailIcon size={18} weight="fill" />
									)}
									{busy
										? "Working"
										: isStopping
											? "Finishing"
											: isRecording
												? "Finish recording"
												: "Add recording"}
								</span>
							</button>
							{isRecording ? (
								<p className="mt-2 text-center text-amber-900/75 text-xs leading-relaxed">
									Chrome shows its notice in every tab. Harpist captures only
									this tab and tabs it opens
									{state?.capture.tabCount
										? ` (${state.capture.tabCount} tab${
												state.capture.tabCount === 1 ? "" : "s"
											})`
										: ""}
									. Finish here or press Cancel in Chrome.
								</p>
							) : null}

							<div
								aria-hidden={supportingContentLocked}
								className={`space-y-4 transition-[filter,opacity] duration-200 ease-out ${
									supportingContentLocked
										? "pointer-events-none select-none blur-[2px] opacity-55"
										: ""
								}`}
							>
								<MetadataLine
									authHint={capturedAuthDetail}
									endpointCount={String(endpointCount)}
									methods={authMethods}
								/>

								<div className="grid grid-cols-2 gap-2">
									<button
										className="relative isolate inline-flex h-11 translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/35 bg-amber-500 font-bold text-amber-950 text-sm shadow-[0_4px_0_#92400e,0_7px_12px_rgb(120_53_15/0.14),inset_0_1px_0_rgb(255_255_255/0.42)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.2] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/50 after:content-[''] hover:translate-y-[2px] hover:bg-amber-400 hover:shadow-[0_3px_0_#92400e,0_5px_9px_rgb(120_53_15/0.13),inset_0_1px_0_rgb(255_255_255/0.48)] active:translate-y-[3px] active:shadow-[0_1px_0_#92400e,0_3px_6px_rgb(120_53_15/0.11),inset_0_1px_0_rgb(255_255_255/0.42)] disabled:cursor-not-allowed disabled:opacity-45"
										disabled={
											!profile || supportingContentLocked || !bridgeOnline
										}
										onClick={() => void openDocs(profile)}
										type="button"
									>
										<span className="relative z-10 inline-flex items-center gap-2">
											<BookOpenTextIcon size={16} />
											Docs
										</span>
									</button>
									<button
										className="relative isolate inline-flex h-11 translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/25 bg-amber-100 font-bold text-amber-900 text-sm shadow-[0_3px_0_rgb(120_53_15/0.55),0_6px_10px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.7)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.18] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/70 after:content-[''] hover:translate-y-[2px] hover:bg-amber-50 hover:shadow-[0_2px_0_rgb(120_53_15/0.5),0_4px_8px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.72)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(120_53_15/0.45),0_2px_5px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.68)] disabled:cursor-not-allowed disabled:opacity-45"
										disabled={!profile || supportingContentLocked}
										onClick={() => void copyHandoff()}
										type="button"
									>
										<span className="relative z-10 inline-flex items-center gap-2">
											{handoffCopied ? (
												<CheckCircleIcon size={16} weight="fill" />
											) : (
												<CopyIcon size={16} />
											)}
											{handoffCopied ? "Prompt copied" : "Agent prompt"}
										</span>
									</button>
								</div>

								<div className="flex items-center justify-between gap-2 pt-1">
									<p className="min-w-0 truncate text-xs text-amber-900/70">
										{bridgeMessage}
									</p>
									<StatusBadge status={status} />
								</div>
							</div>
						</>
					)}
				</div>
			</section>
		</main>
	);
}

function BridgeUnavailableNotice({
	copied,
	onCopy,
}: {
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<section className="rounded-md border border-amber-900/30 bg-amber-100 p-3 text-amber-950 shadow-sm">
			<div className="flex items-start gap-2">
				<BridgeIcon className="mt-0.5 shrink-0" size={18} weight="fill" />
				<div className="min-w-0 flex-1">
					<p className="font-bold text-sm">Bridge offline</p>
					<p className="mt-1 text-xs leading-relaxed">
						Ask your agent to start the Harpist bridge. Docs will appear once it
						reconnects.
					</p>
					<code className="mt-2 block break-all rounded-sm bg-amber-950/10 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
						{AGENT_BRIDGE_START_COMMAND}
					</code>
					<button
						className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-sm border border-amber-900/25 bg-amber-50 px-2.5 font-bold text-amber-900 text-xs transition hover:bg-white"
						onClick={onCopy}
						type="button"
					>
						{copied ? (
							<CheckCircleIcon size={14} weight="fill" />
						) : (
							<CopyIcon size={14} />
						)}
						{copied ? "Command copied" : "Copy command"}
					</button>
				</div>
			</div>
		</section>
	);
}

function DocumentationPane({
	busy,
	onGoToSite,
}: {
	busy: boolean;
	onGoToSite: () => void;
}) {
	return (
		<section className="space-y-4 py-2 text-center text-amber-900">
			<div className="mx-auto flex size-12 items-center justify-center rounded-sm bg-amber-900/10">
				<BookOpenTextIcon size={24} weight="fill" />
			</div>
			<p className="font-bold text-lg leading-tight">Viewing documentation</p>
			<button
				className="relative isolate inline-flex h-12 w-full translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-rose-900/30 bg-rose-300 px-3 font-bold text-rose-950 text-sm shadow-[0_4px_0_#9f1239,0_8px_14px_rgb(127_29_29/0.14),inset_0_1px_0_rgb(255_255_255/0.48)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.22] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/55 after:content-[''] hover:translate-y-[2px] hover:bg-rose-200 hover:shadow-[0_3px_0_#9f1239,0_6px_11px_rgb(127_29_29/0.13),inset_0_1px_0_rgb(255_255_255/0.5)] active:translate-y-[3px] active:shadow-[0_1px_0_#9f1239,0_3px_7px_rgb(127_29_29/0.11),inset_0_1px_0_rgb(255_255_255/0.45)] disabled:cursor-not-allowed disabled:opacity-45"
				disabled={busy}
				onClick={onGoToSite}
				type="button"
			>
				<span className="relative z-10 inline-flex items-center gap-2">
					<GlobeIcon size={18} weight="fill" />
					{busy ? "Working" : "Go to site to record more"}
				</span>
			</button>
		</section>
	);
}

function RecordingReadyPane({
	busy,
	handoffCopied,
	onCopy,
	onRecordMore,
	onUndo,
	recordMoreLabel,
}: {
	busy: boolean;
	handoffCopied: boolean;
	onCopy: () => void;
	onRecordMore: () => void;
	onUndo: () => void;
	recordMoreLabel: "Open recorded site" | "Record more";
}) {
	return (
		<section className="absolute inset-0 z-10 flex flex-col justify-center rounded-md border border-amber-900/25 bg-amber-50/95 p-3 text-amber-950 shadow-sm">
			<div className="flex items-center justify-center gap-2 font-bold text-sm">
				<CheckCircleIcon size={16} weight="fill" />
				<span>Recording ready</span>
			</div>
			<p className="mt-1 text-center text-amber-900/75 text-xs leading-relaxed">
				Saved on this device. Copy the prompt into your agent; recording sync
				happens separately.
			</p>
			<div className="mt-3 [&>button]:w-full [&>button]:!h-12 [&>button]:!border-rose-900/30 [&>button]:!bg-rose-300 [&>button]:!text-rose-950">
				<button
					className="relative isolate inline-flex h-11 translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/25 bg-amber-100 font-bold text-amber-900 text-sm shadow-[0_3px_0_rgb(120_53_15/0.55),0_6px_10px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.7)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.18] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:inset-x-0 after:top-0 after:h-px after:bg-white/70 after:content-[''] hover:translate-y-[2px] hover:bg-amber-50 hover:shadow-[0_2px_0_rgb(120_53_15/0.5),0_4px_8px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.72)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(120_53_15/0.45),0_2px_5px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.68)] disabled:cursor-not-allowed disabled:opacity-45"
					disabled={busy}
					onClick={onCopy}
					type="button"
				>
					<span className="relative z-10 inline-flex items-center gap-2">
						{handoffCopied ? (
							<CheckCircleIcon size={16} weight="fill" />
						) : (
							<CopyIcon size={16} />
						)}
						{handoffCopied ? "Prompt copied" : "Copy agent prompt"}
					</span>
				</button>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2">
				<button
					className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-amber-900/20 bg-amber-900/5 px-3 font-bold text-amber-900 text-xs transition hover:bg-amber-900/10 disabled:cursor-not-allowed disabled:opacity-45"
					disabled={busy}
					onClick={onRecordMore}
					type="button"
				>
					<span className="relative z-10 inline-flex items-center gap-2">
						<VoicemailIcon size={16} weight="fill" />
						{recordMoreLabel}
					</span>
				</button>
				<button
					className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-amber-900/20 bg-amber-900/5 px-3 font-bold text-amber-900 text-xs transition hover:bg-amber-900/10 disabled:cursor-not-allowed disabled:opacity-45"
					disabled={busy}
					onClick={onUndo}
					type="button"
				>
					<ArrowCounterClockwiseIcon size={14} />
					Undo recording
				</button>
			</div>
		</section>
	);
}

function ActionButton({
	disabled,
	icon,
	label,
}: {
	disabled?: boolean;
	icon: "Docs" | "Prompt";
	label: string;
}) {
	const Icon = icon === "Docs" ? BookOpenTextIcon : CopyIcon;
	return (
		<button
			className="relative isolate inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/25 bg-amber-100 font-bold text-amber-900 text-sm shadow-[0_3px_0_rgb(120_53_15/0.55),0_6px_10px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.7)] disabled:cursor-not-allowed disabled:opacity-45"
			disabled={disabled}
			type="button"
		>
			<Icon size={16} />
			{label}
		</button>
	);
}

const workflowStatus = (
	isRecording: boolean,
	isStopping: boolean,
	bridgeAvailability: PopupState["bridge"]["availability"],
	profile?: SiteProfile,
	handoffCopied?: boolean,
): WorkflowStatus => {
	if (isStopping) {
		return "Finishing recording";
	}
	if (isRecording) {
		return "Recording in progress";
	}
	if (!profile) {
		return "No recording";
	}
	if (bridgeAvailability === "checking") {
		return "Checking bridge";
	}
	if (bridgeAvailability === "offline") {
		return "Bridge offline";
	}
	if (latestRecordingNeedsRefinement(profile)) {
		return "Ready for agent";
	}
	if (handoffCopied) {
		return "Complete";
	}
	return "Bridge active";
};

function StatusBadge({ status }: { status: WorkflowStatus }) {
	const statusView = {
		"Bridge active": {
			className: "bg-emerald-900/10 text-emerald-700",
			Icon: BridgeIcon,
		},
		"Bridge offline": {
			className: "bg-rose-900/10 text-rose-700",
			Icon: WarningCircleIcon,
		},
		"Checking bridge": {
			className: "bg-amber-900/10 text-amber-900",
			Icon: BridgeIcon,
		},
		Complete: {
			className: "bg-emerald-900/10 text-emerald-700",
			Icon: CheckCircleIcon,
		},
		"Finishing recording": {
			className: "bg-rose-900/10 text-rose-700",
			Icon: StopCircleIcon,
		},
		"Ready for agent": {
			className: "bg-emerald-900/10 text-emerald-700",
			Icon: CheckCircleIcon,
		},
		"No recording": {
			className: "bg-amber-900/10 text-amber-900",
			Icon: RecordIcon,
		},
		"Recording in progress": {
			className: "bg-rose-900/10 text-rose-700",
			Icon: BroadcastIcon,
		},
	} satisfies Record<
		WorkflowStatus,
		{
			Icon: typeof CheckCircleIcon;
			className: string;
		}
	>;
	const { Icon, className } = statusView[status];

	return (
		<div
			className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold text-[11px] leading-tight ${className}`}
		>
			<Icon className="shrink-0" size={13} weight="fill" />
			{status}
		</div>
	);
}

const accessMethodView = (method: ProfileAccessMethod) => {
	if (method.label === "Browser session") {
		return {
			Icon: FingerprintIcon,
			label: "Browser session",
		};
	}
	if (method.label === "Browser context write") {
		return {
			Icon: PencilSimpleLineIcon,
			label: "Browser writes",
		};
	}
	if (method.label === "Browser context") {
		return {
			Icon: GlobeIcon,
			label: "Browser reads",
		};
	}
	if (method.label === "Browser challenge") {
		return {
			Icon: ShieldWarningIcon,
			label: "Challenge",
		};
	}
	if (method.label === "Public client key") {
		return {
			Icon: KeyIcon,
			label: "Client key",
		};
	}
	if (method.type === "session-cookie" || method.type === "cookie-csrf") {
		return {
			Icon: FingerprintIcon,
			label: "Session cookie",
		};
	}
	return {
		Icon: KeyIcon,
		label: method.label,
	};
};

function MetadataLine({
	authHint,
	endpointCount,
	methods,
}: {
	authHint?: string;
	endpointCount: string;
	methods: ProfileAccessMethod[];
}) {
	const methodViews = methods.map((method) => ({
		method,
		view: accessMethodView(method),
	}));
	return (
		<section className="grid min-w-0 grid-cols-[1fr_2fr] gap-3 py-2 text-amber-900">
			<div className="min-w-0">
				<p className="text-center font-semibold text-[9px] text-amber-900/60 uppercase">
					~~ Endpoints ~~
				</p>
				<p className="mt-1 text-center font-bold text-xl leading-none">
					{endpointCount}
				</p>
			</div>
			<div className="min-w-0">
				<p className="text-left font-semibold text-[9px] text-amber-900/60 uppercase">
					~~ Authentication ~~
				</p>
				<div className="mt-1 space-y-1">
					{methodViews.length === 0 ? (
						<p className="min-w-0 break-words font-semibold text-[13px] leading-4">
							Not analyzed
						</p>
					) : (
						methodViews.map(({ method, view }) => {
							const MethodIcon = view.Icon;
							return (
								<div
									className="flex min-w-0 items-center gap-1.5"
									key={`${method.type}:${method.label}`}
								>
									<MethodIcon
										className="shrink-0 text-amber-900/70"
										size={13}
									/>
									<span className="min-w-0 break-words font-semibold text-[13px] leading-4">
										{view.label}
									</span>
									{method.count > 0 ? (
										<span className="shrink-0 rounded-sm bg-amber-900/10 px-1.5 py-0.5 text-[9px] leading-none text-amber-900/75">
											{method.count}
										</span>
									) : null}
								</div>
							);
						})
					)}
				</div>
				{authHint && methods.length <= 1 ? (
					<p className="mt-1 break-words text-[10px] text-amber-900/60 leading-snug">
						{authHint}
					</p>
				) : null}
			</div>
		</section>
	);
}

export default App;
