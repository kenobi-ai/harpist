import { spawn } from "node:child_process";
import type { AuthLedger } from "../../core/src/credentials";
import { inferLoginUrl } from "../../core/src/login-url";
import { resolveAuthHost } from "./auth-commands";
import { parseDurationMs } from "./bridge-runtime";
import { credentialStatusLabel, relativeTime } from "./credential-display";
import { type BridgeStore, entriesFromHar } from "./store";

const usage =
	"Usage: harpist auth login <host> [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;
const CLAIM_WAIT_MS = 4_000;
const CLAIM_POLL_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseAuthLoginArgs = (args: string[]) => {
	let host: string | undefined;
	let url: string | undefined;
	let open = true;
	let wait = true;
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg === "--no-open") {
			open = false;
		} else if (arg === "--no-wait") {
			wait = false;
		} else if (arg === "--url") {
			url = args[index + 1];
			index += 1;
		} else if (arg.startsWith("--url=")) {
			url = arg.slice("--url=".length);
		} else if (arg === "--timeout") {
			timeoutMs = parseDurationMs(args[index + 1] ?? "");
			index += 1;
		} else if (arg.startsWith("--timeout=")) {
			timeoutMs = parseDurationMs(arg.slice("--timeout=".length));
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown auth login option '${arg}'.\n${usage}`);
		} else if (!host) {
			host = arg;
		} else {
			throw new Error(usage);
		}
	}
	return { host, open, timeoutMs, url, wait };
};

const openInBrowser = (url: string) => {
	const [command, ...commandArgs] =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];
	const child = spawn(command as string, commandArgs, {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
};

const bridgeIsUp = async (bridgeUrl: string) => {
	try {
		const response = await fetch(`${bridgeUrl}/bridge/health`, {
			signal: AbortSignal.timeout(1_500),
		});
		return response.ok;
	} catch {
		return false;
	}
};

const entriesForLoginInference = async (store: BridgeStore, host: string) => {
	const recordings = await store.listStoredRecordings(host);
	return recordings.flatMap((recording) => entriesFromHar(recording.har));
};

const freshCredentialSet = (
	ledger: AuthLedger,
	baseline: { ids: Set<string>; newestCapturedAt: string },
) =>
	ledger.sets.find(
		(set) =>
			!baseline.ids.has(set.id) ||
			set.capturedAt.localeCompare(baseline.newestCapturedAt) > 0,
	);

/**
 * Ask the extension to open the login page and auto-record: enqueue a
 * capture-auth command, open the bridge's /wake page to spin up the
 * service worker, and wait briefly for the claim. On any miss the command
 * is expired (so it cannot fire a second tab later) and the caller falls
 * back to opening the login page directly.
 */
const tryExtensionLogin = async (
	store: BridgeStore,
	input: {
		claimWaitMs: number;
		host: string;
		loginUrl: string;
		openUrl: (url: string) => void;
		wakeUrl: string;
	},
) => {
	const command = await store.commands.enqueue({
		kind: "capture-auth",
		payload: {
			host: input.host,
			loginUrl: input.loginUrl,
		},
	});
	input.openUrl(input.wakeUrl);
	const deadline = Date.now() + input.claimWaitMs;
	while (Date.now() < deadline) {
		await sleep(CLAIM_POLL_MS);
		const current = await store.commands.get(command.id);
		if (current?.status === "claimed" || current?.status === "done") {
			return true;
		}
		if (current?.status === "failed") {
			console.error(
				`warning: the extension could not run the login capture${
					current.error ? ` (${current.error})` : ""
				}.`,
			);
			return false;
		}
	}
	await store.commands.expire(command.id);
	return false;
};

export const runAuthLoginCommand = async (
	store: BridgeStore,
	args: string[],
	options: {
		bridgeUrl: string;
		claimWaitMs?: number;
		openUrl?: (url: string) => void;
	},
) => {
	const parsedArgs = parseAuthLoginArgs(args);
	const parsed = {
		...parsedArgs,
		host: await resolveAuthHost(store, parsedArgs.host, "login"),
	};
	const openUrl = options.openUrl ?? openInBrowser;
	const profile = await store.requireProfile(parsed.host);
	let ledger = await store.getAuthLedger(parsed.host);
	const loginUrl =
		parsed.url ??
		ledger.loginUrl ??
		inferLoginUrl(
			await entriesForLoginInference(store, parsed.host),
			parsed.host,
		) ??
		profile.origin;
	if (parsed.url) {
		ledger = await store.setAuthLoginUrl(parsed.host, loginUrl);
	}

	const bridgeUp = await bridgeIsUp(options.bridgeUrl);
	if (!bridgeUp) {
		console.error(
			`warning: the Harpist bridge is not running at ${options.bridgeUrl}. Start it with \`harpist bridge\` or new recordings cannot sync.`,
		);
	}

	const openedViaExtension =
		parsed.open && bridgeUp && (await store.getExtensionPresence()) !== null
			? await tryExtensionLogin(store, {
					claimWaitMs: options.claimWaitMs ?? CLAIM_WAIT_MS,
					host: parsed.host,
					loginUrl,
					openUrl,
					wakeUrl: `${options.bridgeUrl}/wake`,
				})
			: false;

	if (openedViaExtension) {
		console.log(
			`The Harpist extension is opening ${loginUrl} and will record your login automatically.`,
		);
		console.log(
			"Sign in when the tab appears — the recording stops and syncs by itself once fresh credentials are captured.",
		);
		console.log("");
	} else {
		console.log(`Opening ${loginUrl}`);
		if (parsed.open) {
			openUrl(loginUrl);
		}
		console.log("");
		console.log(
			"  1. Sign in to the site in the browser tab that just opened.",
		);
		console.log(
			"  2. In the Harpist extension, start a recording and load a signed-in page.",
		);
		console.log(
			"  3. Stop the recording — it syncs to the bridge automatically.",
		);
		console.log("");
	}
	if (!parsed.wait) {
		return;
	}

	const baseline = {
		ids: new Set(ledger.sets.map((set) => set.id)),
		newestCapturedAt: ledger.sets[0]?.capturedAt ?? "",
	};
	console.log(
		`Waiting up to ${Math.round(parsed.timeoutMs / 60_000)}m for fresh credentials…`,
	);
	const deadline = Date.now() + parsed.timeoutMs;
	while (Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		ledger = await store.getAuthLedger(parsed.host);
		const fresh = freshCredentialSet(ledger, baseline);
		if (!fresh) {
			continue;
		}
		console.log(
			`✓ Captured ${fresh.label} (${fresh.id}), ${credentialStatusLabel(fresh)}.`,
		);
		if (ledger.activeCredentialId && ledger.activeCredentialId !== fresh.id) {
			const pinned = ledger.sets.find(
				(set) => set.id === ledger.activeCredentialId,
			);
			console.log(
				`Note: replay is still pinned to ${ledger.activeCredentialId}${
					pinned ? ` (captured ${relativeTime(pinned.capturedAt)})` : ""
				}. Run \`harpist auth use ${parsed.host} ${fresh.id}\` to switch, or \`harpist auth use ${parsed.host} --clear\`.`,
			);
		}
		return;
	}
	throw new Error(
		`Timed out waiting for fresh credentials for '${parsed.host}'. Finish the recording in the extension, then run \`harpist auth list ${parsed.host}\`.`,
	);
};
