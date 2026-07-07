import { credentialValidationFromResponse } from "../../core/src/credential-validation";
import {
	type AuthLedger,
	type CredentialSet,
	type CredentialSetStatus,
	credentialSetStatus,
	redactAuthLedger,
} from "../../core/src/credentials";
import type { EndpointSummary, SiteProfile } from "../../core/src/profiles";
import { credentialSetById } from "./auth-ledger";
import { credentialStatusLabel, relativeTime } from "./credential-display";
import {
	isInteractiveTerminal,
	promptAuthCredential,
	promptLoginUrl,
	promptReplayProfile,
} from "./interactive-replay-input";
import {
	buildReplayBundle,
	executeReplayBundle,
	type ReplayFetch,
} from "./replay";
import type { BridgeStore } from "./store";

const ansi = {
	dim: "\x1b[2m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	reset: "\x1b[0m",
	yellow: "\x1b[33m",
};

export const shouldColorOutput = () => {
	if ("NO_COLOR" in process.env) {
		return false;
	}
	const forceColor = process.env.FORCE_COLOR;
	if (forceColor !== undefined) {
		return forceColor !== "0" && forceColor !== "false";
	}
	return Boolean(process.stdout.isTTY);
};

const paint = (code: string, value: string, color: boolean) =>
	color ? `${code}${value}${ansi.reset}` : value;

export const resolveAuthHost = async (
	store: BridgeStore,
	host: string | undefined,
	command: string,
) => {
	if (host) {
		return host;
	}
	if (isInteractiveTerminal()) {
		return promptReplayProfile(await store.listProfiles());
	}
	throw new Error(
		`Missing host. Run \`harpist auth ${command}\` in a TTY to choose a site, or pass <host>.`,
	);
};

const statusColorCode = (status: CredentialSetStatus) => {
	if (status === "invalid") {
		return ansi.red;
	}
	if (status === "expired") {
		return ansi.yellow;
	}
	return ansi.green;
};

const renderLedgerLines = (ledger: AuthLedger, color: boolean) => {
	const lines = [ledger.host];
	if (ledger.sets.length === 0) {
		lines.push(
			paint(
				ansi.dim,
				"  no captured credentials — record while signed in",
				color,
			),
		);
		return lines;
	}
	const labelWidth = Math.max(...ledger.sets.map((set) => set.label.length));
	for (const set of ledger.sets) {
		const status = credentialSetStatus(set);
		const active = ledger.activeCredentialId === set.id;
		lines.push(
			[
				active ? "  ● " : "    ",
				`${set.id}  `,
				`${set.label.padEnd(labelWidth)}  `,
				paint(
					ansi.dim,
					`captured ${relativeTime(set.capturedAt)}`.padEnd(18),
					color,
				),
				"  ",
				paint(
					statusColorCode(status),
					credentialStatusLabel(set, status),
					color,
				),
			].join(""),
		);
	}
	if (ledger.loginUrl) {
		lines.push(paint(ansi.dim, `  login: ${ledger.loginUrl}`, color));
	}
	return lines;
};

export const runAuthListCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const json = args.includes("--json");
	const host = args.find((arg) => !arg.startsWith("--"));
	const profiles = host
		? [await store.requireProfile(host)]
		: await store.listProfiles();
	if (profiles.length === 0) {
		throw new Error("No Harpist profile exists yet. Record a site first.");
	}
	const ledgers = await Promise.all(
		profiles.map((profile) => store.getAuthLedger(profile.host)),
	);
	if (json) {
		const redacted = ledgers.map(redactAuthLedger);
		console.log(JSON.stringify(host ? redacted[0] : redacted, null, 2));
		return;
	}
	const color = shouldColorOutput();
	console.log(
		ledgers.flatMap((ledger) => renderLedgerLines(ledger, color)).join("\n"),
	);
};

export const runAuthUseCommand = async (store: BridgeStore, args: string[]) => {
	const positional = args.filter((arg) => !arg.startsWith("--"));
	const credentialIdPattern = /^cred_[0-9a-f]{12}$/;
	const hostArg = credentialIdPattern.test(positional[0] ?? "")
		? undefined
		: positional[0];
	const host = await resolveAuthHost(store, hostArg, "use");
	const target =
		(hostArg === undefined ? positional[0] : positional[1]) ??
		(args.includes("--clear") ? "--clear" : undefined) ??
		(isInteractiveTerminal()
			? await promptAuthCredential(await store.getAuthLedger(host), {
					allowClear: true,
				})
			: undefined);
	if (!target) {
		throw new Error("Usage: harpist auth use [host] [credentialId|--clear]");
	}
	if (target === "--clear") {
		await store.setActiveCredential(host, null);
		console.log(`Cleared the active credential for ${host}.`);
		return;
	}
	const ledger = await store.setActiveCredential(host, target);
	const set = credentialSetById(ledger, target);
	console.log(`Pinned ${target} (${set.label}) as the default for ${host}.`);
};

export const runAuthSetLoginUrlCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const urlArg = args.find((arg) => /^https?:\/\//i.test(arg));
	const host = await resolveAuthHost(
		store,
		args.find((arg) => !arg.startsWith("--") && arg !== urlArg),
		"set-login-url",
	);
	const rawUrl =
		urlArg ??
		(isInteractiveTerminal()
			? await promptLoginUrl(
					(await store.getAuthLedger(host)).loginUrl ??
						(await store.requireProfile(host)).origin,
				)
			: undefined);
	if (!rawUrl) {
		throw new Error("Usage: harpist auth set-login-url [host] [url]");
	}
	const url = new URL(rawUrl);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Login URL must be http(s).");
	}
	await store.setAuthLoginUrl(host, url.toString());
	console.log(`Login URL for ${host} set to ${url}.`);
};

const probeScore = (endpoint: EndpointSummary) =>
	(endpoint.statuses.some((status) => status >= 200 && status < 300) ? 4 : 0) +
	(endpoint.access?.credentialed ? 2 : 0) +
	(endpoint.template.includes("{") ? 0 : 1) +
	((endpoint.responseBodies ?? []).some((body) =>
		/json/i.test(body.contentType),
	)
		? 1
		: 0);

const pickProbeEndpoint = (profile: SiteProfile): EndpointSummary | null =>
	profile.endpoints
		.filter(
			(endpoint) =>
				endpoint.included !== false && endpoint.method.toUpperCase() === "GET",
		)
		.sort((left, right) => probeScore(right) - probeScore(left))[0] ?? null;

export const runAuthCheckCommand = async (
	store: BridgeStore,
	args: string[],
	options: {
		fetch?: ReplayFetch;
	} = {},
) => {
	const json = args.includes("--json");
	const all = args.includes("--all");
	const positional = args.filter((arg) => !arg.startsWith("--"));
	const host = await resolveAuthHost(store, positional[0], "check");
	const profile = await store.requireProfile(host);
	const ledger = await store.getAuthLedger(host);
	const credentialId = positional[1];
	const sets = credentialId
		? [credentialSetById(ledger, credentialId)]
		: all
			? ledger.sets
			: [
					ledger.sets.find((set) => set.id === ledger.activeCredentialId) ??
						ledger.sets[0],
				].filter((set): set is CredentialSet => Boolean(set));
	if (sets.length === 0) {
		throw new Error(
			`No captured credentials for '${host}'. Record the site while signed in.`,
		);
	}
	const probe = pickProbeEndpoint(profile);
	if (!probe) {
		throw new Error(
			`No safe GET endpoint was recorded for '${host}' to check credentials against.`,
		);
	}
	const recordings = await store.listStoredRecordings(host);
	const color = shouldColorOutput();
	const results: {
		credentialId: string;
		label: string;
		status: CredentialSetStatus;
		statusCode: number;
	}[] = [];
	for (const set of sets) {
		const bundle = buildReplayBundle({
			credentialSet: set,
			profile,
			recordings,
			templateKey: probe.templateKey,
		});
		const executed = await executeReplayBundle(bundle, {
			fetch: options.fetch,
		});
		const validation = credentialValidationFromResponse(executed, {
			checkedAt: new Date().toISOString(),
		});
		const next = validation
			? (
					await store.recordCredentialValidation(host, set.id, validation)
				).sets.find((item) => item.id === set.id)
			: set;
		const status = credentialSetStatus(next ?? set);
		results.push({
			credentialId: set.id,
			label: set.label,
			status,
			statusCode: executed.status,
		});
		if (!json) {
			console.log(
				[
					`${set.id}  ${set.label}`,
					paint(
						ansi.dim,
						`GET ${probe.template} → HTTP ${executed.status}`,
						color,
					),
					paint(statusColorCode(status), status, color),
				].join("  "),
			);
		}
	}
	if (json) {
		console.log(
			JSON.stringify({ host, probe: probe.templateKey, results }, null, 2),
		);
	}
	if (results.some((result) => result.status === "invalid")) {
		console.error(
			`Some credentials are invalid. Run \`harpist auth login ${host}\` to capture fresh ones.`,
		);
		process.exitCode = 1;
	}
};
