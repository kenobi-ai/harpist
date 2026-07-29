import type { HarArchive, PendingEntry } from "./har";
import { inferJsonSchema, mergeJsonSchemas } from "./json-schema-infer";
import type { ContractJsonSchema, JsonValue } from "./json-schema-zod";

export const SETTINGS_KEY = "harpist.settings";
export const PROFILES_KEY = "harpist.profiles";
export const RECORDINGS_KEY = "harpist.recordings";

export type BridgeStatus = "idle" | "offline" | "synced";

export type HarpistSettings = {
	serverUrl: string;
};

export const DEFAULT_SETTINGS: HarpistSettings = {
	serverUrl: "http://localhost:4277",
};

export type ActivePage = {
	host: string;
	origin: string;
	title: string;
	url: string;
};

export type ActiveDocumentation = {
	host: string;
	siteUrl: string;
	title: string;
	url: string;
};

export type ActiveRecording = ActivePage & {
	startedAt: string;
	tabId: number;
};

export type AuthSummary = {
	confidence: "high" | "medium" | "low";
	credentialed?: boolean;
	evidence: string[];
	expiresAt?: string;
	label: string;
	mechanisms?: AuthMechanism[];
	notes?: string;
	type?: AuthType;
};

export type AuthType =
	| "anonymous-cookie"
	| "api-key"
	| "basic-auth"
	| "bearer-token"
	| "cookie-csrf"
	| "mixed"
	| "none"
	| "public-client-key"
	| "session-cookie"
	| "signed-request"
	| "unknown";

export type AuthMechanism = {
	confidence: "high" | "medium" | "low";
	credentialed: boolean;
	evidence: string[];
	label: string;
	type: AuthType;
};

export type AuthBundleMethod = {
	count: number;
	credentialed: boolean;
	label: string;
	replayable: boolean;
	type:
		| "api-key"
		| "authorization"
		| "browser-session"
		| "csrf-token"
		| "public-client-key";
};

export type AuthBundle = {
	capturedAt?: string;
	label: string;
	methods: AuthBundleMethod[];
	notes?: string;
	recordingId?: string;
	replayable: boolean;
	status: "needs-recording" | "ready";
	warnings?: string[];
};

export type LatestAuthStatus =
	| "expired"
	| "needs-recording"
	| "ready"
	| "validation-needed";

export type LatestAuthValidation = {
	checkedAt?: string;
	reason?: string;
	status: "not-checked" | "valid" | "validation-needed";
	statusCode?: number;
};

export type LatestAuthValue = {
	capturedAt: string;
	credentialed: boolean;
	domain?: string;
	expiresAt?: string;
	host?: string;
	httpOnly?: boolean;
	kind: "cookie" | "header";
	name: string;
	recordingId?: string;
	replayable: boolean;
	sameSite?: string;
	secure?: boolean;
	session?: boolean;
	source: "recording";
	type: AuthBundleMethod["type"] | AuthType;
	url?: string;
	validation?: LatestAuthValidation;
	value: string;
};

export type RedactedLatestAuthValue = Omit<LatestAuthValue, "value"> & {
	redacted: true;
	valuePreview?: string;
};

export type LatestAuth = {
	capturedAt?: string;
	label: string;
	recordingId?: string;
	status: LatestAuthStatus;
	validation: LatestAuthValidation;
	valueCount: number;
	values: LatestAuthValue[];
	warnings?: string[];
};

export type RedactedLatestAuth = Omit<LatestAuth, "values"> & {
	values: RedactedLatestAuthValue[];
};

export type AccessType =
	| "api-key"
	| "basic-auth"
	| "bearer-token"
	| "browser-context"
	| "public"
	| "public-client-key"
	| "session-cookie"
	| "signed-request"
	| "unknown";

export type AccessSummary = {
	confidence: "high" | "medium" | "low";
	credentialed: boolean;
	evidence: string[];
	label: string;
	notes?: string;
	type: AccessType;
};

export type ProfileAccessMethod = {
	confidence: "high" | "medium" | "low";
	count: number;
	credentialed: boolean;
	evidence: string[];
	label: string;
	notes?: string;
	type: AccessType | AuthBundleMethod["type"] | AuthType;
};

export type EndpointSummary = {
	access?: AccessSummary;
	description?: string;
	exactKey: string;
	host: string;
	included?: boolean;
	lastSeenAt: string;
	method: string;
	notes?: string;
	operationName?: string;
	path: string;
	queryParams?: EndpointQueryParamSummary[];
	requestBody?: EndpointBodySummary;
	responseBodies?: EndpointResponseBodySummary[];
	samples: number;
	statuses: number[];
	tags?: string[];
	template: string;
	templateKey: string;
};

export type EndpointIdentityOverride = {
	exactKey: string;
	template: string;
	templateKey: string;
};

export type EndpointQueryParamSummary = {
	name: string;
	repeated: boolean;
	samples: number;
	values: string[];
};

export type EndpointBodySummary = {
	contentType: string;
	schema: ContractJsonSchema;
};

export type EndpointResponseBodySummary = EndpointBodySummary & {
	status: number;
};

export type RecordingSummary = {
	auth: AuthSummary;
	authBundle?: AuthBundle;
	createdAt: string;
	derivedEndpointCount: number;
	durationMs: number;
	entryCount: number;
	id: string;
	methodBreakdown: Record<string, number>;
	processedAt?: string;
	processingStatus?: "complete" | "new" | "processing";
	scannedEndpointCount: number;
	latestAuth?: LatestAuth;
	sourceUrl: string;
};

export type RecordingArchive = RecordingSummary & {
	har: HarArchive;
	host: string;
	syncedAt?: string;
};

export type RecordingsStore = Record<string, RecordingArchive>;

export type RecordingIndexEntry = Omit<RecordingArchive, "har"> & {
	archiveEntryCount?: number;
	lastSyncAttemptAt?: string;
	lastSyncError?: string;
};

export type RecordingIndexStore = Record<string, RecordingIndexEntry>;

export type ExtensionDiagnostic = {
	at: string;
	context?: Record<string, JsonValue>;
	durationMs?: number;
	id: string;
	level: "error" | "info" | "warn";
	message: string;
	operation: string;
	stack?: string;
};

export type ProfileArtifacts = {
	auth?: string;
	cli?: string;
	contractExport?: string;
	contractFormat?: "orpc-typescript-source";
	contractPath?: string;
	contractProfileFormat?: "harpist.contract-profile";
	contractProfilePath?: string;
	contractProfileSha256?: string;
	contractSha256?: string;
	generatedFrom?: "contract-profile";
	metadataPath?: string;
	metadataSha256?: string;
	openapiPath?: string;
	openapiSha256?: string;
	openapiSource?: "contract-profile";
	sdk?: string;
	status: "draft" | "missing" | "ready";
	updatedAt: string;
};

export type SiteProfile = {
	agentNotes?: string;
	artifacts?: ProfileArtifacts;
	auth: AuthSummary;
	authBundle?: AuthBundle;
	createdAt: string;
	derivedEndpointCount: number;
	displayName: string;
	endpointIdentityOverrides?: EndpointIdentityOverride[];
	endpointTemplateKeys: string[];
	endpoints: EndpointSummary[];
	host: string;
	lastBridgeMessage?: string;
	latestAuth?: LatestAuth;
	lastRecordingId?: string;
	origin: string;
	recordingCount: number;
	recordings: RecordingSummary[];
	remoteDocsUrl?: string;
	remoteProjectId?: string;
	scannedEndpointCount: number;
	scannedEndpointKeys: string[];
	removedEndpointTemplateKeys?: string[];
	status: BridgeStatus;
	updatedAt: string;
};

export type ProfilesStore = Record<string, SiteProfile>;

export type PopupState = {
	activeDocumentation: ActiveDocumentation | null;
	activePage: ActivePage | null;
	activeRecording: ActiveRecording | null;
	bridge: {
		active: boolean;
		availability: "checking" | "offline" | "online";
		lastSyncedAt?: string;
		message?: string;
		pendingRecordingCount?: number;
		syncing?: boolean;
		url: string;
	};
	capture: {
		entryCount: number;
		recording: boolean;
		stopping?: boolean;
		tabCount: number;
		tabId: number | null;
	};
	diagnostics: ExtensionDiagnostic[];
	profiles: ProfilesStore;
	settings: HarpistSettings;
};

export type BackgroundResponse<T> = {
	data?: T;
	error?: string;
	ok: boolean;
};

export type StopResult = {
	profile: SiteProfile;
	recording: RecordingSummary;
	synced: boolean;
};

export type SyncResult = {
	active: boolean;
	message?: string;
	profiles: ProfilesStore;
	recordings: RecordingIndexStore;
	syncedAt?: string;
};

const EMPTY_AUTH: AuthSummary = {
	confidence: "low",
	credentialed: false,
	evidence: [],
	label: "No user auth",
	mechanisms: [],
	notes: "No user/session authentication signal was detected.",
	type: "none",
};

const numericIdSegmentPattern = /^\d+$/;
const hexIdSegmentPattern =
	/^(?:[a-f0-9]{16}|[a-f0-9]{24}|[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i;
const uuidIdSegmentPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ulidSegmentPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const opaqueIdSegmentPattern = /^[A-Za-z0-9_-]{20,}$/;
const operationNameSegmentPattern = /^[A-Za-z][A-Za-z0-9]*$/;

const isIdSegment = (segment: string) => {
	if (
		numericIdSegmentPattern.test(segment) ||
		uuidIdSegmentPattern.test(segment) ||
		ulidSegmentPattern.test(segment) ||
		(hexIdSegmentPattern.test(segment) && /\d/.test(segment))
	) {
		return true;
	}
	if (
		operationNameSegmentPattern.test(segment) &&
		/[a-z]/.test(segment) &&
		/[A-Z]/.test(segment)
	) {
		return false;
	}
	return opaqueIdSegmentPattern.test(segment) && /\d{6,}/.test(segment);
};

export const normaliseServerUrl = (url: string) => url.replace(/\/+$/, "");

export const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

export const latestRecordingForProfile = (
	profile?: Pick<SiteProfile, "lastRecordingId" | "recordings"> | null,
) => {
	if (!profile) {
		return undefined;
	}
	return (
		profile.recordings.find(
			(recording) => recording.id === profile.lastRecordingId,
		) ?? profile.recordings[0]
	);
};

export const recordingNeedsRefinement = (
	recording?: Pick<RecordingSummary, "processedAt" | "processingStatus">,
) =>
	Boolean(
		recording &&
			(recording.processingStatus === "new" ||
				recording.processingStatus === "processing" ||
				(!recording.processingStatus && !recording.processedAt)),
	);

export const latestRecordingNeedsRefinement = (
	profile?: Pick<SiteProfile, "lastRecordingId" | "recordings"> | null,
) => recordingNeedsRefinement(latestRecordingForProfile(profile));

export const latestProfileNeedingRefinement = (profiles: ProfilesStore) =>
	Object.values(profiles)
		.filter((profile) => latestRecordingNeedsRefinement(profile))
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

export const activePageFromTab = (tab: {
	title?: string;
	url?: string;
}): ActivePage | null => {
	if (!tab.url) {
		return null;
	}
	try {
		const url = new URL(tab.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return {
			host: url.host,
			origin: url.origin,
			title: tab.title ?? url.host,
			url: tab.url,
		};
	} catch {
		return null;
	}
};

export const hostLabel = (host?: string | null) => host || "No website";

export const recordingStorageKey = (host: string, id: string) =>
	`${host}::${id}`;

const headerValue = (headers: Record<string, string>, name: string) => {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}
};

const headersMatching = (
	headers: Record<string, string>,
	predicate: (name: string, value: string) => boolean,
) =>
	Object.entries(headers).filter(([name, value]) =>
		predicate(name.toLowerCase(), value),
	);

const hasHeaderMatching = (
	headers: Record<string, string>,
	predicate: (name: string, value: string) => boolean,
) => headersMatching(headers, predicate).length > 0;

const cookieNames = (cookieHeader?: string) =>
	(cookieHeader ?? "")
		.split(";")
		.map((part) => part.trim().split("=")[0]?.trim())
		.filter((name): name is string => Boolean(name));

const entryCookieNames = (entry: PendingEntry) => [
	...new Set([
		...cookieNames(headerValue(entry.requestHeaders, "cookie")),
		...(entry.requestCookies ?? []).map((cookie) => cookie.name),
	]),
];

const sessionCookiePattern =
	/(?:^|[-_.])(?:auth|idp|jwt|login|oauth|refresh|sess|session|sid|sso|token|user)(?:$|[-_.])/i;

export const isSessionCookieName = (name: string) =>
	sessionCookiePattern.test(name);

const anonymousCookiePattern =
	/(?:^|[-_.])(?:analytics|anon|client|consent|device|ga|gid|guest|optimizely|tracking|visitor|uuid)(?:$|[-_.])/i;

const publicKeyHeaderPattern =
	/^(?:x-)?(?:api-key|application-key|client-key|client-token|subscription-key)$/i;

const userTokenHeaderPattern =
	/^(?:x-)?(?:access-token|auth-token|session-token)$/i;

const addMechanism = (
	mechanisms: Map<AuthType, AuthMechanism>,
	mechanism: AuthMechanism,
) => {
	const existing = mechanisms.get(mechanism.type);
	if (!existing) {
		mechanisms.set(mechanism.type, mechanism);
		return;
	}
	mechanisms.set(mechanism.type, {
		...existing,
		confidence:
			existing.confidence === "high" || mechanism.confidence === "high"
				? "high"
				: existing.confidence === "medium" || mechanism.confidence === "medium"
					? "medium"
					: "low",
		evidence: [...new Set([...existing.evidence, ...mechanism.evidence])],
	});
};

const authSummaryFromMechanisms = (
	mechanisms: Map<AuthType, AuthMechanism>,
): AuthSummary => {
	const values = [...mechanisms.values()];
	const credentialed = values.filter((mechanism) => mechanism.credentialed);
	if (credentialed.length > 1) {
		return {
			confidence: "medium",
			credentialed: true,
			evidence: credentialed.flatMap((mechanism) => mechanism.evidence),
			label: "Mixed auth",
			mechanisms: values,
			notes: "Multiple user/session authentication signals were observed.",
			type: "mixed",
		};
	}
	const primary = credentialed[0];
	if (primary) {
		return {
			confidence: primary.confidence,
			credentialed: true,
			evidence: primary.evidence,
			label: primary.label,
			mechanisms: values,
			type: primary.type,
		};
	}
	const publicClientKey = mechanisms.get("public-client-key");
	if (publicClientKey) {
		return {
			confidence: "low",
			credentialed: false,
			evidence: publicClientKey.evidence,
			label: "No user auth",
			mechanisms: values,
			notes:
				"Public client/API key-like headers were observed, but they do not identify the user session.",
			type: "none",
		};
	}
	const anonymousCookie = mechanisms.get("anonymous-cookie");
	if (anonymousCookie) {
		return {
			confidence: "low",
			credentialed: false,
			evidence: anonymousCookie.evidence,
			label: "No user auth",
			mechanisms: values,
			notes:
				"Cookies were observed, but they look like anonymous, consent, device, or analytics cookies.",
			type: "none",
		};
	}
	return EMPTY_AUTH;
};

export const deriveAuthSummary = (entries: PendingEntry[]): AuthSummary => {
	const mechanisms = new Map<AuthType, AuthMechanism>();

	for (const entry of entries) {
		const authorization = headerValue(entry.requestHeaders, "authorization");
		if (authorization?.toLowerCase().startsWith("bearer ")) {
			addMechanism(mechanisms, {
				confidence: "high",
				credentialed: true,
				evidence: ["Authorization: Bearer"],
				label: "Bearer token",
				type: "bearer-token",
			});
		} else if (authorization?.toLowerCase().startsWith("basic ")) {
			addMechanism(mechanisms, {
				confidence: "high",
				credentialed: true,
				evidence: ["Authorization: Basic"],
				label: "Basic auth",
				type: "basic-auth",
			});
		} else if (
			/^(?:aws4-hmac-sha256|digest|oauth|signature)\b/i.test(
				authorization ?? "",
			)
		) {
			addMechanism(mechanisms, {
				confidence: "high",
				credentialed: true,
				evidence: ["Authorization: signed request"],
				label: "Signed request",
				type: "signed-request",
			});
		}

		const names = entryCookieNames(entry);
		const sawSessionCookie = names.some((name) =>
			sessionCookiePattern.test(name),
		);
		const sawAnonymousCookie =
			names.length > 0 &&
			!sawSessionCookie &&
			names.some((name) => anonymousCookiePattern.test(name));
		const sawCsrf =
			hasHeaderMatching(
				entry.requestHeaders,
				(name) => name.includes("csrf") || name.includes("xsrf"),
			) ||
			/header[^=]*csrf|xsrf|csrf/i.test(
				headerValue(entry.requestHeaders, "cookie") ?? "",
			);

		if (sawSessionCookie && sawCsrf) {
			addMechanism(mechanisms, {
				confidence: "high",
				credentialed: true,
				evidence: ["Session-like cookie", "CSRF signal"],
				label: "Cookie + CSRF",
				type: "cookie-csrf",
			});
		} else if (sawSessionCookie) {
			addMechanism(mechanisms, {
				confidence: "medium",
				credentialed: true,
				evidence: ["Session-like cookie"],
				label: "Session cookie",
				type: "session-cookie",
			});
		} else if (sawAnonymousCookie) {
			addMechanism(mechanisms, {
				confidence: "low",
				credentialed: false,
				evidence: ["Anonymous/analytics cookie"],
				label: "Anonymous cookies",
				type: "anonymous-cookie",
			});
		}

		const publicKeyHeaders = headersMatching(entry.requestHeaders, (name) =>
			publicKeyHeaderPattern.test(name),
		);
		if (publicKeyHeaders.length > 0) {
			addMechanism(mechanisms, {
				confidence: "low",
				credentialed: false,
				evidence: publicKeyHeaders.map(([name]) => `${name} header`),
				label: "Public client key",
				type: "public-client-key",
			});
		}

		const userTokenHeaders = headersMatching(entry.requestHeaders, (name) =>
			userTokenHeaderPattern.test(name),
		);
		if (userTokenHeaders.length > 0) {
			addMechanism(mechanisms, {
				confidence: "medium",
				credentialed: true,
				evidence: userTokenHeaders.map(([name]) => `${name} header`),
				label: "API key",
				type: "api-key",
			});
		}
	}

	return authSummaryFromMechanisms(mechanisms);
};

const hasCookieMaterial = (entry: PendingEntry) =>
	Boolean(headerValue(entry.requestHeaders, "cookie")) ||
	(entry.requestCookies ?? []).some((cookie) => cookie.value !== undefined);

const addBundleMethod = (
	methods: Map<string, AuthBundleMethod>,
	method: AuthBundleMethod,
) => {
	const existing = methods.get(method.type);
	if (!existing) {
		methods.set(method.type, method);
		return;
	}
	methods.set(method.type, {
		...existing,
		count: existing.count + method.count,
		credentialed: existing.credentialed || method.credentialed,
		replayable: existing.replayable || method.replayable,
	});
};

export const deriveAuthBundle = (
	entries: PendingEntry[],
	options: {
		capturedAt?: string;
		recordingId?: string;
	} = {},
): AuthBundle => {
	const methods = new Map<string, AuthBundleMethod>();
	for (const entry of entries) {
		if (hasCookieMaterial(entry)) {
			addBundleMethod(methods, {
				count: 1,
				credentialed: true,
				label: "Browser session",
				replayable: true,
				type: "browser-session",
			});
		}
		const authorization = headerValue(entry.requestHeaders, "authorization");
		if (authorization) {
			addBundleMethod(methods, {
				count: 1,
				credentialed: true,
				label: authorization.toLowerCase().startsWith("bearer ")
					? "Bearer token"
					: authorization.toLowerCase().startsWith("basic ")
						? "Basic auth"
						: "Authorization header",
				replayable: true,
				type: "authorization",
			});
		}
		const csrfHeaders = headersMatching(
			entry.requestHeaders,
			(name) => name.includes("csrf") || name.includes("xsrf"),
		);
		if (csrfHeaders.length > 0) {
			addBundleMethod(methods, {
				count: 1,
				credentialed: false,
				label: "CSRF token",
				replayable: true,
				type: "csrf-token",
			});
		}
		const tokenHeaders = headersMatching(entry.requestHeaders, (name) =>
			userTokenHeaderPattern.test(name),
		);
		if (tokenHeaders.length > 0) {
			addBundleMethod(methods, {
				count: 1,
				credentialed: true,
				label: "API key",
				replayable: true,
				type: "api-key",
			});
		}
		const publicKeys = headersMatching(entry.requestHeaders, (name) =>
			publicKeyHeaderPattern.test(name),
		);
		if (publicKeys.length > 0) {
			addBundleMethod(methods, {
				count: 1,
				credentialed: false,
				label: "Public client key",
				replayable: true,
				type: "public-client-key",
			});
		}
	}

	const methodList = [...methods.values()].sort((left, right) => {
		if (left.credentialed !== right.credentialed) {
			return left.credentialed ? -1 : 1;
		}
		return right.count - left.count;
	});
	const replayable = methodList.some((method) => method.replayable);
	if (!replayable) {
		return {
			capturedAt: options.capturedAt,
			label: "Needs recapture",
			methods: [],
			notes:
				"Record the site again while signed in to capture replayable auth.",
			recordingId: options.recordingId,
			replayable: false,
			status: "needs-recording",
			warnings: ["No replayable browser auth material was captured."],
		};
	}
	return {
		capturedAt: options.capturedAt,
		label: methodList[0]?.label ?? "Captured auth",
		methods: methodList,
		recordingId: options.recordingId,
		replayable,
		status: "ready",
	};
};

const authValueHeaderPattern =
	/^(?:authorization|api-key|x-api-key|x-auth-token|x-access-token|x-session-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$/i;

const csrfHeaderPattern = /(?:csrf|xsrf)/i;

const cookiePairs = (cookieHeader?: string) =>
	(cookieHeader ?? "")
		.split(";")
		.map((part) => {
			const trimmed = part.trim();
			const index = trimmed.indexOf("=");
			if (index <= 0) {
				return null;
			}
			return {
				name: trimmed.slice(0, index).trim(),
				value: trimmed.slice(index + 1),
			};
		})
		.filter(
			(pair): pair is { name: string; value: string } =>
				pair !== null && Boolean(pair.name),
		);

const hostFromUrl = (rawUrl: string) => {
	try {
		return new URL(rawUrl).host;
	} catch {}
};

const authValueTypeForHeader = (
	name: string,
	value: string,
): LatestAuthValue["type"] => {
	if (name.toLowerCase() === "authorization") {
		const lower = value.toLowerCase();
		if (lower.startsWith("bearer ")) {
			return "bearer-token";
		}
		if (lower.startsWith("basic ")) {
			return "basic-auth";
		}
		return "authorization";
	}
	if (publicKeyHeaderPattern.test(name)) {
		return "public-client-key";
	}
	if (csrfHeaderPattern.test(name)) {
		return "csrf-token";
	}
	return "api-key";
};

const authValueCredentialed = (
	name: string,
	type: LatestAuthValue["type"],
	value: string,
) => {
	if (type === "public-client-key" || type === "csrf-token") {
		return false;
	}
	if (type === "authorization" || type === "bearer-token") {
		return true;
	}
	if (type === "basic-auth" || type === "api-key") {
		return true;
	}
	return sessionCookiePattern.test(name) || value.length > 0;
};

const authValueKey = (value: LatestAuthValue) =>
	[
		value.kind,
		value.name.toLowerCase(),
		value.domain?.toLowerCase() ?? value.host?.toLowerCase() ?? "",
	].join(":");

const latestAuthStatus = (values: LatestAuthValue[]): LatestAuthStatus => {
	if (values.length === 0) {
		return "needs-recording";
	}
	const now = Date.now();
	const expiringValues = values.filter((value) => value.expiresAt);
	if (
		expiringValues.length > 0 &&
		expiringValues.every((value) => Date.parse(value.expiresAt ?? "") <= now)
	) {
		return "expired";
	}
	if (
		expiringValues.some((value) => Date.parse(value.expiresAt ?? "") <= now)
	) {
		return "validation-needed";
	}
	return "ready";
};

const latestAuthWarnings = (
	status: LatestAuthStatus,
	values: LatestAuthValue[],
) => {
	if (status === "needs-recording") {
		return ["No replayable auth values were captured."];
	}
	if (status === "expired") {
		return ["All expiring auth values are past their expiry time."];
	}
	if (status === "validation-needed") {
		return ["Some auth values are expired; replay should be validated."];
	}
	const publicOnly = values.every((value) => !value.credentialed);
	return publicOnly
		? ["Only public or CSRF-like auth values were captured."]
		: undefined;
};

export const deriveLatestAuth = (
	entries: PendingEntry[],
	options: {
		capturedAt?: string;
		recordingId?: string;
	} = {},
): LatestAuth => {
	const values = new Map<string, LatestAuthValue>();
	const remember = (value: LatestAuthValue) => {
		if (!value.value) {
			return;
		}
		const key = authValueKey(value);
		const existing = values.get(key);
		if (!existing || value.capturedAt.localeCompare(existing.capturedAt) >= 0) {
			values.set(key, value);
		}
	};

	for (const entry of entries) {
		const capturedAt =
			entry.startedDateTime ?? options.capturedAt ?? new Date().toISOString();
		const host = hostFromUrl(entry.url);
		for (const cookie of entry.requestCookies ?? []) {
			if (cookie.value === undefined) {
				continue;
			}
			remember({
				capturedAt,
				credentialed: authValueCredentialed(
					cookie.name,
					"browser-session",
					cookie.value,
				),
				domain: cookie.domain,
				expiresAt: cookie.expiresAt,
				host,
				httpOnly: cookie.httpOnly,
				kind: "cookie",
				name: cookie.name,
				recordingId: options.recordingId,
				replayable: true,
				sameSite: cookie.sameSite,
				secure: cookie.secure,
				session: cookie.session,
				source: "recording",
				type: "browser-session",
				url: entry.url,
				validation: {
					status: "not-checked",
				},
				value: cookie.value,
			});
		}

		for (const cookie of cookiePairs(
			headerValue(entry.requestHeaders, "cookie"),
		)) {
			remember({
				capturedAt,
				credentialed: authValueCredentialed(
					cookie.name,
					"browser-session",
					cookie.value,
				),
				host,
				kind: "cookie",
				name: cookie.name,
				recordingId: options.recordingId,
				replayable: true,
				source: "recording",
				type: "browser-session",
				url: entry.url,
				validation: {
					status: "not-checked",
				},
				value: cookie.value,
			});
		}

		for (const [name, value] of Object.entries(entry.requestHeaders)) {
			if (
				name.toLowerCase() === "cookie" ||
				!(
					authValueHeaderPattern.test(name) ||
					userTokenHeaderPattern.test(name) ||
					publicKeyHeaderPattern.test(name) ||
					csrfHeaderPattern.test(name)
				)
			) {
				continue;
			}
			const type = authValueTypeForHeader(name, value);
			remember({
				capturedAt,
				credentialed: authValueCredentialed(name, type, value),
				host,
				kind: "header",
				name,
				recordingId: options.recordingId,
				replayable: true,
				source: "recording",
				type,
				url: entry.url,
				validation: {
					status: "not-checked",
				},
				value,
			});
		}
	}

	const list = [...values.values()].sort((left, right) => {
		if (left.credentialed !== right.credentialed) {
			return left.credentialed ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});
	const status = latestAuthStatus(list);
	return {
		capturedAt: options.capturedAt,
		label:
			status === "ready"
				? "Latest auth ready"
				: status === "needs-recording"
					? "Needs recapture"
					: status === "expired"
						? "Latest auth expired"
						: "Latest auth needs validation",
		recordingId: options.recordingId,
		status,
		validation: {
			reason:
				status === "validation-needed" || status === "expired"
					? "One or more captured auth values have expired."
					: undefined,
			status: status === "ready" ? "not-checked" : "validation-needed",
		},
		valueCount: list.length,
		values: list,
		warnings: latestAuthWarnings(status, list),
	};
};

export const secretPreview = (value: string) => {
	if (value.length <= 8) {
		return "<redacted>";
	}
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export const redactLatestAuth = (
	latestAuth?: LatestAuth,
): RedactedLatestAuth | undefined =>
	latestAuth
		? {
				...latestAuth,
				values: latestAuth.values.map(({ value: _value, ...item }) => ({
					...item,
					redacted: true as const,
				})),
			}
		: undefined;

export const redactSiteProfile = (profile: SiteProfile) => ({
	...profile,
	latestAuth: redactLatestAuth(profile.latestAuth),
	recordings: profile.recordings.map((recording) => ({
		...recording,
		latestAuth: redactLatestAuth(recording.latestAuth),
	})),
});

const templatePath = (pathname: string) => {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) {
		return "/";
	}
	return `/${segments
		.map((segment) => (isIdSegment(segment) ? "{id}" : segment))
		.join("/")}`;
};

export const applyEndpointIdentityOverrides = (
	endpoints: EndpointSummary[],
	overrides: EndpointIdentityOverride[] = [],
) => {
	const byExactKey = new Map(
		overrides.map((override) => [override.exactKey, override]),
	);
	return endpoints.map((endpoint) => {
		const override = byExactKey.get(endpoint.exactKey);
		return override
			? {
					...endpoint,
					template: override.template,
					templateKey: override.templateKey,
				}
			: endpoint;
	});
};

const queryParamsFromUrl = (url: URL): EndpointQueryParamSummary[] => {
	const names = new Set(url.searchParams.keys());
	return [...names]
		.sort((left, right) => left.localeCompare(right))
		.map((name) => {
			const values = url.searchParams.getAll(name);
			return {
				name,
				repeated: values.length > 1,
				samples: 1,
				values: [...new Set(values)].slice(0, 5),
			};
		});
};

const jsonContentType = (mime?: string) => {
	const contentType = mime?.split(";")[0]?.trim().toLowerCase();
	return contentType && /(?:^application\/json$|\+json$)/i.test(contentType)
		? contentType
		: "application/json";
};

const parseJsonBody = (
	text: string | undefined,
	options: {
		bodyBase64?: boolean;
		mime?: string;
	},
): JsonValue | undefined => {
	if (!text || options.bodyBase64) {
		return;
	}
	const trimmed = text.trim();
	if (
		!(
			/(?:json|\+json)/i.test(options.mime ?? "") ||
			trimmed.startsWith("{") ||
			trimmed.startsWith("[")
		)
	) {
		return;
	}
	try {
		return JSON.parse(trimmed) as JsonValue;
	} catch {
		return;
	}
};

const requestBodyFromEntry = (
	entry: PendingEntry,
): EndpointBodySummary | undefined => {
	const body = parseJsonBody(entry.postData, {
		mime: entry.postDataMime,
	});
	return body === undefined
		? undefined
		: {
				contentType: jsonContentType(entry.postDataMime),
				schema: inferJsonSchema(body),
			};
};

const responseBodyFromEntry = (
	entry: PendingEntry,
): EndpointResponseBodySummary | undefined => {
	if (entry.status === undefined) {
		return;
	}
	const body = parseJsonBody(entry.body, {
		bodyBase64: entry.bodyBase64,
		mime: entry.responseMime,
	});
	return body === undefined
		? undefined
		: {
				contentType: jsonContentType(entry.responseMime),
				schema: inferJsonSchema(body),
				status: entry.status,
			};
};

type EndpointSummaryOptions = {
	inferBodies?: boolean;
};

const endpointFromEntry = (
	entry: PendingEntry,
	options: EndpointSummaryOptions = {},
): EndpointSummary | null => {
	try {
		const url = new URL(entry.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		const method = entry.method.toUpperCase();
		const path = url.pathname || "/";
		const template = templatePath(path);
		const inferBodies = options.inferBodies !== false;
		const responseBody = inferBodies ? responseBodyFromEntry(entry) : undefined;
		return {
			exactKey: `${method} ${url.host}${path}`,
			host: url.host,
			lastSeenAt: entry.startedDateTime,
			method,
			path,
			queryParams: queryParamsFromUrl(url),
			requestBody: inferBodies ? requestBodyFromEntry(entry) : undefined,
			responseBodies: responseBody ? [responseBody] : undefined,
			samples: 1,
			statuses: entry.status === undefined ? [] : [entry.status],
			template,
			templateKey: `${method} ${url.host}${template}`,
		};
	} catch {
		return null;
	}
};

const mergeQueryParams = (endpoints: EndpointSummary[]) => {
	const byName = new Map<string, EndpointQueryParamSummary>();
	for (const endpoint of endpoints) {
		for (const param of endpoint.queryParams ?? []) {
			const existing = byName.get(param.name);
			if (!existing) {
				byName.set(param.name, param);
				continue;
			}
			byName.set(param.name, {
				name: param.name,
				repeated: existing.repeated || param.repeated,
				samples: existing.samples + param.samples,
				values: [...new Set([...existing.values, ...param.values])].slice(0, 5),
			});
		}
	}
	return [...byName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
};

const mergeBodySummaries = (
	left: EndpointBodySummary | undefined,
	right: EndpointBodySummary | undefined,
) => {
	if (!left) {
		return right;
	}
	if (!right) {
		return left;
	}
	return {
		contentType:
			left.contentType === right.contentType
				? left.contentType
				: "application/json",
		schema: mergeJsonSchemas(left.schema, right.schema),
	};
};

const mergeResponseBodies = (endpoints: EndpointSummary[]) => {
	const byStatus = new Map<number, EndpointResponseBodySummary>();
	for (const endpoint of endpoints) {
		for (const response of endpoint.responseBodies ?? []) {
			const existing = byStatus.get(response.status);
			if (!existing) {
				byStatus.set(response.status, response);
				continue;
			}
			byStatus.set(response.status, {
				contentType:
					existing.contentType === response.contentType
						? existing.contentType
						: "application/json",
				schema: mergeJsonSchemas(existing.schema, response.schema),
				status: response.status,
			});
		}
	}
	return [...byStatus.values()].sort(
		(left, right) => left.status - right.status,
	);
};

const mergeEndpoints = (endpoints: EndpointSummary[]) => {
	const byTemplate = new Map<string, EndpointSummary>();
	for (const endpoint of endpoints) {
		const existing = byTemplate.get(endpoint.templateKey);
		if (!existing) {
			byTemplate.set(endpoint.templateKey, endpoint);
			continue;
		}
		const statuses = new Set([...existing.statuses, ...endpoint.statuses]);
		byTemplate.set(endpoint.templateKey, {
			...existing,
			lastSeenAt:
				existing.lastSeenAt.localeCompare(endpoint.lastSeenAt) > 0
					? existing.lastSeenAt
					: endpoint.lastSeenAt,
			samples: existing.samples + endpoint.samples,
			queryParams: mergeQueryParams([existing, endpoint]),
			requestBody: mergeBodySummaries(
				existing.requestBody,
				endpoint.requestBody,
			),
			responseBodies: mergeResponseBodies([existing, endpoint]),
			statuses: [...statuses].sort((left, right) => left - right),
		});
	}
	return [...byTemplate.values()].sort((left, right) =>
		left.templateKey.localeCompare(right.templateKey),
	);
};

const countByMethod = (endpoints: EndpointSummary[]) => {
	const counts: Record<string, number> = {};
	for (const endpoint of endpoints) {
		counts[endpoint.method] = (counts[endpoint.method] ?? 0) + 1;
	}
	return counts;
};

const randomId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export const authDisplayLabel = (auth?: AuthSummary | null) =>
	auth?.label || "No user auth";

const uniqueLabels = (mechanisms: AuthMechanism[]) => [
	...new Set(mechanisms.map((mechanism) => mechanism.label)),
];

export const authDetailLabel = (auth?: AuthSummary | null) => {
	if (!auth) {
		return;
	}
	const mechanisms = auth.mechanisms ?? [];
	if (mechanisms.length === 0) {
		return auth.notes;
	}
	const primaryType = auth.type ?? "unknown";
	const observedOnly = mechanisms.filter(
		(mechanism) => mechanism.type !== primaryType,
	);
	if (auth.type === "none" || auth.credentialed === false) {
		return `Observed: ${uniqueLabels(mechanisms).join(", ")}`;
	}
	if (observedOnly.length > 0) {
		return `Also: ${uniqueLabels(observedOnly).join(", ")}`;
	}
	return auth.notes;
};

const accessLabelsForProfile = (profile?: SiteProfile | null) => [
	...new Set(
		(profile?.endpoints ?? [])
			.filter((endpoint) => endpoint.included !== false)
			.map((endpoint) => endpoint.access?.label)
			.filter((label): label is string => Boolean(label)),
	),
];

const confidenceRank = {
	high: 3,
	low: 1,
	medium: 2,
} as const;

const mergeConfidence = (
	left: ProfileAccessMethod["confidence"],
	right: ProfileAccessMethod["confidence"],
) => (confidenceRank[left] >= confidenceRank[right] ? left : right);

export const accessMethodsForProfile = (
	profile?: SiteProfile | null,
): ProfileAccessMethod[] => {
	if (!profile) {
		return [];
	}
	const methods = new Map<string, ProfileAccessMethod>();
	const add = (method: Omit<ProfileAccessMethod, "count">, count = 1) => {
		const key = `${method.type}:${method.label}:${method.credentialed}`;
		const existing = methods.get(key);
		if (!existing) {
			methods.set(key, {
				...method,
				count,
			});
			return;
		}
		methods.set(key, {
			...existing,
			confidence: mergeConfidence(existing.confidence, method.confidence),
			count: existing.count + count,
			evidence: [...new Set([...existing.evidence, ...method.evidence])],
			notes: existing.notes ?? method.notes,
		});
	};

	for (const endpoint of profile.endpoints) {
		if (endpoint.included === false) {
			continue;
		}
		if (endpoint.access) {
			add(endpoint.access);
			continue;
		}
		const tags = endpoint.tags ?? [];
		if (tags.includes("challenge")) {
			add({
				confidence: "low",
				credentialed: false,
				evidence: ["Challenge endpoint tag"],
				label: "Browser challenge",
				notes:
					"Inferred from endpoint tags because access metadata was not present.",
				type: "browser-context",
			});
			continue;
		}
		if (tags.includes("same-site")) {
			add({
				confidence: "low",
				credentialed: false,
				evidence: ["Same-site endpoint tag"],
				label: tags.includes("write")
					? "Browser context write"
					: "Browser context",
				notes:
					"Inferred from endpoint tags because access metadata was not present.",
				type: "browser-context",
			});
		}
	}

	for (const mechanism of profile.auth.mechanisms ?? []) {
		add(
			{
				confidence: mechanism.confidence,
				credentialed: mechanism.credentialed,
				evidence: mechanism.evidence,
				label: mechanism.label,
				type: mechanism.type,
			},
			0,
		);
	}

	if (
		methods.size === 0 &&
		profile.auth.type &&
		profile.auth.type !== "none" &&
		profile.auth.type !== "unknown"
	) {
		add(
			{
				confidence: profile.auth.confidence,
				credentialed: Boolean(profile.auth.credentialed),
				evidence: profile.auth.evidence,
				label: profile.auth.label,
				notes: profile.auth.notes,
				type: profile.auth.type,
			},
			0,
		);
	}

	return [...methods.values()].sort((left, right) => {
		if (left.credentialed !== right.credentialed) {
			return left.credentialed ? -1 : 1;
		}
		if (right.count !== left.count) {
			return right.count - left.count;
		}
		return left.label.localeCompare(right.label);
	});
};

export const accessMethodsText = (profile?: SiteProfile | null) => {
	const methods = accessMethodsForProfile(profile);
	if (methods.length === 0) {
		return "Not analyzed";
	}
	return methods
		.map((method) =>
			method.count > 0 ? `${method.label} (${method.count})` : method.label,
		)
		.join(", ");
};

export const authMethodsForProfile = (
	profile?: SiteProfile | null,
): ProfileAccessMethod[] => {
	if (!profile) {
		return [];
	}
	if (profile.authBundle) {
		if (profile.authBundle.methods.length > 0) {
			return profile.authBundle.methods.map((method) => ({
				confidence: profile.authBundle?.status === "ready" ? "high" : "low",
				count: method.count,
				credentialed: method.credentialed,
				evidence: [
					profile.authBundle?.recordingId
						? "Recorded auth bundle"
						: "Recorded auth",
				],
				label: method.label,
				notes: profile.authBundle?.notes,
				type: method.type,
			}));
		}
		if (profile.authBundle.status === "needs-recording") {
			return [
				{
					confidence: "low",
					count: 0,
					credentialed: false,
					evidence: profile.authBundle.warnings ?? [],
					label: "Recapture auth",
					notes: profile.authBundle.notes,
					type: "browser-session",
				},
			];
		}
	}
	const methods = new Map<string, ProfileAccessMethod>();
	const add = (method: Omit<ProfileAccessMethod, "count">, count = 0) => {
		const key = `${method.type}:${method.label}:${method.credentialed}`;
		const existing = methods.get(key);
		if (!existing) {
			methods.set(key, {
				...method,
				count,
			});
			return;
		}
		methods.set(key, {
			...existing,
			confidence: mergeConfidence(existing.confidence, method.confidence),
			count: existing.count + count,
			evidence: [...new Set([...existing.evidence, ...method.evidence])],
			notes: existing.notes ?? method.notes,
		});
	};

	for (const mechanism of profile.auth.mechanisms ?? []) {
		if (mechanism.credentialed || mechanism.type === "public-client-key") {
			add({
				confidence: mechanism.confidence,
				credentialed: mechanism.credentialed,
				evidence: mechanism.evidence,
				label: mechanism.label,
				type: mechanism.type,
			});
		}
	}

	for (const endpoint of profile.endpoints) {
		if (
			endpoint.included !== false &&
			endpoint.access?.credentialed &&
			endpoint.access.type !== "unknown"
		) {
			add(endpoint.access, 1);
		}
	}

	if (methods.size === 0) {
		const browserMethodCount = accessMethodsForProfile(profile)
			.filter((method) => method.type === "browser-context")
			.reduce((total, method) => total + method.count, 0);
		if (browserMethodCount > 0) {
			add(
				{
					confidence: "medium",
					credentialed: false,
					evidence: ["Same-site browser context"],
					label: "Browser session",
					notes:
						"Requests rely on the active browser context; no reusable credential was captured.",
					type: "browser-context",
				},
				browserMethodCount,
			);
		}
	}

	if (
		methods.size === 0 &&
		profile.auth.type &&
		profile.auth.type !== "none" &&
		profile.auth.type !== "unknown"
	) {
		add({
			confidence: profile.auth.confidence,
			credentialed: Boolean(profile.auth.credentialed),
			evidence: profile.auth.evidence,
			label: profile.auth.label,
			notes: profile.auth.notes,
			type: profile.auth.type,
		});
	}

	return [...methods.values()].sort((left, right) => {
		if (left.credentialed !== right.credentialed) {
			return left.credentialed ? -1 : 1;
		}
		if (right.count !== left.count) {
			return right.count - left.count;
		}
		return left.label.localeCompare(right.label);
	});
};

export const authMethodsText = (profile?: SiteProfile | null) => {
	const methods = authMethodsForProfile(profile);
	if (methods.length === 0) {
		return "No auth detected";
	}
	return methods
		.map((method) =>
			method.count > 0 ? `${method.label} (${method.count})` : method.label,
		)
		.join(", ");
};

export const accessDisplayLabel = (profile?: SiteProfile | null) => {
	if (!profile) {
		return "No recording";
	}
	const methods = accessMethodsForProfile(profile);
	if (methods.length > 0) {
		return methods[0].label;
	}
	if (profile.auth.credentialed) {
		return authDisplayLabel(profile.auth);
	}
	const labels = accessLabelsForProfile(profile);
	if (
		labels.includes("Browser context") ||
		labels.includes("Browser context write") ||
		labels.includes("Browser session") ||
		labels.includes("Browser session write") ||
		labels.includes("Browser challenge")
	) {
		return labels.includes("Browser session") ||
			labels.includes("Browser session write")
			? "Browser session"
			: "Browser context";
	}
	if (labels.includes("Public client key")) {
		return "Public client key";
	}
	return labels[0] ?? authDisplayLabel(profile.auth);
};

export const accessDetailLabel = (profile?: SiteProfile | null) => {
	const labels = accessLabelsForProfile(profile);
	if (labels.length === 0) {
		return;
	}
	const browserParts = [
		labels.includes("Browser context") || labels.includes("Browser session")
			? "reads"
			: "",
		labels.includes("Browser context write") ||
		labels.includes("Browser session write")
			? "writes"
			: "",
		labels.includes("Browser challenge") ? "challenge" : "",
	].filter(Boolean);
	if (browserParts.length > 0) {
		return `Includes ${browserParts.join(", ")}`;
	}
	return labels.join(", ");
};

export const capturedAuthDetailLabel = (profile?: SiteProfile | null) => {
	if (!profile) {
		return;
	}
	if (profile.latestAuth) {
		if (profile.latestAuth.status === "ready") {
			return profile.latestAuth.recordingId
				? `Latest auth from ${profile.latestAuth.recordingId}`
				: "Latest auth ready";
		}
		if (profile.latestAuth.status === "expired") {
			return "Latest auth expired";
		}
		if (profile.latestAuth.status === "validation-needed") {
			return "Latest auth needs validation";
		}
	}
	if (profile.authBundle) {
		if (profile.authBundle.status === "ready") {
			return profile.authBundle.recordingId
				? `Captured in ${profile.authBundle.recordingId}`
				: "Ready for replay";
		}
		return profile.authBundle.notes ?? "Record this site again while signed in";
	}
	if (profile.auth.credentialed) {
		return authDetailLabel(profile.auth);
	}
	return profile.auth.type === "none"
		? "No reusable user credential captured"
		: authDetailLabel(profile.auth);
};

export const endpointAccessDetail = (profile?: SiteProfile | null) => {
	const labels = [
		...new Set(
			(profile?.endpoints ?? [])
				.filter((endpoint) => endpoint.included !== false)
				.map((endpoint) => endpoint.access?.label)
				.filter((label): label is string => Boolean(label)),
		),
	];
	return labels.length > 0 ? labels.join(", ") : undefined;
};

const shouldKeepExistingAuth = (
	incoming: AuthSummary,
	existing?: AuthSummary,
) => {
	if (!existing) {
		return false;
	}
	if (incoming.label === "Not detected") {
		return true;
	}
	return (
		incoming.type === "none" &&
		(incoming.mechanisms?.length ?? 0) === 0 &&
		existing.type !== "none"
	);
};

export const summariseEndpoints = (
	entries: PendingEntry[],
	options: EndpointSummaryOptions = {},
) =>
	mergeEndpoints(
		entries
			.map((entry) => endpointFromEntry(entry, options))
			.filter((endpoint): endpoint is EndpointSummary => endpoint !== null),
	);

type RecordingSummaryOptions = {
	endedAt?: string;
	inferBodies?: boolean;
	startedAt?: string;
};

export const summariseRecording = (
	entries: PendingEntry[],
	meta: ActiveRecording | ActivePage,
	options: RecordingSummaryOptions = {},
) => {
	const endpoints = summariseEndpoints(entries, {
		inferBodies: options.inferBodies,
	});
	const scannedKeys = new Set(endpoints.map((endpoint) => endpoint.exactKey));
	const templateKeys = new Set(
		endpoints.map((endpoint) => endpoint.templateKey),
	);
	const startedAt =
		options.startedAt ??
		("startedAt" in meta ? meta.startedAt : entries[0]?.startedDateTime);
	const endedAt = options.endedAt ?? new Date().toISOString();
	const createdAt = endedAt;
	const auth = deriveAuthSummary(entries);
	const id = randomId();
	const authBundle = deriveAuthBundle(entries, {
		capturedAt: createdAt,
		recordingId: id,
	});
	const latestAuth = deriveLatestAuth(entries, {
		capturedAt: createdAt,
		recordingId: id,
	});
	const recording: RecordingSummary = {
		auth,
		authBundle,
		createdAt,
		derivedEndpointCount: templateKeys.size,
		durationMs: startedAt
			? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt))
			: 0,
		entryCount: entries.length,
		id,
		latestAuth,
		methodBreakdown: countByMethod(endpoints),
		processingStatus: "new",
		scannedEndpointCount: scannedKeys.size,
		sourceUrl: meta.url,
	};

	return {
		auth,
		authBundle,
		endpoints,
		latestAuth,
		recording,
		scannedKeys,
		templateKeys,
	};
};

export const mergeProfile = (
	existing: SiteProfile | undefined,
	meta: ActiveRecording | ActivePage,
	summary: ReturnType<typeof summariseRecording>,
	bridge: {
		message?: string;
		projectId?: string;
		status: BridgeStatus;
		serverUrl?: string;
	} = {
		status: "idle",
	},
): SiteProfile => {
	const now = summary.recording.createdAt;
	const scannedEndpointKeys = new Set(existing?.scannedEndpointKeys ?? []);
	for (const key of summary.scannedKeys) {
		scannedEndpointKeys.add(key);
	}
	const endpointIdentityOverrides = existing?.endpointIdentityOverrides ?? [];
	const removedEndpointTemplateKeys =
		existing?.removedEndpointTemplateKeys ?? [];
	const removed = new Set(removedEndpointTemplateKeys);
	const endpoints = mergeEndpoints(
		applyEndpointIdentityOverrides(
			[...(existing?.endpoints ?? []), ...summary.endpoints],
			endpointIdentityOverrides,
		).filter((endpoint) => !removed.has(endpoint.templateKey)),
	).slice(0, 500);
	const endpointTemplateKeys = [
		...new Set(
			endpoints
				.filter((endpoint) => endpoint.included !== false)
				.map((endpoint) => endpoint.templateKey),
		),
	].slice(0, 1000);
	const remoteDocsUrl =
		bridge.projectId && bridge.serverUrl
			? `${normaliseServerUrl(bridge.serverUrl)}/profiles/${encodeURIComponent(
					bridge.projectId,
				)}/docs`
			: existing?.remoteDocsUrl;

	return {
		auth: shouldKeepExistingAuth(summary.auth, existing?.auth)
			? (existing?.auth ?? summary.auth)
			: summary.auth,
		authBundle: summary.authBundle,
		createdAt: existing?.createdAt ?? now,
		derivedEndpointCount: endpointTemplateKeys.length,
		displayName: existing?.displayName ?? meta.host,
		endpointIdentityOverrides,
		endpoints,
		endpointTemplateKeys,
		host: meta.host,
		lastBridgeMessage: bridge.message ?? existing?.lastBridgeMessage,
		lastRecordingId: summary.recording.id,
		latestAuth: summary.latestAuth,
		origin: meta.origin,
		recordingCount: (existing?.recordingCount ?? 0) + 1,
		recordings: [summary.recording, ...(existing?.recordings ?? [])].slice(
			0,
			20,
		),
		remoteDocsUrl,
		remoteProjectId: bridge.projectId ?? existing?.remoteProjectId,
		scannedEndpointCount: scannedEndpointKeys.size,
		scannedEndpointKeys: [...scannedEndpointKeys].slice(0, 1000),
		removedEndpointTemplateKeys,
		status: bridge.status,
		updatedAt: now,
	};
};

export const buildAgentHandoffText = (
	profile: SiteProfile,
	_settings: HarpistSettings,
) => {
	const accessLabel = accessDisplayLabel(profile);
	const accessDetail = accessDetailLabel(profile);
	const credentialLabel = (() => {
		if (profile.latestAuth?.status === "ready") {
			return "Latest auth ready";
		}
		if (profile.latestAuth?.status === "expired") {
			return "Latest auth expired";
		}
		if (profile.latestAuth?.status === "validation-needed") {
			return "Latest auth needs validation";
		}
		if (profile.authBundle?.status === "ready") {
			return "Ready for replay";
		}
		if (profile.authBundle?.status === "needs-recording") {
			return "Needs recapture";
		}
		return profile.auth.credentialed
			? authDisplayLabel(profile.auth)
			: "No reusable user credential captured";
	})();
	return [
		`Use the Harpist skill for ${profile.host}.`,
		profile.lastRecordingId
			? `Recording: ${profile.lastRecordingId} (${profile.derivedEndpointCount} endpoints).`
			: `Latest recording: ${profile.derivedEndpointCount} endpoints.`,
		latestRecordingNeedsRefinement(profile)
			? "Status: Ready for agent refinement and documentation."
			: "",
		`Auth: ${authMethodsText(profile)}.`,
		accessDetail && accessLabel !== accessDetail
			? `Access detail: ${accessDetail}.`
			: "",
		`Credential: ${credentialLabel}.`,
	]
		.filter(Boolean)
		.join("\n");
};
