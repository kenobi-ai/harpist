import type { CapturedCookie, PendingEntry } from "../../core/src/har";
import {
	type AuthBundle,
	deriveAuthBundle,
	type EndpointSummary,
	type RedactedLatestAuth,
	redactLatestAuth,
	type SiteProfile,
} from "../../core/src/profiles";
import type { StoredRecording } from "./store";

type ReplayHeader = {
	name: string;
	redacted: boolean;
	secret: boolean;
	value: string;
};

type ReplayCookie = CapturedCookie & {
	redacted: boolean;
	value?: string;
};

export type ReplayBundle = {
	authBundle: AuthBundle;
	authValueSource: "latest-auth" | "recording";
	body?: string;
	contentType?: string;
	cookies: ReplayCookie[];
	credentialSource: "recording";
	curl: string;
	endpoint: EndpointSummary;
	headers: ReplayHeader[];
	latestAuth?: RedactedLatestAuth;
	method: string;
	recordingId: string;
	redactedCurl: string;
	url: string;
	warnings: string[];
};

const redacted = "<redacted>";

const secretHeaderPattern =
	/^(?:authorization|cookie|proxy-authorization|x-api-key|api-key|x-auth-token|x-access-token|x-session-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$/i;

const keepHeaderPattern =
	/^(?:accept|authorization|content-type|cookie|origin|priority|referer|sec-|traceparent|user-agent|x-|api-key)/i;

const ignoredHeaderPattern =
	/^(?::|accept-encoding|connection|content-length|host)/i;

const headerValue = (headers: Record<string, string>, name: string) => {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}
};

const headersFromHar = (headers: unknown): Record<string, string> => {
	if (!Array.isArray(headers)) {
		return {};
	}
	const next: Record<string, string> = {};
	for (const header of headers) {
		if (
			typeof header === "object" &&
			header !== null &&
			"name" in header &&
			"value" in header
		) {
			next[String(header.name)] = String(header.value);
		}
	}
	return next;
};

const requestCookiesFromHar = (
	request: unknown,
): CapturedCookie[] | undefined => {
	if (typeof request !== "object" || request === null) {
		return;
	}
	const harpist = (request as { _harpist?: unknown })._harpist;
	if (typeof harpist !== "object" || harpist === null) {
		return;
	}
	const requestCookies = (harpist as { requestCookies?: unknown })
		.requestCookies;
	if (!Array.isArray(requestCookies)) {
		return;
	}
	return requestCookies
		.map((cookie): CapturedCookie | null => {
			if (
				typeof cookie !== "object" ||
				cookie === null ||
				!("name" in cookie)
			) {
				return null;
			}
			return {
				domain: typeof cookie.domain === "string" ? cookie.domain : undefined,
				expiresAt:
					typeof cookie.expiresAt === "string" ? cookie.expiresAt : undefined,
				httpOnly:
					typeof cookie.httpOnly === "boolean" ? cookie.httpOnly : undefined,
				name: String(cookie.name),
				sameSite:
					typeof cookie.sameSite === "string" ? cookie.sameSite : undefined,
				secure: typeof cookie.secure === "boolean" ? cookie.secure : undefined,
				session:
					typeof cookie.session === "boolean" ? cookie.session : undefined,
				value: typeof cookie.value === "string" ? cookie.value : undefined,
			};
		})
		.filter((cookie): cookie is CapturedCookie => cookie !== null);
};

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const cookieHeaderFromCookies = (cookies?: CapturedCookie[]) => {
	const withValues = (cookies ?? []).filter(
		(cookie) => cookie.value !== undefined,
	);
	return withValues.length > 0
		? withValues
				.map((cookie) => `${cookie.name}=${cookie.value ?? ""}`)
				.join("; ")
		: undefined;
};

const pathMatchesTemplate = (pathname: string, template: string) => {
	const pathParts = pathname.split("/").filter(Boolean);
	const templateParts = template.split("/").filter(Boolean);
	if (pathParts.length !== templateParts.length) {
		return false;
	}
	return templateParts.every(
		(part, index) => /^\{[^}]+\}$/.test(part) || part === pathParts[index],
	);
};

const rootDomain = (host: string) => {
	const parts = host.split(".");
	if (parts.length <= 2) {
		return host;
	}
	const last = parts.at(-1);
	const secondLast = parts.at(-2);
	const thirdLast = parts.at(-3);
	if (last && secondLast && thirdLast && secondLast.length <= 3) {
		return `${thirdLast}.${secondLast}.${last}`;
	}
	return parts.slice(-2).join(".");
};

const sameSiteHost = (candidate: string, profileHost: string) => {
	const root = rootDomain(profileHost);
	return candidate === profileHost || candidate.endsWith(`.${root}`);
};

const cookieDomainMatches = (domain: string, host: string) => {
	const cleanDomain = domain.replace(/^\./, "").toLowerCase();
	const cleanHost = host.toLowerCase();
	return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
};

const authValueMatchesHost = (
	value: NonNullable<SiteProfile["latestAuth"]>["values"][number],
	host: string,
) => {
	if (value.domain) {
		return cookieDomainMatches(value.domain, host);
	}
	if (value.host) {
		return sameSiteHost(value.host, host);
	}
	return true;
};

const latestAuthEntryForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
): PendingEntry | null => {
	const latestAuth = profile.latestAuth;
	if (!latestAuth || latestAuth.values.length === 0) {
		return null;
	}
	const values = latestAuth.values.filter(
		(value) =>
			value.replayable &&
			value.value &&
			authValueMatchesHost(value, endpoint.host),
	);
	if (values.length === 0) {
		return null;
	}
	const requestCookies: CapturedCookie[] = values
		.filter((value) => value.kind === "cookie")
		.map((value) => ({
			domain: value.domain,
			expiresAt: value.expiresAt,
			httpOnly: value.httpOnly,
			name: value.name,
			sameSite: value.sameSite,
			secure: value.secure,
			session: value.session,
			value: value.value,
		}));
	const requestHeaders = Object.fromEntries(
		values
			.filter((value) => value.kind === "header")
			.map((value) => [value.name, value.value]),
	);
	const cookieHeader = cookieHeaderFromCookies(requestCookies);
	if (cookieHeader) {
		requestHeaders.Cookie = cookieHeader;
	}
	return {
		method: endpoint.method,
		requestCookies: requestCookies.length > 0 ? requestCookies : undefined,
		requestHeaders,
		startedDateTime:
			latestAuth.capturedAt ??
			values[0]?.capturedAt ??
			new Date().toISOString(),
		url: `https://${endpoint.host}${endpoint.path}`,
	};
};

const selectedEndpoints = (
	profile: SiteProfile,
	selector: {
		method?: string;
		operationName?: string;
		path?: string;
		templateKey?: string;
	},
) => {
	if (selector.templateKey) {
		return profile.endpoints.filter(
			(endpoint) => endpoint.templateKey === selector.templateKey,
		);
	}
	if (selector.operationName) {
		return profile.endpoints.filter(
			(endpoint) => endpoint.operationName === selector.operationName,
		);
	}
	if (selector.method && selector.path) {
		return profile.endpoints.filter(
			(endpoint) =>
				endpoint.method === selector.method?.toUpperCase() &&
				(endpoint.path === selector.path ||
					endpoint.template === selector.path),
		);
	}
	return profile.endpoints.filter((endpoint) => endpoint.included !== false);
};

const entryFromRecording = (
	recording: StoredRecording,
	endpoint: EndpointSummary,
	options: {
		allowTemplate?: boolean;
	} = {},
) => {
	let templateCandidate: PendingEntry | null = null;
	for (const raw of recording.har.log.entries) {
		if (typeof raw !== "object" || raw === null) {
			continue;
		}
		const entry = raw as {
			request?: {
				headers?: unknown;
				method?: unknown;
				postData?: { mimeType?: unknown; text?: unknown };
				url?: unknown;
			};
			response?: {
				content?: {
					encoding?: unknown;
					mimeType?: unknown;
					text?: unknown;
				};
				headers?: unknown;
				status?: unknown;
				statusText?: unknown;
			};
			startedDateTime?: unknown;
		};
		if (
			typeof entry.request?.method !== "string" ||
			typeof entry.request.url !== "string"
		) {
			continue;
		}
		const method = entry.request.method.toUpperCase();
		if (method !== endpoint.method) {
			continue;
		}
		let url: URL;
		try {
			url = new URL(entry.request.url);
		} catch {
			continue;
		}
		const pathname = url.pathname || "/";
		const exactKey = `${method} ${url.host}${pathname}`;
		const exactMatch =
			exactKey === endpoint.exactKey ||
			(url.host === endpoint.host && pathname === endpoint.path);
		const templateMatch =
			options.allowTemplate === true &&
			url.host === endpoint.host &&
			pathMatchesTemplate(pathname, endpoint.template);
		if (!(exactMatch || templateMatch)) {
			continue;
		}
		const pending: PendingEntry = {
			body:
				typeof entry.response?.content?.text === "string"
					? entry.response.content.text
					: undefined,
			bodyBase64: entry.response?.content?.encoding === "base64",
			method,
			postData:
				typeof entry.request.postData?.text === "string"
					? entry.request.postData.text
					: undefined,
			postDataMime:
				typeof entry.request.postData?.mimeType === "string"
					? entry.request.postData.mimeType
					: undefined,
			requestCookies: requestCookiesFromHar(entry.request),
			requestHeaders: headersFromHar(entry.request.headers),
			responseHeaders: headersFromHar(entry.response?.headers),
			responseMime:
				typeof entry.response?.content?.mimeType === "string"
					? entry.response.content.mimeType
					: undefined,
			startedDateTime:
				typeof entry.startedDateTime === "string"
					? entry.startedDateTime
					: new Date().toISOString(),
			status:
				typeof entry.response?.status === "number"
					? entry.response.status
					: undefined,
			statusText:
				typeof entry.response?.statusText === "string"
					? entry.response.statusText
					: undefined,
			url: entry.request.url,
		};
		if (exactMatch) {
			return pending;
		}
		templateCandidate ??= pending;
	}
	return templateCandidate;
};

const replayHeaders = (
	entry: PendingEntry,
	options: {
		includeSecrets: boolean;
	},
) => {
	const nextHeaders = { ...entry.requestHeaders };
	if (!headerValue(nextHeaders, "cookie")) {
		const cookieHeader = cookieHeaderFromCookies(entry.requestCookies);
		if (cookieHeader) {
			nextHeaders.Cookie = cookieHeader;
		}
	}
	const headers = Object.entries(nextHeaders)
		.filter(
			([name]) =>
				!ignoredHeaderPattern.test(name) && keepHeaderPattern.test(name),
		)
		.map(([name, value]) => {
			const secret = secretHeaderPattern.test(name);
			return {
				name,
				redacted: secret && !options.includeSecrets,
				secret,
				value: secret && !options.includeSecrets ? redacted : value,
			};
		});
	const seen = new Set<string>();
	return headers.filter((header) => {
		const key = header.name.toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
};

const replayCookies = (
	cookies: CapturedCookie[] | undefined,
	options: {
		includeSecrets: boolean;
	},
): ReplayCookie[] =>
	(cookies ?? []).map((cookie) => ({
		...cookie,
		redacted: cookie.value !== undefined && !options.includeSecrets,
		value:
			cookie.value !== undefined && !options.includeSecrets
				? redacted
				: cookie.value,
	}));

const hasCredentialMaterial = (entry: PendingEntry) =>
	Boolean(headerValue(entry.requestHeaders, "authorization")) ||
	Boolean(headerValue(entry.requestHeaders, "cookie")) ||
	(entry.requestCookies ?? []).some((cookie) => cookie.value !== undefined) ||
	Object.keys(entry.requestHeaders).some((name) =>
		secretHeaderPattern.test(name),
	);

const credentialEntryForEndpoint = (
	recordings: StoredRecording[],
	endpoint: EndpointSummary,
) => {
	for (const recording of recordings) {
		for (const entry of entriesFromRecording(recording)) {
			if (!hasCredentialMaterial(entry)) {
				continue;
			}
			let url: URL;
			try {
				url = new URL(entry.url);
			} catch {
				continue;
			}
			if (sameSiteHost(url.host, endpoint.host)) {
				return entry;
			}
		}
	}
	return null;
};

const withCredentialMaterial = (
	entry: PendingEntry,
	credentialEntry: PendingEntry | null,
): PendingEntry => {
	if (!credentialEntry) {
		return entry;
	}
	const requestHeaders = { ...entry.requestHeaders };
	const setHeader = (name: string, value: string | undefined) => {
		if (!value) {
			return;
		}
		const existing = Object.keys(requestHeaders).find(
			(key) => key.toLowerCase() === name.toLowerCase(),
		);
		requestHeaders[existing ?? name] = value;
	};
	setHeader(
		"Cookie",
		headerValue(credentialEntry.requestHeaders, "cookie") ??
			cookieHeaderFromCookies(credentialEntry.requestCookies),
	);
	setHeader(
		"Authorization",
		headerValue(credentialEntry.requestHeaders, "authorization"),
	);
	for (const [name, value] of Object.entries(credentialEntry.requestHeaders)) {
		if (
			/^x-/i.test(name) &&
			/(?:auth|csrf|xsrf|token|session|api-key)/i.test(name)
		) {
			setHeader(name, value);
		}
	}
	return {
		...entry,
		requestCookies:
			credentialEntry.requestCookies &&
			credentialEntry.requestCookies.length > 0
				? credentialEntry.requestCookies
				: entry.requestCookies,
		requestHeaders,
	};
};

const entriesFromRecording = (recording: StoredRecording): PendingEntry[] =>
	recording.har.log.entries
		.map((raw): PendingEntry | null => {
			if (typeof raw !== "object" || raw === null) {
				return null;
			}
			const entry = raw as {
				request?: {
					headers?: unknown;
					method?: unknown;
					postData?: { mimeType?: unknown; text?: unknown };
					url?: unknown;
				};
				response?: {
					content?: {
						encoding?: unknown;
						mimeType?: unknown;
						text?: unknown;
					};
					headers?: unknown;
					status?: unknown;
					statusText?: unknown;
				};
				startedDateTime?: unknown;
			};
			if (
				typeof entry.request?.method !== "string" ||
				typeof entry.request.url !== "string"
			) {
				return null;
			}
			return {
				body:
					typeof entry.response?.content?.text === "string"
						? entry.response.content.text
						: undefined,
				bodyBase64: entry.response?.content?.encoding === "base64",
				method: entry.request.method.toUpperCase(),
				postData:
					typeof entry.request.postData?.text === "string"
						? entry.request.postData.text
						: undefined,
				postDataMime:
					typeof entry.request.postData?.mimeType === "string"
						? entry.request.postData.mimeType
						: undefined,
				requestCookies: requestCookiesFromHar(entry.request),
				requestHeaders: headersFromHar(entry.request.headers),
				responseHeaders: headersFromHar(entry.response?.headers),
				responseMime:
					typeof entry.response?.content?.mimeType === "string"
						? entry.response.content.mimeType
						: undefined,
				startedDateTime:
					typeof entry.startedDateTime === "string"
						? entry.startedDateTime
						: new Date().toISOString(),
				status:
					typeof entry.response?.status === "number"
						? entry.response.status
						: undefined,
				statusText:
					typeof entry.response?.statusText === "string"
						? entry.response.statusText
						: undefined,
				url: entry.request.url,
			};
		})
		.filter((entry): entry is PendingEntry => entry !== null);

const curlFrom = (input: {
	body?: string;
	headers: ReplayHeader[];
	method: string;
	url: string;
}) => {
	const parts = [
		"curl",
		"-i",
		"-X",
		shellQuote(input.method),
		shellQuote(input.url),
	];
	for (const header of input.headers) {
		parts.push("-H", shellQuote(`${header.name}: ${header.value}`));
	}
	if (input.body !== undefined) {
		parts.push("--data-raw", shellQuote(input.body));
	}
	return parts.join(" ");
};

const isHtmlErrorSample = (entry: PendingEntry) =>
	(entry.status ?? 0) >= 400 &&
	/(?:html|text\/plain)/i.test(entry.responseMime ?? "") &&
	/(?:<html|<title>[^<]*(?:error|denied|forbidden|unavailable)|access denied|access support|access this page|not authorized|not authorised|request blocked|we'?re sorry)/i.test(
		entry.body ?? "",
	);

export const buildReplayBundle = (input: {
	method?: string;
	operationName?: string;
	path?: string;
	profile: SiteProfile;
	recording?: StoredRecording | null;
	recordings?: StoredRecording[];
	templateKey?: string;
}): ReplayBundle => {
	const recordings =
		input.recordings ?? (input.recording ? [input.recording] : []);
	if (recordings.length === 0) {
		throw new Error("No recording exists for this profile.");
	}
	const latestRecording = recordings[0];
	const authBundle =
		input.profile.authBundle ??
		deriveAuthBundle(entriesFromRecording(latestRecording), {
			capturedAt: latestRecording.createdAt,
			recordingId: latestRecording.id,
		});
	const endpoints = selectedEndpoints(input.profile, input);
	if (endpoints.length === 0) {
		throw new Error("No matching endpoint was found for replay.");
	}
	let endpoint: EndpointSummary | null = null;
	let entry: PendingEntry | null = null;
	let sampleRecording: StoredRecording | null = null;
	for (const candidate of endpoints) {
		for (const recording of recordings) {
			const candidateEntry = entryFromRecording(recording, candidate);
			if (candidateEntry) {
				endpoint = candidate;
				entry = candidateEntry;
				sampleRecording = recording;
				break;
			}
		}
		if (entry) {
			break;
		}
		for (const recording of recordings) {
			const candidateEntry = entryFromRecording(recording, candidate, {
				allowTemplate: true,
			});
			if (candidateEntry) {
				endpoint = candidate;
				entry = candidateEntry;
				sampleRecording = recording;
				break;
			}
		}
		if (entry) {
			break;
		}
	}
	if (!(endpoint && entry && sampleRecording)) {
		throw new Error("No sampled request was found for this endpoint.");
	}
	const latestAuthEntry = latestAuthEntryForEndpoint(input.profile, endpoint);
	const authValueSource = latestAuthEntry ? "latest-auth" : "recording";
	entry = withCredentialMaterial(
		entry,
		latestAuthEntry ?? credentialEntryForEndpoint(recordings, endpoint),
	);
	const headers = replayHeaders(entry, {
		includeSecrets: true,
	});
	const redactedHeaders = replayHeaders(entry, {
		includeSecrets: false,
	});
	const body = entry.postData;
	const warnings: string[] = [];
	if (authBundle.status !== "ready") {
		warnings.push("Auth bundle needs recapture.");
	}
	if (authValueSource === "latest-auth" && input.profile.latestAuth) {
		if (input.profile.latestAuth.status === "expired") {
			warnings.push("Latest auth values are expired; recapture auth.");
		} else if (input.profile.latestAuth.status === "validation-needed") {
			warnings.push("Latest auth values need validation.");
		}
		for (const warning of input.profile.latestAuth.warnings ?? []) {
			warnings.push(warning);
		}
	}
	if (entry.status !== undefined && entry.status >= 400) {
		warnings.push(
			`The captured browser sample returned ${entry.status}${
				entry.responseMime ? ` ${entry.responseMime}` : ""
			}.`,
		);
	}
	if (isHtmlErrorSample(entry)) {
		warnings.push(
			"The captured sample was an HTML access/error page, not a successful API response.",
		);
	}
	if (
		!(
			headers.some((header) => header.secret) ||
			(entry.requestCookies ?? []).some((cookie) => cookie.value)
		)
	) {
		warnings.push(
			"No reusable credential material was captured for this sampled request.",
		);
	}
	return {
		authBundle,
		authValueSource,
		body,
		contentType: entry.postDataMime,
		cookies: replayCookies(entry.requestCookies, {
			includeSecrets: true,
		}),
		credentialSource: "recording",
		curl: curlFrom({
			body,
			headers,
			method: entry.method,
			url: entry.url,
		}),
		endpoint,
		headers,
		latestAuth: redactLatestAuth(input.profile.latestAuth),
		method: entry.method,
		recordingId: sampleRecording.id,
		redactedCurl: curlFrom({
			body,
			headers: redactedHeaders,
			method: entry.method,
			url: entry.url,
		}),
		url: entry.url,
		warnings,
	};
};
