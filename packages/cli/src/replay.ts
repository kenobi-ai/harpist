import {
	type CredentialSet,
	credentialSetStatus,
} from "../../core/src/credentials";
import type { CapturedCookie, PendingEntry } from "../../core/src/har";
import {
	type AuthBundle,
	deriveAuthBundle,
	type EndpointSummary,
	type LatestAuthValue,
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
	authValueSource: "credential-set" | "latest-auth" | "recording";
	body?: string;
	contentType?: string;
	cookies: ReplayCookie[];
	credentialSetId?: string;
	credentialSource: "ledger" | "recording";
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

export type ExecutedReplayResponse = {
	body: string;
	headers: [string, string][];
	status: number;
	statusText: string;
};

export type ReplayResponseFormatOptions = {
	color?: boolean;
	request?: Pick<ReplayBundle, "body" | "headers" | "method" | "url">;
	verbose?: boolean;
};

export type ReplayQueryValue =
	| boolean
	| null
	| number
	| string
	| Array<boolean | number | string>;

export type ReplayRequestInput = {
	body?: unknown;
	params?: Record<string, string>;
	query?: Record<string, ReplayQueryValue>;
};

export type ReplayFetch = (
	url: string,
	init: RequestInit,
) => Promise<Pick<Response, "headers" | "status" | "statusText" | "text">>;

const redacted = "<redacted>";

const ansi = {
	blue: "\x1b[34m",
	bold: "\x1b[1m",
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	magenta: "\x1b[35m",
	red: "\x1b[31m",
	reset: "\x1b[0m",
	yellow: "\x1b[33m",
};

const secretHeaderPattern =
	/^(?:authorization|cookie|proxy-authorization|x-api-key|api-key|x-auth-token|x-access-token|x-session-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$/i;

const safeVisibleHeaderPattern =
	/^(?:accept|accept-language|content-type|origin|priority|sec-[a-z0-9-]+|traceparent|user-agent)$/i;

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

const authValuesEntryForEndpoint = (
	authValues: LatestAuthValue[],
	endpoint: EndpointSummary,
	capturedAt?: string,
): PendingEntry | null => {
	const values = authValues.filter(
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
			capturedAt ?? values[0]?.capturedAt ?? new Date().toISOString(),
		url: `https://${endpoint.host}${endpoint.path}`,
	};
};

const latestAuthEntryForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
): PendingEntry | null =>
	profile.latestAuth && profile.latestAuth.values.length > 0
		? authValuesEntryForEndpoint(
				profile.latestAuth.values,
				endpoint,
				profile.latestAuth.capturedAt,
			)
		: null;

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

const hasOwn = (value: object, key: string) => Object.hasOwn(value, key);

const jsonBodyFrom = (value: unknown) =>
	value === undefined ? undefined : JSON.stringify(value);

const requestInputHasBody = (input: ReplayRequestInput) =>
	hasOwn(input, "body");

const withJsonContentType = (headers: ReplayHeader[]) => {
	let found = false;
	const next = headers.map((header) => {
		if (header.name.toLowerCase() !== "content-type") {
			return header;
		}
		found = true;
		return {
			...header,
			redacted: false,
			secret: false,
			value: "application/json",
		};
	});
	if (found) {
		return next;
	}
	return [
		...next,
		{
			name: "Content-Type",
			redacted: false,
			secret: false,
			value: "application/json",
		},
	];
};

const redactedHeadersFrom = (headers: ReplayHeader[]) =>
	headers.map((header) =>
		header.secret || !safeVisibleHeaderPattern.test(header.name)
			? {
					...header,
					redacted: true,
					value: redacted,
				}
			: header,
	);

const replacePathParams = (
	url: URL,
	template: string,
	params: Record<string, string>,
) => {
	const templateParts = template.split("/").filter(Boolean);
	if (templateParts.length === 0) {
		url.pathname = "/";
		return;
	}
	const currentParts = url.pathname.split("/").filter(Boolean);
	url.pathname = `/${templateParts
		.map((part, index) => {
			const match = /^\{([^}]+)\}$/.exec(part);
			if (!match) {
				return part;
			}
			const name = match[1] ?? "";
			return encodeURIComponent(
				params[name] ?? decodeURIComponent(currentParts[index] ?? ""),
			);
		})
		.join("/")}`;
};

const applyQueryInput = (url: URL, query: Record<string, ReplayQueryValue>) => {
	for (const [name, rawValue] of Object.entries(query)) {
		url.searchParams.delete(name);
		if (rawValue === null) {
			continue;
		}
		const values = Array.isArray(rawValue) ? rawValue : [rawValue];
		for (const value of values) {
			url.searchParams.append(name, String(value));
		}
	}
};

const redactJsonValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(redactJsonValue);
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([name, item]) => [
				name,
				redactJsonValue(item),
			]),
		);
	}
	return value === null ? null : redacted;
};

const redactedBodyFrom = (body?: string, contentType?: string) => {
	if (body === undefined) {
		return;
	}
	if (
		/(?:^|[/+])json(?:$|[;\s])/i.test(contentType ?? "") ||
		/^\s*[[{]/.test(body)
	) {
		try {
			return JSON.stringify(redactJsonValue(JSON.parse(body)));
		} catch {}
	}
	if (/application\/x-www-form-urlencoded/i.test(contentType ?? "")) {
		const input = new URLSearchParams(body);
		const output = new URLSearchParams();
		for (const name of new Set(input.keys())) {
			for (const _value of input.getAll(name)) {
				output.append(name, redacted);
			}
		}
		return output.toString();
	}
	return redacted;
};

const redactedUrlFrom = (rawUrl: string, template?: string) => {
	const url = new URL(rawUrl);
	if (template) {
		const params = Object.fromEntries(
			[...template.matchAll(/\{([^}]+)\}/g)].map((match) => [
				match[1] ?? "id",
				redacted,
			]),
		);
		replacePathParams(url, template, params);
	}
	for (const name of new Set(url.searchParams.keys())) {
		const count = url.searchParams.getAll(name).length;
		url.searchParams.delete(name);
		for (let index = 0; index < count; index += 1) {
			url.searchParams.append(name, redacted);
		}
	}
	return url.toString();
};

const redactedCurlFrom = (input: {
	body?: string;
	contentType?: string;
	endpoint: Pick<EndpointSummary, "template">;
	headers: ReplayHeader[];
	method: string;
	url: string;
}) =>
	curlFrom({
		body: redactedBodyFrom(input.body, input.contentType),
		headers: redactedHeadersFrom(input.headers),
		method: input.method,
		url: redactedUrlFrom(input.url, input.endpoint.template),
	});

export const applyReplayRequestInput = (
	bundle: ReplayBundle,
	input: ReplayRequestInput,
): ReplayBundle => {
	const url = new URL(bundle.url);
	if (input.params && Object.keys(input.params).length > 0) {
		replacePathParams(url, bundle.endpoint.template, input.params);
	}
	if (input.query) {
		applyQueryInput(url, input.query);
	}
	const hasBody = requestInputHasBody(input);
	const body = hasBody ? jsonBodyFrom(input.body) : bundle.body;
	const headers = hasBody
		? withJsonContentType(bundle.headers)
		: bundle.headers;
	const contentType = hasBody ? "application/json" : bundle.contentType;
	const nextUrl = url.toString();
	return {
		...bundle,
		body,
		contentType,
		curl: curlFrom({
			body,
			headers,
			method: bundle.method,
			url: nextUrl,
		}),
		headers,
		redactedCurl: redactedCurlFrom({
			body,
			contentType,
			endpoint: bundle.endpoint,
			headers,
			method: bundle.method,
			url: nextUrl,
		}),
		url: nextUrl,
	};
};

export const executeReplayBundle = async (
	bundle: Pick<ReplayBundle, "body" | "headers" | "method" | "url">,
	options: {
		fetch?: ReplayFetch;
	} = {},
): Promise<ExecutedReplayResponse> => {
	const headers = new Headers();
	for (const header of bundle.headers) {
		headers.set(header.name, header.value);
	}
	const fetcher = options.fetch ?? fetch;
	const response = await fetcher(bundle.url, {
		body: bundle.body,
		headers,
		method: bundle.method,
		redirect: "manual",
	});
	return {
		body: await response.text(),
		headers: [...response.headers.entries()],
		status: response.status,
		statusText: response.statusText,
	};
};

const colorize = (code: string, value: string, enabled: boolean) =>
	enabled ? `${code}${value}${ansi.reset}` : value;

const statusColor = (status: number) => {
	if (status >= 500) {
		return ansi.red;
	}
	if (status >= 400) {
		return ansi.yellow;
	}
	if (status >= 300) {
		return ansi.blue;
	}
	return ansi.green;
};

const headerValueFrom = (headers: [string, string][], name: string) => {
	const target = name.toLowerCase();
	return headers.find(
		([headerName]) => headerName.toLowerCase() === target,
	)?.[1];
};

const isJsonContentType = (contentType?: string) => {
	const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
	return (
		mediaType === "application/json" ||
		mediaType === "text/json" ||
		mediaType?.endsWith("+json") === true
	);
};

const couldBeJsonBody = (body: string) => {
	const trimmed = body.trimStart();
	return trimmed.startsWith("{") || trimmed.startsWith("[");
};

const jsonTokenPattern =
	/"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g;

const colorJson = (json: string, enabled: boolean) => {
	if (!enabled) {
		return json;
	}
	return json.replace(jsonTokenPattern, (token, offset: number) => {
		if (token.startsWith('"')) {
			const afterToken = json.slice(offset + token.length);
			return colorize(
				/^\s*:/.test(afterToken) ? ansi.cyan : ansi.green,
				token,
				true,
			);
		}
		if (token === "true" || token === "false") {
			return colorize(ansi.magenta, token, true);
		}
		if (token === "null") {
			return colorize(ansi.dim, token, true);
		}
		return colorize(ansi.yellow, token, true);
	});
};

const formatBody = (
	body: string,
	headers: [string, string][],
	options: ReplayResponseFormatOptions,
) => {
	const contentType = headerValueFrom(headers, "content-type");
	if (!(isJsonContentType(contentType) || couldBeJsonBody(body))) {
		return body;
	}
	try {
		const formatted = JSON.stringify(JSON.parse(body), null, 2);
		return formatted === undefined
			? body
			: colorJson(formatted, options.color === true);
	} catch {
		return body;
	}
};

const formatHeaders = (headers: [string, string][], color: boolean) =>
	headers.map(([name, value]) =>
		[
			colorize(ansi.cyan, name, color),
			colorize(ansi.dim, ":", color),
			` ${colorize(ansi.dim, value, color)}`,
		].join(""),
	);

const requestHeadersFrom = (headers: ReplayHeader[]): [string, string][] =>
	headers.map((header) => [
		header.name,
		header.secret || header.redacted ? redacted : header.value,
	]);

const formatRequest = (
	request: Pick<ReplayBundle, "body" | "headers" | "method" | "url">,
	options: ReplayResponseFormatOptions,
) => {
	const color = options.color === true;
	const redactedHeaders = redactedHeadersFrom(request.headers);
	const headers = requestHeadersFrom(redactedHeaders);
	const contentType = redactedHeaders.find(
		(header) => header.name.toLowerCase() === "content-type",
	)?.value;
	const lines = [
		colorize(ansi.bold, "Request", color),
		colorize(
			ansi.magenta,
			`${request.method} ${redactedUrlFrom(request.url)}`,
			color,
		),
		...formatHeaders(headers, color),
	];
	if (request.body !== undefined) {
		lines.push(
			"",
			formatBody(
				redactedBodyFrom(request.body, contentType) ?? redacted,
				headers,
				options,
			),
		);
	}
	return lines;
};

export const formatExecutedReplayResponse = (
	response: ExecutedReplayResponse,
	options: ReplayResponseFormatOptions = {},
) => {
	const color = options.color === true;
	const responseBody = formatBody(response.body, response.headers, options);
	if (options.verbose !== true) {
		return responseBody;
	}
	const statusLine = colorize(
		`${ansi.bold}${statusColor(response.status)}`,
		`HTTP ${response.status}${
			response.statusText ? ` ${response.statusText}` : ""
		}`,
		color,
	);
	const requestLines = options.request
		? formatRequest(options.request, options)
		: [];
	return [
		...requestLines,
		...(requestLines.length > 0 ? [""] : []),
		colorize(ansi.bold, "Response", color),
		statusLine,
		...formatHeaders(response.headers, color),
		"",
		responseBody,
	].join("\n");
};

export const buildReplayBundle = (input: {
	credentialSet?: CredentialSet | null;
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
	const credentialSetEntry = input.credentialSet
		? authValuesEntryForEndpoint(
				input.credentialSet.values,
				endpoint,
				input.credentialSet.capturedAt,
			)
		: null;
	const latestAuthEntry = credentialSetEntry
		? null
		: latestAuthEntryForEndpoint(input.profile, endpoint);
	const authValueSource = credentialSetEntry
		? "credential-set"
		: latestAuthEntry
			? "latest-auth"
			: "recording";
	entry = withCredentialMaterial(
		entry,
		credentialSetEntry ??
			latestAuthEntry ??
			credentialEntryForEndpoint(recordings, endpoint),
	);
	const headers = replayHeaders(entry, {
		includeSecrets: true,
	});
	const body = entry.postData;
	const warnings: string[] = [];
	if (authBundle.status !== "ready") {
		warnings.push("Auth bundle needs recapture.");
	}
	if (input.credentialSet && !credentialSetEntry) {
		warnings.push(
			`Credential '${input.credentialSet.id}' has no values matching ${endpoint.host}; falling back to the latest captured auth.`,
		);
	}
	if (input.credentialSet && credentialSetEntry) {
		const setStatus = credentialSetStatus(input.credentialSet);
		if (setStatus === "expired") {
			warnings.push(
				`Credential '${input.credentialSet.id}' is expired; run \`harpist auth login ${endpoint.host}\` to capture fresh credentials.`,
			);
		} else if (setStatus === "invalid") {
			warnings.push(
				`Credential '${input.credentialSet.id}' failed its last check${
					input.credentialSet.validation?.statusCode
						? ` (HTTP ${input.credentialSet.validation.statusCode})`
						: ""
				}; run \`harpist auth login ${endpoint.host}\` to capture fresh credentials.`,
			);
		}
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
		...(credentialSetEntry && input.credentialSet
			? { credentialSetId: input.credentialSet.id }
			: {}),
		credentialSource: credentialSetEntry ? "ledger" : "recording",
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
		redactedCurl: redactedCurlFrom({
			body,
			contentType: entry.postDataMime,
			endpoint,
			headers,
			method: entry.method,
			url: entry.url,
		}),
		url: entry.url,
		warnings,
	};
};
