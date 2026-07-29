import type { CapturedCookie, PendingEntry } from "../../core/src/har";
import type {
	AccessSummary,
	AuthSummary,
	EndpointIdentityOverride,
	EndpointSummary,
	ProfileArtifacts,
	SiteProfile,
} from "../../core/src/profiles";
import {
	applyEndpointIdentityOverrides,
	deriveAuthBundle,
	deriveAuthSummary,
	deriveLatestAuth,
	summariseEndpoints,
} from "../../core/src/profiles";
import { buildRecordedSiteArtifacts } from "./artifacts";
import {
	operationNameFromSummary,
	uniqueOperationName,
} from "./replay-display";
import type { BridgeStore, StoredRecording } from "./store";

export type EndpointDecision = {
	access?: AccessSummary;
	description: string;
	endpoint: EndpointSummary;
	included: boolean;
	notes: string;
	operationName: string;
	samples?: PendingEntry[];
	tags: string[];
};

export type RefineResult = {
	excludedEndpointCount: number;
	host: string;
	includedEndpointCount: number;
	openapiPathCount: number;
	profile: SiteProfile;
	recordingId?: string;
};

const staticExtensionPattern =
	/\.(?:avif|bmp|css|eot|gif|ico|jpeg|jpg|js|json\.br|map|mjs|mp3|mp4|otf|pdf|png|svg|ttf|txt|wav|webm|webp|woff|woff2)(?:$|[?#])/i;

const staticPathPatterns = [
	/\/(?:assets|asset|fonts|font|images|image|img|media|static)\//i,
	/\/(?:favicon|apple-touch-icon|manifest)\b/i,
	/\/(?:_next|webpack|vite)\//i,
];

const telemetryPatterns = [
	/^bag\.api\.bbc\.co\.uk$/i,
	/^geolocation\.onetrust\.com$/i,
	/(?:^|\.)ads?(?:\.|-)/i,
	/analytics/i,
	/amazon-adsystem/i,
	/beacon/i,
	/bid(?:der)?/i,
	/casalemedia/i,
	/chartbeat/i,
	/collect/i,
	/connectad/i,
	/criteo/i,
	/conviva/i,
	/datadog/i,
	/doubleclick/i,
	/googlesyndication/i,
	/metrics/i,
	/newrelic/i,
	/nielsen/i,
	/onetrust/i,
	/optimizely/i,
	/openrtb/i,
	/prebid/i,
	/pubmatic/i,
	/rtb/i,
	/scorecardresearch/i,
	/sentry/i,
	/smartadserver/i,
	/teads/i,
	/telemetry/i,
	/tracking/i,
	/yellowblue/i,
	/xiti/i,
];

const methodAllowsMutation = (method: string) =>
	["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());

const neutralDocumentationPatterns = [
	/included because/i,
	/observed during the recorded browser workflow/i,
	/^Gets? .+ observed during/i,
	/^Submits? .+ observed during/i,
	/^Updates? .+ observed during/i,
	/^Deletes? .+ observed during/i,
	/^Checks? .+ observed during/i,
	/used by the site's browser protection flow/i,
];

const hasText = (value?: string) => value !== undefined && value.trim() !== "";

const isNeutralDocumentationText = (value?: string) => {
	const text = value?.trim();
	return (
		!text || neutralDocumentationPatterns.some((pattern) => pattern.test(text))
	);
};

export const hasCuratedEndpointDocumentation = (endpoint: EndpointSummary) =>
	hasText(endpoint.description) &&
	hasText(endpoint.notes) &&
	!isNeutralDocumentationText(endpoint.notes);

export const applyExistingEndpointAnnotations = (
	endpoint: EndpointSummary,
	decision: EndpointDecision,
	options: {
		htmlErrorOnly: boolean;
	},
): EndpointDecision => {
	const curated = hasCuratedEndpointDocumentation(endpoint);
	const tags = (endpoint.tags ?? []).filter((tag) => tag.trim() !== "");
	const included = options.htmlErrorOnly
		? false
		: endpoint.included === false
			? false
			: curated && endpoint.included === true
				? true
				: decision.included;

	return {
		...decision,
		description: curated
			? (endpoint.description?.trim() ?? decision.description)
			: decision.description,
		included,
		notes: options.htmlErrorOnly
			? "Excluded because the sampled browser request returned an HTML access/error page."
			: curated
				? (endpoint.notes?.trim() ?? decision.notes)
				: decision.notes,
		operationName: curated
			? endpoint.operationName?.trim() || decision.operationName
			: decision.operationName,
		tags: curated && tags.length > 0 ? tags : decision.tags,
	};
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

const hasApiShape = (endpoint: EndpointSummary) =>
	/\/(?:api|graphql|v\d+|my|account|authentication|user|users|session|auth|search|content|data|plays|playlist|recommendations)(?:\/|$)/i.test(
		endpoint.template,
	) ||
	/\/(?:userinfo|wc-data)(?:\/|$)/i.test(endpoint.template) ||
	/(?:^|\.)api\./i.test(endpoint.host);

const isStaticEndpoint = (endpoint: EndpointSummary) =>
	staticExtensionPattern.test(endpoint.path) ||
	staticPathPatterns.some((pattern) => pattern.test(endpoint.path));

const isTelemetryEndpoint = (endpoint: EndpointSummary) =>
	telemetryPatterns.some(
		(pattern) => pattern.test(endpoint.host) || pattern.test(endpoint.path),
	);

const endpointCategory = (endpoint: EndpointSummary) => {
	const path = endpoint.template.toLowerCase();
	const host = endpoint.host.toLowerCase();
	if (/captcha|challenge|authentication|verification|fraud|bot/.test(path)) {
		return "challenge";
	}
	if (
		/account|favorite|favourite|me|profile|saved|session|tracked|user|users|watchlist/.test(
			path,
		)
	) {
		return "account";
	}
	if (/query|recommendations|related|results|search|suggest/.test(path)) {
		return "search";
	}
	if (/brand|campaign|content|marketing|promo/.test(path)) {
		return "marketing";
	}
	if (host.startsWith("product.")) {
		return "product";
	}
	if (/geo|consent|onetrust/.test(path) || /onetrust/.test(host)) {
		return "consent";
	}
	if (/bid|prebid|openrtb|ad/.test(path) || /ads?|rtb/.test(host)) {
		return "advertising";
	}
	if (/rum|apm|logging|events/.test(path) || /apm|logging/.test(host)) {
		return "telemetry";
	}
	return "api";
};

const stopWords = new Set([
	"api",
	"v1",
	"v2",
	"v3",
	"web",
	"service",
	"services",
]);

const splitWords = (value: string) =>
	value
		.replace(/\{[^}]+\}/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[^a-zA-Z0-9]+/)
		.map((word) => word.trim().toLowerCase())
		.filter((word) => word && !stopWords.has(word) && !/^\d+$/.test(word));

const singularise = (word: string) =>
	word.endsWith("ies")
		? `${word.slice(0, -3)}y`
		: word.endsWith("ses")
			? word
			: word.endsWith("s") && word.length > 3
				? word.slice(0, -1)
				: word;

const titleCase = (value: string) =>
	value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const endpointWords = (endpoint: EndpointSummary) => {
	const words = splitWords(`${endpoint.template} ${endpoint.path}`);
	const deduped: string[] = [];
	for (const word of words) {
		if (deduped.at(-1) !== word && !deduped.includes(word)) {
			deduped.push(word);
		}
	}
	return deduped;
};

const chooseResource = (words: string[], category: string) => {
	const important = words.filter(
		(word) =>
			![
				"get",
				"set",
				"add",
				"create",
				"update",
				"delete",
				"remove",
				"check",
				"is",
				"all",
				"by",
			].includes(word),
	);
	const tail = important.slice(-3);
	if (tail.length === 0) {
		return category.replace(/-/g, " ");
	}
	return tail.join(" ");
};

const actionForEndpoint = (endpoint: EndpointSummary, words: string[]) => {
	const method = endpoint.method.toUpperCase();
	if (method === "DELETE") {
		return "Delete";
	}
	if (method === "PATCH" || method === "PUT") {
		return "Update";
	}
	if (method === "POST") {
		if (words.includes("create")) {
			return "Create";
		}
		if (words.includes("add")) {
			return "Add";
		}
		if (words.includes("save")) {
			return "Save";
		}
		if (words.includes("remove")) {
			return "Remove";
		}
		return "Submit";
	}
	if (
		words.includes("status") ||
		words.includes("eligible") ||
		words.includes("check")
	) {
		return "Check";
	}
	if (
		words.includes("list") ||
		words.includes("all") ||
		words.includes("searches") ||
		words.includes("results")
	) {
		return "List";
	}
	return "Get";
};

const endpointDocumentation = (endpoint: EndpointSummary, category: string) => {
	const path = `${endpoint.template} ${endpoint.path}`.toLowerCase();
	const words = endpointWords(endpoint);
	const action = actionForEndpoint(endpoint, words);
	const resource = chooseResource(words, category);
	const summary = titleCase(`${action} ${singularise(resource)}`);
	const scope =
		category === "account"
			? " for the signed-in account"
			: category === "challenge"
				? " for the browser challenge flow"
				: "";
	const replayNote = methodAllowsMutation(endpoint.method)
		? " Replay includes the captured request body when one was observed."
		: " Replay uses the captured request sample and browser session when available.";

	if (/captcha|challenge|authentication|verification|fraud|bot/.test(path)) {
		return {
			description:
				"Fetches challenge or verification data used by the site's browser protection flow.",
			summary: "Get Challenge Configuration",
		};
	}
	return {
		description: `${action}s ${resource}${scope} observed during the recorded browser workflow.${replayNote}`,
		summary,
	};
};

const classifyEndpoint = (
	endpoint: EndpointSummary,
	profile: SiteProfile,
): EndpointDecision => {
	const tags = new Set<string>();
	const sameSite = sameSiteHost(endpoint.host, profile.host);
	const staticAsset = isStaticEndpoint(endpoint);
	const telemetry = isTelemetryEndpoint(endpoint);
	const apiLike = hasApiShape(endpoint);
	const mutating = methodAllowsMutation(endpoint.method);
	const preflight = endpoint.method.toUpperCase() === "OPTIONS";
	const category = endpointCategory(endpoint);

	if (sameSite) {
		tags.add("same-site");
	} else {
		tags.add("third-party");
	}
	if (apiLike) {
		tags.add("api");
	}
	if (mutating) {
		tags.add("write");
	}
	if (staticAsset) {
		tags.add("static");
	}
	if (telemetry) {
		tags.add("telemetry");
	}
	if (preflight) {
		tags.add("preflight");
	}
	tags.add(category);

	const included =
		!(staticAsset || telemetry || preflight) &&
		sameSite &&
		(mutating || apiLike);
	const documentation = endpointDocumentation(endpoint, category);
	const reason = included
		? documentation.description
		: preflight
			? "Excluded as a CORS preflight request."
			: staticAsset
				? "Excluded as static/media asset traffic."
				: telemetry
					? "Excluded as telemetry/analytics traffic."
					: sameSite
						? "Excluded as non-API page traffic."
						: "Excluded as third-party vendor traffic.";

	return {
		description: documentation.summary,
		endpoint,
		included,
		notes: reason,
		operationName: operationNameFromSummary(
			documentation.summary,
			endpoint.method,
		),
		tags: [...tags],
	};
};

const buildCliNotes = (profile: SiteProfile, decisions: EndpointDecision[]) =>
	[
		`# ${profile.host}`,
		"",
		"Refined API candidates:",
		...decisions
			.filter((item) => item.included)
			.map(
				(decision) =>
					`- ${decision.operationName}: ${decision.endpoint.method} https://${decision.endpoint.host}${decision.endpoint.template}${
						decision.access ? ` (${decision.access.label})` : ""
					}`,
			),
		"",
		"Use `harpist openapi get <host>` or `harpist contract get <host>` to read generated artifacts.",
	].join("\n");

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

const headerValue = (headers: Record<string, string>, name: string) => {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}
};

const cookieNames = (entry: PendingEntry) => [
	...new Set([
		...(headerValue(entry.requestHeaders, "cookie") ?? "")
			.split(";")
			.map((part) => part.trim().split("=")[0]?.trim())
			.filter((name): name is string => Boolean(name)),
		...(entry.requestCookies ?? []).map((cookie) => cookie.name),
	]),
];

const harSamplesByExactKey = (
	recording: StoredRecording | null,
): Map<string, PendingEntry[]> => {
	const samples = new Map<string, PendingEntry[]>();
	if (!recording) {
		return samples;
	}
	for (const raw of recording.har.log.entries) {
		if (typeof raw !== "object" || raw === null) {
			continue;
		}
		const entry = raw as {
			request?: {
				_harpist?: unknown;
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
		let url: URL;
		try {
			url = new URL(entry.request.url);
		} catch {
			continue;
		}
		const method = entry.request.method.toUpperCase();
		const key = `${method} ${url.host}${url.pathname || "/"}`;
		const pendingEntry: PendingEntry = {
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
		samples.set(key, [...(samples.get(key) ?? []), pendingEntry]);
	}
	return samples;
};

const mergeObservedEndpoint = (
	existing: EndpointSummary,
	observed: EndpointSummary,
): EndpointSummary => ({
	...existing,
	...observed,
	access: existing.access,
	description: existing.description,
	included: existing.included,
	lastSeenAt:
		existing.lastSeenAt.localeCompare(observed.lastSeenAt) > 0
			? existing.lastSeenAt
			: observed.lastSeenAt,
	notes: existing.notes,
	operationName: existing.operationName,
	tags: existing.tags,
});

export const refreshEndpointObservations = (
	endpoints: EndpointSummary[],
	samples: PendingEntry[],
	options: {
		identityOverrides?: EndpointIdentityOverride[];
		removedTemplateKeys?: string[];
	} = {},
) => {
	const removedTemplateKeys = new Set(options.removedTemplateKeys ?? []);
	const observedEndpoints = applyEndpointIdentityOverrides(
		summariseEndpoints(samples),
		options.identityOverrides,
	).filter((endpoint) => !removedTemplateKeys.has(endpoint.templateKey));
	const observedByExactKey = new Map(
		observedEndpoints.map((endpoint) => [endpoint.exactKey, endpoint]),
	);
	const existingByExactKey = new Map<string, EndpointSummary>();
	const byTemplate = new Map<string, EndpointSummary>();
	for (const endpoint of applyEndpointIdentityOverrides(
		endpoints,
		options.identityOverrides,
	)) {
		if (removedTemplateKeys.has(endpoint.templateKey)) {
			continue;
		}
		existingByExactKey.set(endpoint.exactKey, endpoint);
		const observed = observedByExactKey.get(endpoint.exactKey);
		if (observed && observed.templateKey !== endpoint.templateKey) {
			continue;
		}
		byTemplate.set(endpoint.templateKey, endpoint);
	}
	for (const observed of observedEndpoints) {
		const existing =
			existingByExactKey.get(observed.exactKey) ??
			byTemplate.get(observed.templateKey);
		byTemplate.set(
			observed.templateKey,
			existing ? mergeObservedEndpoint(existing, observed) : observed,
		);
	}
	return [...byTemplate.values()].sort((left, right) =>
		left.templateKey.localeCompare(right.templateKey),
	);
};

const mergeSampleMaps = (recordings: StoredRecording[]) => {
	const merged = new Map<string, PendingEntry[]>();
	for (const recording of recordings) {
		for (const [key, samples] of harSamplesByExactKey(recording)) {
			merged.set(key, [...(merged.get(key) ?? []), ...samples]);
		}
	}
	return merged;
};

const samplesForEndpoint = (
	samplesByKey: Map<string, PendingEntry[]>,
	endpoint: EndpointSummary,
) => {
	const exactSamples = samplesByKey.get(endpoint.exactKey);
	if (exactSamples && exactSamples.length > 0) {
		return exactSamples;
	}
	const matched: PendingEntry[] = [];
	for (const samples of samplesByKey.values()) {
		for (const sample of samples) {
			if (sample.method.toUpperCase() !== endpoint.method) {
				continue;
			}
			let url: URL;
			try {
				url = new URL(sample.url);
			} catch {
				continue;
			}
			if (
				url.host === endpoint.host &&
				pathMatchesTemplate(url.pathname || "/", endpoint.template)
			) {
				matched.push(sample);
			}
		}
	}
	return matched;
};

const isHtmlErrorSample = (sample: PendingEntry) =>
	(sample.status ?? 0) >= 400 &&
	/(?:html|text\/plain)/i.test(sample.responseMime ?? "") &&
	/(?:<html|<title>[^<]*(?:error|denied|forbidden|unavailable)|access denied|access support|access this page|not authorized|not authorised|request blocked|we'?re sorry)/i.test(
		sample.body ?? "",
	);

const accessTypeFromAuth = (
	type: AuthSummary["type"],
): AccessSummary["type"] => {
	if (
		type === "api-key" ||
		type === "basic-auth" ||
		type === "bearer-token" ||
		type === "public-client-key" ||
		type === "session-cookie" ||
		type === "signed-request"
	) {
		return type;
	}
	if (type === "cookie-csrf") {
		return "session-cookie";
	}
	return "unknown";
};

const accessFromSamples = (
	endpoint: EndpointSummary,
	profile: SiteProfile,
	samples: PendingEntry[],
): AccessSummary => {
	if (samples.length > 0) {
		const auth = deriveAuthSummary(samples);
		if (auth.credentialed && auth.type) {
			return {
				confidence: auth.confidence,
				credentialed: true,
				evidence: auth.evidence,
				label: auth.label,
				type: accessTypeFromAuth(auth.type),
			};
		}
		const publicClientKey = auth.mechanisms?.find(
			(mechanism) => mechanism.type === "public-client-key",
		);
		if (publicClientKey) {
			return {
				confidence: publicClientKey.confidence,
				credentialed: false,
				evidence: publicClientKey.evidence,
				label: "Public client key",
				notes:
					"Observed key-like client header; not a user/session credential.",
				type: "public-client-key",
			};
		}
	}

	const evidence = new Set<string>();
	for (const sample of samples) {
		if (headerValue(sample.requestHeaders, "origin")) {
			evidence.add("Origin header");
		}
		if (headerValue(sample.requestHeaders, "referer")) {
			evidence.add("Referer header");
		}
		if (headerValue(sample.requestHeaders, "sec-fetch-site")) {
			evidence.add("Fetch metadata headers");
		}
		if (cookieNames(sample).length > 0) {
			evidence.add("Browser cookies");
		}
	}
	const hasBrowserCookies = samples.some(
		(sample) => cookieNames(sample).length > 0,
	);

	const path = endpoint.template.toLowerCase();
	if (/captcha|challenge|authentication|verification|fraud|bot/.test(path)) {
		evidence.add("Challenge endpoint");
		return {
			confidence: "medium",
			credentialed: false,
			evidence: [...evidence],
			label: "Browser challenge",
			notes: "Likely part of fraud or bot mitigation rather than account auth.",
			type: "browser-context",
		};
	}

	if (sameSiteHost(endpoint.host, profile.host)) {
		evidence.add("Same-site browser request");
		if (hasBrowserCookies) {
			return {
				confidence: "medium",
				credentialed: true,
				evidence: [...evidence],
				label: methodAllowsMutation(endpoint.method)
					? "Browser session write"
					: "Browser session",
				notes:
					"Uses captured browser cookies from this recording. Replay through auth.replay.",
				type: "session-cookie",
			};
		}
		return {
			confidence: evidence.size > 1 ? "medium" : "low",
			credentialed: false,
			evidence: [...evidence],
			label: methodAllowsMutation(endpoint.method)
				? "Browser context write"
				: "Browser context",
			notes:
				"Uses the website's own browser context; no logged-in user credential was observed.",
			type: "browser-context",
		};
	}

	return {
		confidence: "low",
		credentialed: false,
		evidence: [...evidence],
		label: "Public",
		type: "public",
	};
};

const withUniqueOperationNames = <Decision extends EndpointDecision>(
	decisions: Decision[],
): Decision[] => {
	const used = new Set<string>();
	return decisions.map((decision) => ({
		...decision,
		operationName: uniqueOperationName(decision.operationName, used),
	}));
};

export const refineLatestProfile = async (
	store: BridgeStore,
	options: {
		bridgeUrl: string;
		host?: string;
	},
): Promise<RefineResult> => {
	const profile = await store.latestProfile(options.host);
	if (!profile) {
		throw new Error("No Harpist profile exists yet. Record a site first.");
	}
	const recording = await store.latestRecording(profile.host);
	const recordings = await store.listStoredRecordings(profile.host);
	const latestRecording = recording ?? recordings[0] ?? null;
	if (!latestRecording) {
		throw new Error(
			"No recording exists for this profile. Record a site first.",
		);
	}
	const samplesByKey = mergeSampleMaps(recordings);
	const observedSampleEntries = [...samplesByKey.values()].flat();
	const latestSampleEntries = [
		...harSamplesByExactKey(latestRecording).values(),
	].flat();
	const endpoints = refreshEndpointObservations(
		profile.endpoints,
		observedSampleEntries,
		{
			identityOverrides: profile.endpointIdentityOverrides,
			removedTemplateKeys: profile.removedEndpointTemplateKeys,
		},
	);
	const decisions = withUniqueOperationNames(
		endpoints.map((endpoint) => {
			const classified = classifyEndpoint(endpoint, profile);
			const samples = samplesForEndpoint(samplesByKey, endpoint);
			const htmlErrorOnly =
				samples.length > 0 &&
				samples.every((sample) => isHtmlErrorSample(sample));
			const decision = applyExistingEndpointAnnotations(endpoint, classified, {
				htmlErrorOnly,
			});
			return {
				...decision,
				access: decision.included
					? accessFromSamples(endpoint, profile, samples)
					: undefined,
				samples,
			};
		}),
	);
	const included = decisions.filter((decision) => decision.included);
	const refinedEndpoints = decisions.map((decision) => ({
		...decision.endpoint,
		access: decision.access,
		description: decision.description,
		included: decision.included,
		notes: decision.notes,
		operationName: decision.operationName,
		tags: decision.tags,
	}));
	const now = new Date().toISOString();
	const includedSamples = included.flatMap(
		(decision) => decision.samples ?? [],
	);
	const auth =
		includedSamples.length > 0
			? deriveAuthSummary(includedSamples)
			: profile.auth;
	const authBundle =
		latestSampleEntries.length > 0
			? deriveAuthBundle(latestSampleEntries, {
					capturedAt: now,
					recordingId: latestRecording.id,
				})
			: profile.authBundle;
	const latestAuth =
		latestSampleEntries.length > 0
			? deriveLatestAuth(latestSampleEntries, {
					capturedAt: now,
					recordingId: latestRecording.id,
				})
			: profile.latestAuth;
	const artifactProfile: SiteProfile = {
		...profile,
		auth,
		authBundle,
		derivedEndpointCount: included.length,
		endpoints: refinedEndpoints,
		endpointTemplateKeys: included.map(
			(decision) => decision.endpoint.templateKey,
		),
		latestAuth,
	};
	const generatedArtifacts = await buildRecordedSiteArtifacts(artifactProfile, {
		auth: authBundle?.label ?? auth.label,
		cli: buildCliNotes(artifactProfile, decisions),
		paths: store.getSiteArtifactPaths(profile.host),
		source: "harpist refine",
		status: included.every((decision) =>
			hasCuratedEndpointDocumentation({
				...decision.endpoint,
				description: decision.description,
				notes: decision.notes,
			}),
		)
			? "ready"
			: "draft",
		updatedAt: now,
	});
	await store.writeSiteArtifacts(profile.host, generatedArtifacts.files);
	const artifacts: ProfileArtifacts = generatedArtifacts.profileArtifacts;
	const refinedProfile = await store.saveProfile({
		...profile,
		agentNotes: `Initial Harpist refinement kept ${included.length} API candidates and excluded ${
			decisions.length - included.length
		} noisy endpoints. Review before using mutating actions.`,
		artifacts,
		auth,
		authBundle,
		derivedEndpointCount: included.length,
		endpoints: refinedEndpoints,
		endpointTemplateKeys: included.map(
			(decision) => decision.endpoint.templateKey,
		),
		lastBridgeMessage:
			"Draft API profile created; agent documentation pass required",
		latestAuth,
		remoteDocsUrl: `${options.bridgeUrl}/profiles/${encodeURIComponent(
			profile.host,
		)}/docs`,
		remoteProjectId: profile.host,
		status: "synced",
		updatedAt: now,
	});

	if (recording) {
		await store.markRecordingProcessed(profile.host, recording.id, "complete");
	}
	const openapiPaths = generatedArtifacts.files.openapi as {
		paths?: Record<string, unknown>;
	};

	return {
		excludedEndpointCount: decisions.length - included.length,
		host: profile.host,
		includedEndpointCount: included.length,
		openapiPathCount: Object.keys(openapiPaths.paths ?? {}).length,
		profile: refinedProfile,
		recordingId: recording?.id ?? latestRecording.id,
	};
};
