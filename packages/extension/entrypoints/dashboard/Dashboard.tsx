import {
	BookOpenIcon,
	CheckCircleIcon,
	CopyIcon,
	DatabaseIcon,
	FloppyDiskIcon,
	GlobeHemisphereWestIcon,
	PlugsConnectedIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browser } from "#imports";
import {
	authMethodsForProfile,
	type BackgroundResponse,
	buildAgentHandoffText,
	capturedAuthDetailLabel,
	DEFAULT_SETTINGS,
	type HarpistSettings,
	hostLabel,
	messageOf,
	normaliseServerUrl,
	type PopupState,
	type ProfileAccessMethod,
	type SiteProfile,
} from "@harpist/core/profiles";

const sendMessage = async <T,>(
	message: object,
): Promise<BackgroundResponse<T>> =>
	(await browser.runtime.sendMessage(message)) as BackgroundResponse<T>;

const dateFormat = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	month: "short",
});

const docsUrlForProfile = (profile: SiteProfile, settings: HarpistSettings) =>
	profile.remoteDocsUrl ??
	`${normaliseServerUrl(settings.serverUrl)}/profiles/${encodeURIComponent(
		profile.host,
	)}/docs`;

function Dashboard() {
	const [state, setState] = useState<PopupState | null>(null);
	const [selectedHost, setSelectedHost] = useState<string>("");
	const [settings, setSettings] = useState<HarpistSettings>(DEFAULT_SETTINGS);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [copied, setCopied] = useState(false);

	const load = useCallback(async () => {
		const response = await sendMessage<PopupState>({
			type: "GET_STATE",
		});
		if (!response.ok || !response.data) {
			throw new Error(response.error ?? "Could not read Harpist state.");
		}
		const nextState = response.data;
		setState(nextState);
		setSettings(nextState.settings);
		setError(null);
		const hosts = Object.keys(nextState.profiles);
		const hashHost = decodeURIComponent(location.hash.slice(1));
		const activeHost = nextState.activePage?.host;
		setSelectedHost((current) =>
			current && nextState.profiles[current]
				? current
				: hashHost && nextState.profiles[hashHost]
					? hashHost
					: activeHost && nextState.profiles[activeHost]
						? activeHost
						: (hosts[0] ?? ""),
		);
	}, []);

	useEffect(() => {
		void load().catch((loadError: unknown) => setError(messageOf(loadError)));
	}, [load]);

	const profiles = useMemo(
		() =>
			Object.values(state?.profiles ?? {}).sort((left, right) =>
				right.updatedAt.localeCompare(left.updatedAt),
			),
		[state],
	);
	const selected = selectedHost ? state?.profiles[selectedHost] : undefined;

	const saveSettings = async () => {
		const response = await sendMessage<PopupState>({
			settings,
			type: "SAVE_SETTINGS",
		});
		if (!response.ok || !response.data) {
			setError(response.error ?? "Could not save settings.");
			return;
		}
		setState(response.data);
		setSaved(true);
		window.setTimeout(() => setSaved(false), 1400);
	};

	const openRemoteDocs = async (profile: SiteProfile) => {
		await browser.tabs.create({
			url: docsUrlForProfile(profile, settings),
		});
	};

	const copyHandoff = async (profile: SiteProfile) => {
		await navigator.clipboard.writeText(
			buildAgentHandoffText(profile, settings),
		);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	};

	return (
		<main className="min-h-screen bg-[#f7f2e8] text-zinc-950">
			<div className="mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr] px-6 py-6">
				<header className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-md border border-emerald-950/20 bg-[#075f4a] px-5 py-4 text-white shadow-sm before:absolute before:inset-0 before:bg-[url('/grain.svg')] before:bg-[length:130px_130px] before:opacity-45 before:mix-blend-overlay before:content-['']">
					<div className="relative z-10">
						<p className="font-semibold text-emerald-50/75 text-xs uppercase">
							Harpist
						</p>
						<h1 className="mt-2 font-display text-4xl tracking-normal">
							Docs & Profiles
						</h1>
					</div>
					<div className="relative z-10 flex items-center gap-2">
						<a
							href={`${normaliseServerUrl(settings.serverUrl)}/openapi`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex h-10 items-center gap-2 rounded-md border border-white/20 bg-white/90 px-3 font-semibold text-sm text-zinc-950 transition hover:bg-white"
						>
							<BookOpenIcon size={16} />
							<span>Bridge API</span>
						</a>
						<button
							type="button"
							onClick={() => void saveSettings()}
							className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 font-semibold text-sm text-white transition hover:bg-zinc-800"
						>
							<FloppyDiskIcon size={16} />
							<span>{saved ? "Saved" : "Save"}</span>
						</button>
					</div>
				</header>

				<section className="grid min-h-0 gap-5 py-5 lg:grid-cols-[280px_1fr]">
					<aside className="flex min-h-0 flex-col gap-4">
						<section className="rounded-md border border-zinc-300 bg-white p-3 shadow-sm">
							<label
								className="block font-semibold text-sm"
								htmlFor="server-url"
							>
								Bridge URL
							</label>
							<input
								id="server-url"
								value={settings.serverUrl}
								onChange={(event) =>
									setSettings((current) => ({
										...current,
										serverUrl: event.target.value,
									}))
								}
								className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3 font-mono text-sm outline-none focus:border-emerald-700"
							/>
							<p className="mt-2 truncate text-xs text-zinc-500">
								{state?.bridge.message ?? "Bridge not checked"}
							</p>
						</section>

						<section className="min-h-0 rounded-md border border-zinc-300 bg-white shadow-sm">
							<div className="flex items-center justify-between border-zinc-200 border-b px-3 py-2">
								<div className="flex items-center gap-2 font-semibold text-sm">
									<GlobeHemisphereWestIcon size={16} />
									<span>Projects</span>
								</div>
								<span className="font-medium text-xs text-zinc-500">
									{profiles.length}
								</span>
							</div>
							<div className="max-h-[calc(100vh-260px)] overflow-auto p-2">
								{profiles.length === 0 ? (
									<p className="px-2 py-8 text-center text-sm text-zinc-500">
										No recordings yet.
									</p>
								) : null}
								{profiles.map((profile) => (
									<button
										key={profile.host}
										type="button"
										onClick={() => {
											setSelectedHost(profile.host);
											location.hash = encodeURIComponent(profile.host);
										}}
										className={`mb-1 w-full rounded-md px-3 py-2 text-left transition ${
											selectedHost === profile.host
												? "bg-emerald-900 text-white"
												: "hover:bg-zinc-100"
										}`}
									>
										<span className="block truncate font-semibold text-sm">
											{profile.displayName}
										</span>
										<span
											className={`mt-0.5 block text-xs ${
												selectedHost === profile.host
													? "text-emerald-50/75"
													: "text-zinc-500"
											}`}
										>
											{profile.recordingCount} recordings
										</span>
									</button>
								))}
							</div>
						</section>
					</aside>

					<section className="min-w-0">
						{error ? (
							<div className="mb-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900 text-sm">
								<WarningCircleIcon className="mt-0.5 shrink-0" size={17} />
								<span>{error}</span>
							</div>
						) : null}

						{selected ? (
							<ProfileDocs
								copied={copied}
								onCopy={() => void copyHandoff(selected)}
								onOpenRemoteDocs={() => void openRemoteDocs(selected)}
								profile={selected}
							/>
						) : (
							<section className="flex min-h-[520px] flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white/65 text-center">
								<div className="flex size-14 items-center justify-center rounded-md bg-[#1e3a36] text-white">
									<GlobeHemisphereWestIcon size={26} />
								</div>
								<h2 className="mt-4 font-semibold text-xl">
									{hostLabel(state?.activePage?.host)}
								</h2>
								<p className="mt-2 max-w-sm text-sm text-zinc-500">
									Start with a recording from the popup.
								</p>
							</section>
						)}
					</section>
				</section>
			</div>
		</main>
	);
}

function ProfileDocs({
	copied,
	onCopy,
	onOpenRemoteDocs,
	profile,
}: {
	copied: boolean;
	onCopy: () => void;
	onOpenRemoteDocs: () => void;
	profile: SiteProfile;
}) {
	const BridgeIcon =
		profile.status === "synced"
			? CheckCircleIcon
			: profile.status === "offline"
				? WarningCircleIcon
				: PlugsConnectedIcon;
	const authMethods = authMethodsForProfile(profile);
	const authDetail = capturedAuthDetailLabel(profile);

	return (
		<div className="grid gap-5">
			<section className="rounded-md border border-zinc-300 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="font-semibold text-emerald-800 text-xs uppercase">
							{profile.origin}
						</p>
						<h2 className="mt-2 truncate font-semibold text-3xl">
							{profile.displayName}
						</h2>
						<div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
							<BridgeIcon size={16} />
							<span>{profile.lastBridgeMessage ?? "Stored locally"}</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onOpenRemoteDocs}
							className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 font-semibold text-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45"
						>
							<BookOpenIcon size={16} />
							<span>Open docs</span>
						</button>
						<button
							type="button"
							onClick={onCopy}
							className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 font-semibold text-sm text-white transition hover:bg-zinc-800"
						>
							<CopyIcon size={16} />
							<span>{copied ? "Copied" : "Copy handoff"}</span>
						</button>
					</div>
				</div>
			</section>

			<section className="grid gap-3 md:grid-cols-4">
				<Metric label="Recordings" value={profile.recordingCount} />
				<Metric
					label="Endpoints scanned"
					value={profile.scannedEndpointCount}
				/>
				<Metric
					label="Endpoints derived"
					value={profile.derivedEndpointCount}
				/>
				<AuthMethodsCard detail={authDetail} methods={authMethods} />
			</section>

			<section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
				<div className="rounded-md border border-zinc-300 bg-white shadow-sm">
					<div className="flex items-center justify-between border-zinc-200 border-b px-4 py-3">
						<div className="flex items-center gap-2 font-semibold">
							<DatabaseIcon size={18} />
							<span>Endpoint inventory</span>
						</div>
						<span className="text-sm text-zinc-500">
							{profile.endpoints.length} templates
						</span>
					</div>
					<div className="overflow-auto">
						<table className="w-full min-w-[680px] border-collapse text-left text-sm">
							<thead className="text-zinc-500">
								<tr className="border-zinc-200 border-b">
									<th className="px-4 py-2 font-medium">Method</th>
									<th className="px-4 py-2 font-medium">Template</th>
									<th className="px-4 py-2 font-medium">Samples</th>
									<th className="px-4 py-2 font-medium">Status</th>
								</tr>
							</thead>
							<tbody>
								{profile.endpoints.map((endpoint) => (
									<tr
										key={endpoint.templateKey}
										className="border-zinc-100 border-b last:border-b-0"
									>
										<td className="px-4 py-2 font-bold text-emerald-700 text-xs">
											{endpoint.method}
										</td>
										<td className="px-4 py-2 font-mono text-xs">
											{endpoint.host}
											{endpoint.template}
										</td>
										<td className="px-4 py-2 text-zinc-600">
											{endpoint.samples}
										</td>
										<td className="px-4 py-2 text-zinc-600">
											{endpoint.statuses.join(", ") || "-"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="rounded-md border border-zinc-300 bg-white shadow-sm">
					<div className="border-zinc-200 border-b px-4 py-3 font-semibold">
						Recordings
					</div>
					<div className="divide-y divide-zinc-100">
						{profile.recordings.map((recording) => (
							<div key={recording.id} className="px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="font-semibold text-sm">
											{dateFormat.format(new Date(recording.createdAt))}
										</p>
										<p className="mt-1 truncate text-sm text-zinc-500">
											{recording.sourceUrl}
										</p>
									</div>
									<span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-[11px] text-zinc-600">
										{recording.entryCount} entries
									</span>
								</div>
								<div className="mt-3 grid grid-cols-2 gap-2 text-sm">
									<span className="text-zinc-500">
										Scanned {recording.scannedEndpointCount}
									</span>
									<span className="text-zinc-500">
										Derived {recording.derivedEndpointCount}
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>
		</div>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-zinc-300 bg-white p-4 shadow-sm">
			<p className="text-zinc-500 text-xs uppercase">{label}</p>
			<p className="mt-3 font-semibold text-3xl">{value}</p>
		</div>
	);
}

function AuthMethodsCard({
	detail,
	methods,
}: {
	detail?: string;
	methods: ProfileAccessMethod[];
}) {
	return (
		<div className="rounded-md border border-zinc-300 bg-white p-4 shadow-sm">
			<div className="flex items-center gap-2 text-zinc-500 text-xs uppercase">
				<ShieldCheckIcon size={15} />
				<span>Authentication</span>
			</div>
			<div className="mt-3 space-y-1">
				{methods.length === 0 ? (
					<p className="truncate font-semibold text-xl">Not analyzed</p>
				) : (
					methods.slice(0, 4).map((method) => (
						<div
							key={`${method.type}:${method.label}`}
							className="flex min-w-0 items-center gap-2"
						>
							<span className="truncate font-semibold text-sm">
								{method.label}
							</span>
							{method.count > 0 ? (
								<span className="shrink-0 rounded-sm bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
									{method.count}
								</span>
							) : null}
						</div>
					))
				)}
			</div>
			{methods.length > 4 ? (
				<p className="mt-1 text-sm text-zinc-500">+{methods.length - 4} more</p>
			) : detail ? (
				<p className="mt-1 truncate text-sm text-zinc-500">{detail}</p>
			) : null}
		</div>
	);
}

export default Dashboard;
