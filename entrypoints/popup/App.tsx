import {
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
import { useCallback, useEffect, useState } from "react";
import { browser } from "#imports";
import {
	authMethodsForProfile,
	type BackgroundResponse,
	buildAgentHandoffText,
	capturedAuthDetailLabel,
	hostLabel,
	messageOf,
	normaliseServerUrl,
	type PopupState,
	type ProfileAccessMethod,
	type SiteProfile,
	type StopResult,
} from "../../lib/profiles";

const sendMessage = async <T,>(
	message: object,
): Promise<BackgroundResponse<T>> =>
	(await browser.runtime.sendMessage(message)) as BackgroundResponse<T>;

type WorkflowStatus =
	| "Bridge active"
	| "Complete"
	| "No recording"
	| "Recording in progress"
	| "Waiting for handoff";

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

function App() {
	const [state, setState] = useState<PopupState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [handoffCopied, setHandoffCopied] = useState(false);
	const [spriteState, setSpriteState] = useState({
		direction: 1,
		frame: DEFAULT_SPRITE_FRAME,
	});

	const load = useCallback(async () => {
		const response = await sendMessage<PopupState>({
			type: "GET_STATE",
		});
		if (!response.ok || !response.data) {
			throw new Error(response.error ?? "Could not read Harpist state.");
		}
		setState(response.data);
		setError(null);
	}, []);

	useEffect(() => {
		void load().catch((loadError: unknown) => setError(messageOf(loadError)));
		const timer = window.setInterval(() => {
			void load().catch(() => undefined);
		}, 1500);
		return () => window.clearInterval(timer);
	}, [load]);

	const activeHost = state?.activePage?.host ?? null;
	const activeProfile = activeHost ? state?.profiles[activeHost] : undefined;
	const latestProfile = state
		? Object.values(state.profiles).sort((left, right) =>
				right.updatedAt.localeCompare(left.updatedAt),
			)[0]
		: undefined;
	const profile = activeHost ? activeProfile : latestProfile;
	const isRecording = state?.capture.recording ?? false;
	const profileHost = profile?.host ?? null;
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
			return undefined;
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset copied state whenever the selected profile changes.
	useEffect(() => {
		setHandoffCopied(false);
	}, [profileHost]);
	const status = workflowStatus(
		isRecording,
		state?.bridge.active ?? false,
		profile,
		handoffCopied,
	);
	const endpointCount =
		profile?.derivedEndpointCount || profile?.scannedEndpointCount || 0;
	const authMethods = authMethodsForProfile(profile);
	const capturedAuthDetail = capturedAuthDetailLabel(profile);
	const host = isRecording
		? state?.activeRecording?.host
		: (activeHost ?? profile?.host);
	const bridgeMessage =
		activeHost && !profile
			? state?.bridge.active
				? "No recording for this site"
				: "Bridge not checked"
			: (profile?.lastBridgeMessage ??
				state?.bridge.message ??
				"Bridge not checked");
	const supportingContentLocked = isRecording || !profile;
	const spriteUrl = browser.runtime.getURL(
		spritePathForFrame(spriteState.frame),
	);

	const runRecordingAction = async () => {
		setBusy(true);
		setError(null);
		try {
			if (isRecording) {
				const response = await sendMessage<StopResult>({
					type: "STOP_RECORDING",
				});
				if (!response.ok) {
					throw new Error(response.error ?? "Could not stop recording.");
				}
			} else {
				const response = await sendMessage<PopupState>({
					type: "START_RECORDING",
				});
				if (!response.ok) {
					throw new Error(response.error ?? "Could not start recording.");
				}
				setHandoffCopied(false);
			}
			await load();
		} catch (actionError) {
			setError(messageOf(actionError));
		} finally {
			setBusy(false);
		}
	};

	const openDocs = async (selected?: SiteProfile) => {
		if (!selected) {
			return;
		}
		const hash = `#${encodeURIComponent(selected.host)}`;
		await browser.tabs.create({
			url:
				selected.remoteDocsUrl ??
				(state?.bridge.active
					? `${normaliseServerUrl(
							state.settings.serverUrl,
						)}/profiles/${encodeURIComponent(selected.host)}/docs`
					: browser.runtime.getURL(`/dashboard.html${hash}`)),
		});
	};

	const copyHandoff = async () => {
		if (!profile || !state) {
			return;
		}
		const syncResponse = await sendMessage<PopupState>({
			type: "SYNC_BRIDGE",
		});
		const nextState =
			syncResponse.ok && syncResponse.data ? syncResponse.data : state;
		if (syncResponse.ok && syncResponse.data) {
			setState(syncResponse.data);
		}
		await navigator.clipboard.writeText(
			buildAgentHandoffText(
				nextState.profiles[profile.host] ?? profile,
				nextState.settings,
			),
		);
		setHandoffCopied(true);
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
								src={spriteUrl}
								alt=""
								className="size-full object-contain"
							/>
						</div>
					</div>
				</header>

				<div className="space-y-4 p-4">
					{error ? (
						<div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm">
							<WarningCircleIcon className="mt-0.5 shrink-0" size={16} />
							<span>{error}</span>
						</div>
					) : null}

					<button
						type="button"
						onClick={() => void runRecordingAction()}
						disabled={busy || (!state?.activePage && !isRecording)}
						className="relative isolate inline-flex h-12 w-full translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-rose-900/30 bg-rose-300 px-3 font-bold text-rose-950 text-sm shadow-[0_4px_0_#9f1239,0_8px_14px_rgb(127_29_29/0.14),inset_0_1px_0_rgb(255_255_255/0.48)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.22] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/55 after:content-[''] hover:translate-y-[2px] hover:bg-rose-200 hover:shadow-[0_3px_0_#9f1239,0_6px_11px_rgb(127_29_29/0.13),inset_0_1px_0_rgb(255_255_255/0.5)] active:translate-y-[3px] active:shadow-[0_1px_0_#9f1239,0_3px_7px_rgb(127_29_29/0.11),inset_0_1px_0_rgb(255_255_255/0.45)] disabled:cursor-not-allowed disabled:opacity-45"
					>
						<span className="relative z-10 inline-flex items-center gap-2">
							{isRecording ? (
								<StopCircleIcon size={18} weight="fill" />
							) : (
								<VoicemailIcon size={18} weight="fill" />
							)}
							{busy
								? "Working"
								: isRecording
									? "Finish recording"
									: "Add recording"}
						</span>
					</button>

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
								type="button"
								onClick={() => void openDocs(profile)}
								disabled={!profile || supportingContentLocked}
								className="relative isolate inline-flex h-11 translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/35 bg-amber-500 font-bold text-amber-950 text-sm shadow-[0_4px_0_#92400e,0_7px_12px_rgb(120_53_15/0.14),inset_0_1px_0_rgb(255_255_255/0.42)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.2] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/50 after:content-[''] hover:translate-y-[2px] hover:bg-amber-400 hover:shadow-[0_3px_0_#92400e,0_5px_9px_rgb(120_53_15/0.13),inset_0_1px_0_rgb(255_255_255/0.48)] active:translate-y-[3px] active:shadow-[0_1px_0_#92400e,0_3px_6px_rgb(120_53_15/0.11),inset_0_1px_0_rgb(255_255_255/0.42)] disabled:cursor-not-allowed disabled:opacity-45"
							>
								<span className="relative z-10 inline-flex items-center gap-2">
									<BookOpenTextIcon size={16} />
									Docs
								</span>
							</button>
							<button
								type="button"
								onClick={() => void copyHandoff()}
								disabled={!profile || supportingContentLocked}
								className="relative isolate inline-flex h-11 translate-y-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-900/25 bg-amber-100 font-bold text-amber-900 text-sm shadow-[0_3px_0_rgb(120_53_15/0.55),0_6px_10px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.7)] transition-[transform,box-shadow,background-color,opacity] duration-150 ease-out before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:72px_72px] before:opacity-[0.18] before:mix-blend-multiply before:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/70 after:content-[''] hover:translate-y-[2px] hover:bg-amber-50 hover:shadow-[0_2px_0_rgb(120_53_15/0.5),0_4px_8px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.72)] active:translate-y-[3px] active:shadow-[0_1px_0_rgb(120_53_15/0.45),0_2px_5px_rgb(120_53_15/0.08),inset_0_1px_0_rgb(255_255_255/0.68)] disabled:cursor-not-allowed disabled:opacity-45"
							>
								<span className="relative z-10 inline-flex items-center gap-2">
									{handoffCopied ? (
										<CheckCircleIcon size={16} weight="fill" />
									) : (
										<CopyIcon size={16} />
									)}
									{handoffCopied ? "Copied" : "Handoff"}
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
				</div>
			</section>
		</main>
	);
}

const workflowStatus = (
	isRecording: boolean,
	bridgeActive: boolean,
	profile?: SiteProfile,
	handoffCopied?: boolean,
): WorkflowStatus => {
	if (isRecording) {
		return "Recording in progress";
	}
	if (!profile) {
		return "No recording";
	}
	if (handoffCopied) {
		return "Complete";
	}
	if (bridgeActive) {
		return "Bridge active";
	}
	return "Waiting for handoff";
};

function StatusBadge({ status }: { status: WorkflowStatus }) {
	const statusView = {
		"Bridge active": {
			Icon: BridgeIcon,
			className: "bg-emerald-900/10 text-emerald-700",
		},
		Complete: {
			Icon: CheckCircleIcon,
			className: "bg-emerald-900/10 text-emerald-700",
		},
		"No recording": {
			Icon: RecordIcon,
			className: "bg-amber-900/10 text-amber-900",
		},
		"Recording in progress": {
			Icon: BroadcastIcon,
			className: "bg-rose-900/10 text-rose-700",
		},
		"Waiting for handoff": {
			Icon: WarningCircleIcon,
			className: "bg-amber-900/10 text-amber-900",
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
	const primaryMethod = methods[0];
	const methodView = primaryMethod ? accessMethodView(primaryMethod) : null;
	const MethodIcon = methodView?.Icon;
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
				<div className="mt-1 flex min-w-0 items-center gap-1.5">
					{MethodIcon ? (
						<MethodIcon className="shrink-0 text-amber-900/70" size={13} />
					) : null}
					<span className="min-w-0 break-words font-semibold text-[13px] leading-4">
						{methodView?.label ?? "Not analyzed"}
					</span>
					{primaryMethod && primaryMethod.count > 0 ? (
						<span className="shrink-0 rounded-sm bg-amber-900/10 px-1.5 py-0.5 text-[9px] leading-none text-amber-900/75">
							{primaryMethod.count}
						</span>
					) : null}
				</div>
				{methods.length > 1 ? (
					<p className="mt-1 text-[10px] text-amber-900/60">
						+{methods.length - 1} more
					</p>
				) : authHint ? (
					<p className="mt-1 break-words text-[10px] text-amber-900/60 leading-snug">
						{authHint}
					</p>
				) : null}
			</div>
		</section>
	);
}

export default App;
