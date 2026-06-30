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
  PlugIcon,
  RecordIcon,
  ShieldWarningIcon,
  StopCircleIcon,
  VoicemailIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { browser } from "#imports";
import logoIllustrationUrl from "../../assets/logo_illustration.png";
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

function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoffCopied, setHandoffCopied] = useState(false);

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
        <header className="relative overflow-hidden border-emerald-950/20 border-b bg-emerald-950 px-4 py-3 text-white before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:130px_130px] before:opacity-45 before:mix-blend-overlay before:content-['']">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-4xl leading-none text-amber-50">
                Harpist
              </p>
              <p className="mt-1 truncate text-sm text-emerald-50/75">
                {hostLabel(host)}
              </p>
            </div>
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden">
              <img
                src={logoIllustrationUrl}
                alt=""
                className="size-full object-contain"
              />
            </div>
          </div>
        </header>

        <div className="space-y-3 p-4">
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-rose-100 px-3 font-semibold text-sm text-rose-600 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
          >
            {isRecording ? (
              <StopCircleIcon size={18} weight="fill" />
            ) : (
              <VoicemailIcon size={18} weight="fill" />
            )}
            <span>
              {busy
                ? "Working"
                : isRecording
                  ? "Finish recording"
                  : "Add recording"}
            </span>
          </button>

          <div className="grid grid-cols-[94px_minmax(0,1fr)] gap-2">
            <PanelPiece label="Endpoints" value={String(endpointCount)} />
            <MethodsPiece hint={capturedAuthDetail} methods={authMethods} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void openDocs(profile)}
              disabled={!profile}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-900 bg-amber-800 font-semibold text-sm transition hover:bg-amber-700 text-amber-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
            >
              <BookOpenTextIcon size={16} />
              <span>Docs</span>
            </button>
            <button
              type="button"
              onClick={() => void copyHandoff()}
              disabled={!profile}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-900 bg-amber-50 font-semibold text-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
            >
              {handoffCopied ? (
                <CheckCircleIcon size={16} weight="fill" />
              ) : (
                <CopyIcon size={16} />
              )}
              <span>{handoffCopied ? "Copied" : "Handoff"}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="min-w-0 truncate text-xs text-amber-900/70">
              {bridgeMessage}
            </p>
            <StatusBadge status={status} />
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
      className: "bg-zinc-900/10 text-zinc-700",
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

function PanelPiece({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[86px] flex-col rounded-md border border-amber-900/25 bg-amber-50 px-3 py-2.5 text-amber-900">
      <p className="text-[11px] uppercase">{label}</p>
      <p className="flex flex-1 items-center justify-center truncate font-semibold text-3xl">
        {value}
      </p>
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

function MethodsPiece({
  hint,
  methods,
}: {
  hint?: string;
  methods: ProfileAccessMethod[];
}) {
  return (
    <div className="min-h-[86px] rounded-md border border-amber-900/25 bg-amber-50 px-3 py-2.5 text-amber-900">
      <p className="text-[11px] uppercase">Authentication</p>
      <div className="mt-2 grid gap-1">
        {methods.length === 0 ? (
          <p className="truncate font-semibold text-base">Not analyzed</p>
        ) : (
          methods.slice(0, 3).map((method) => {
            const { Icon, label } = accessMethodView(method);
            return (
              <div
                key={`${method.type}:${method.label}`}
                className="flex min-w-0 items-center gap-2"
                title={method.label}
              >
                <Icon className="shrink-0 text-amber-900/70" size={14} />
                <span className="min-w-0 flex-1 truncate font-semibold text-[12px] leading-4">
                  {label}
                </span>
                {method.count > 0 ? (
                  <span className="shrink-0 rounded-sm bg-amber-900/10 px-1.5 py-0.5 text-[10px] leading-none text-amber-900/75">
                    {method.count}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {methods.length > 3 ? (
        <p className="mt-1 text-[11px] text-amber-900/70">
          +{methods.length - 3} more
        </p>
      ) : hint ? (
        <p className="mt-1 truncate text-[11px] text-amber-900/70">{hint}</p>
      ) : null}
    </div>
  );
}

export default App;
