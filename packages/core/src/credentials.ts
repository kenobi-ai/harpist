import type {
	AuthBundleMethod,
	LatestAuth,
	LatestAuthValue,
	RedactedLatestAuthValue,
	SiteProfile,
} from "./profiles";
import { secretPreview } from "./profiles";

const AUTH_LEDGER_VERSION = 1;

const MAX_LEDGER_SETS = 50;

export type CredentialKind = AuthBundleMethod["type"];

export type CredentialValidation = {
	checkedAt: string;
	reason?: string;
	result: "invalid" | "valid";
	statusCode?: number;
};

export type CredentialSet = {
	capturedAt: string;
	credentialed: boolean;
	expiresAt?: string;
	id: string;
	kinds: CredentialKind[];
	label: string;
	recordingId?: string;
	validation?: CredentialValidation;
	values: LatestAuthValue[];
};

export type CredentialSetStatus = "expired" | "invalid" | "ready" | "valid";

export type RedactedCredentialSet = Omit<CredentialSet, "values"> & {
	redacted: true;
	status: CredentialSetStatus;
	values: RedactedLatestAuthValue[];
};

export type AuthLedger = {
	activeCredentialId?: string;
	host: string;
	loginUrl?: string;
	sets: CredentialSet[];
	updatedAt: string;
	version: typeof AUTH_LEDGER_VERSION;
};

export type RedactedAuthLedger = Omit<AuthLedger, "sets"> & {
	sets: RedactedCredentialSet[];
};

const KIND_ORDER: CredentialKind[] = [
	"browser-session",
	"authorization",
	"api-key",
	"csrf-token",
	"public-client-key",
];

const HELPER_KINDS = new Set<CredentialKind>([
	"csrf-token",
	"public-client-key",
]);

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

const fnv1a64 = (input: string) => {
	let hash = FNV_OFFSET;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= BigInt(input.charCodeAt(index));
		hash = (hash * FNV_PRIME) & FNV_MASK;
	}
	return hash.toString(16).padStart(16, "0");
};

const credentialKindForValue = (value: LatestAuthValue): CredentialKind => {
	if (value.kind === "cookie") {
		return "browser-session";
	}
	switch (value.type) {
		case "authorization":
		case "basic-auth":
		case "bearer-token":
			return "authorization";
		case "csrf-token":
			return "csrf-token";
		case "public-client-key":
			return "public-client-key";
		default:
			return "api-key";
	}
};

const kindLabel = (kind: CredentialKind, values: LatestAuthValue[]) => {
	if (kind === "browser-session") {
		return values.some((value) => value.kind === "cookie" && value.credentialed)
			? "Browser session"
			: "Anonymous cookies";
	}
	if (kind === "authorization") {
		const authorization = values.find(
			(value) => credentialKindForValue(value) === "authorization",
		);
		const lower = authorization?.value.toLowerCase() ?? "";
		if (lower.startsWith("bearer ")) {
			return "Bearer token";
		}
		if (lower.startsWith("basic ")) {
			return "Basic auth";
		}
		return "Authorization header";
	}
	if (kind === "api-key") {
		return "API key";
	}
	if (kind === "csrf-token") {
		return "CSRF token";
	}
	return "Public client key";
};

const memberKey = (value: LatestAuthValue) =>
	[value.kind, value.name.toLowerCase(), value.value].join("\u0001");

const memberRichness = (value: LatestAuthValue) =>
	(value.domain ? 2 : 0) + (value.expiresAt ? 1 : 0);

const dedupeValues = (values: LatestAuthValue[]) => {
	const byKey = new Map<string, LatestAuthValue>();
	for (const value of values) {
		const key = memberKey(value);
		const existing = byKey.get(key);
		if (!existing || memberRichness(value) > memberRichness(existing)) {
			byKey.set(key, value);
		}
	}
	return [...byKey.values()].sort((left, right) => {
		if (left.credentialed !== right.credentialed) {
			return left.credentialed ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});
};

const credentialSetId = (host: string, values: LatestAuthValue[]) => {
	const canonical = [
		host,
		...values
			.map((value) => [value.kind, value.name, value.value].join("\u0001"))
			.sort((left, right) => left.localeCompare(right)),
	].join("\n");
	return `cred_${fnv1a64(canonical).slice(0, 12)}`;
};

const expiringPool = (values: LatestAuthValue[]) => {
	const credentialed = values.filter(
		(value) => value.credentialed && value.expiresAt,
	);
	return credentialed.length > 0
		? credentialed
		: values.filter((value) => value.expiresAt);
};

const setExpiresAt = (values: LatestAuthValue[]) => {
	const expiries = expiringPool(values)
		.map((value) => value.expiresAt)
		.filter((expiresAt): expiresAt is string => Boolean(expiresAt))
		.sort((left, right) => left.localeCompare(right));
	return expiries[0];
};

const setLabel = (kinds: CredentialKind[], values: LatestAuthValue[]) => {
	const primary = kinds.filter((kind) => !HELPER_KINDS.has(kind));
	const labelled = primary.length > 0 ? primary : kinds;
	return labelled.map((kind) => kindLabel(kind, values)).join(" + ");
};

export const credentialSetFromLatestAuth = (
	host: string,
	latestAuth: LatestAuth | undefined,
): CredentialSet | null => {
	const values = dedupeValues(
		(latestAuth?.values ?? []).filter(
			(value) => value.replayable && value.value,
		),
	);
	if (values.length === 0) {
		return null;
	}
	const kinds = KIND_ORDER.filter((kind) =>
		values.some((value) => credentialKindForValue(value) === kind),
	);
	const capturedAt = values
		.map((value) => value.capturedAt)
		.sort((left, right) => right.localeCompare(left))[0] as string;
	return {
		capturedAt,
		credentialed: values.some((value) => value.credentialed),
		expiresAt: setExpiresAt(values),
		id: credentialSetId(host, values),
		kinds,
		label: setLabel(kinds, values),
		recordingId: latestAuth?.recordingId,
		values,
	};
};

export const credentialSetStatus = (
	set: CredentialSet,
	now = Date.now(),
): CredentialSetStatus => {
	if (set.validation?.result === "invalid") {
		return "invalid";
	}
	const pool = expiringPool(set.values);
	const expired =
		pool.length > 0 &&
		pool.every((value) => Date.parse(value.expiresAt ?? "") <= now);
	if (set.validation?.result === "valid") {
		const lastExpiry = pool
			.map((value) => Date.parse(value.expiresAt ?? ""))
			.reduce((max, time) => Math.max(max, time), 0);
		if (!expired || Date.parse(set.validation.checkedAt) >= lastExpiry) {
			return "valid";
		}
	}
	if (expired) {
		return "expired";
	}
	return "ready";
};

const mergeCredentialSet = (
	existing: CredentialSet,
	incoming: CredentialSet,
): CredentialSet => ({
	...existing,
	capturedAt:
		incoming.capturedAt.localeCompare(existing.capturedAt) > 0
			? incoming.capturedAt
			: existing.capturedAt,
	recordingId: existing.recordingId ?? incoming.recordingId,
	validation: existing.validation ?? incoming.validation,
});

export const syncLedgerWithProfile = (
	existing: AuthLedger | null,
	profile: Pick<SiteProfile, "host" | "latestAuth" | "recordings">,
	options: {
		now?: string;
	} = {},
): {
	changed: boolean;
	ledger: AuthLedger;
} => {
	const now = options.now ?? new Date().toISOString();
	const byId = new Map<string, CredentialSet>(
		(existing?.sets ?? []).map((set) => [set.id, set]),
	);
	let changed = existing === null;
	const candidates = [
		profile.latestAuth,
		...profile.recordings.map((recording) => recording.latestAuth),
	];
	for (const latestAuth of candidates) {
		const incoming = credentialSetFromLatestAuth(profile.host, latestAuth);
		if (!incoming) {
			continue;
		}
		const current = byId.get(incoming.id);
		if (!current) {
			byId.set(incoming.id, incoming);
			changed = true;
			continue;
		}
		const merged = mergeCredentialSet(current, incoming);
		if (merged.capturedAt !== current.capturedAt) {
			changed = true;
		}
		byId.set(incoming.id, merged);
	}
	const sets = [...byId.values()]
		.sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
		.slice(0, MAX_LEDGER_SETS);
	if ((existing?.sets.length ?? 0) !== sets.length) {
		changed = true;
	}
	return {
		changed,
		ledger: {
			...(existing?.activeCredentialId
				? { activeCredentialId: existing.activeCredentialId }
				: {}),
			...(existing?.loginUrl ? { loginUrl: existing.loginUrl } : {}),
			host: profile.host,
			sets,
			updatedAt: changed ? now : (existing?.updatedAt ?? now),
			version: AUTH_LEDGER_VERSION,
		},
	};
};

const redactCredentialSet = (set: CredentialSet): RedactedCredentialSet => ({
	...set,
	redacted: true,
	status: credentialSetStatus(set),
	values: set.values.map(({ value, ...item }) => ({
		...item,
		redacted: true,
		valuePreview: secretPreview(value),
	})),
});

export const redactAuthLedger = (ledger: AuthLedger): RedactedAuthLedger => ({
	...ledger,
	sets: ledger.sets.map(redactCredentialSet),
});
