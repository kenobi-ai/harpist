import type { CredentialKind } from "./credentials";
import type { ContractJsonSchema, JsonValue } from "./json-schema-zod";
import type { AccessType, EndpointSummary, SiteProfile } from "./profiles";
import {
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_SCHEMA_ID,
	CONTRACT_PROFILE_VERSION,
	type ContractProfile,
	contractProfileSchema,
} from "./site-contract-profile-schema";

const unknownSchema = {} satisfies ContractJsonSchema;
const stringSchema = { type: "string" } satisfies ContractJsonSchema;
const stringArraySchema = {
	items: stringSchema,
	type: "array",
} satisfies ContractJsonSchema;
const technicalTags = new Set([
	"api",
	"preflight",
	"same-site",
	"static",
	"third-party",
	"write",
	"writes",
]);
const genericHostLabels = new Set([
	"app",
	"co",
	"com",
	"dev",
	"io",
	"net",
	"org",
	"www",
]);

export type {
	ContractProfile,
	ContractProfileOperation,
} from "./site-contract-profile-schema";
export {
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_JSON_SCHEMA,
	CONTRACT_PROFILE_SCHEMA_ID,
	CONTRACT_PROFILE_VERSION,
	contractProfileSchema,
} from "./site-contract-profile-schema";

const jsonObject = (value: unknown) =>
	JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;

export const methodAllowsBody = (method: string) =>
	["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());

const versionSegmentPattern = /^v\d+(?:\.\d+)?$/i;
const genericPathParameterPattern = /^(?:id|uuid|slug)(?:\d+)?$/i;

const singularizePathWord = (word: string) => {
	if (word.endsWith("ies") && word.length > 3) {
		return `${word.slice(0, -3)}y`;
	}
	if (word.endsWith("sses")) {
		return word.slice(0, -2);
	}
	if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes")) {
		return word.slice(0, -2);
	}
	if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) {
		return word.slice(0, -1);
	}
	return word;
};

const pathSegmentWords = (segment: string) =>
	segment
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.split(/[^a-zA-Z0-9]+/)
		.flatMap((part) => {
			const word = part.trim().toLowerCase();
			if (!word) {
				return [];
			}
			for (const suffix of ["plans", "status", "run"]) {
				if (word.length > suffix.length && word.endsWith(suffix)) {
					return [word.slice(0, -suffix.length), suffix];
				}
			}
			return [word];
		});

const camelIdentifier = (words: string[]) => {
	const [first, ...rest] = words;
	if (!first) {
		return;
	}
	return [
		first,
		...rest.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`),
	].join("");
};

const semanticPathParameterName = (
	segments: string[],
	index: number,
	rawName: string,
) => {
	if (!genericPathParameterPattern.test(rawName)) {
		return rawName;
	}
	const fallback = rawName.replace(/\d+$/, "") || "id";
	const previous = segments[index - 1];
	if (
		!previous ||
		previous.startsWith("{") ||
		versionSegmentPattern.test(previous)
	) {
		return fallback;
	}
	const words = pathSegmentWords(previous);
	if (words.length === 0) {
		return fallback;
	}
	const last = words.at(-1);
	const noun = last ? singularizePathWord(last) : undefined;
	const base = camelIdentifier([...words.slice(0, -1), noun].filter(Boolean));
	return base ? `${base}Id` : fallback;
};

const uniquePathParameterTemplate = (template: string) => {
	const used = new Set<string>();
	const counts = new Map<string, number>();
	const segments = template.split("/");
	return segments
		.map((segment, index) => {
			const match = /^\{([^}]+)\}$/.exec(segment);
			if (!match) {
				return segment;
			}
			const rawName = match[1] ?? "id";
			const inferredName = semanticPathParameterName(segments, index, rawName);
			const count = (counts.get(inferredName) ?? 0) + 1;
			counts.set(inferredName, count);
			let name = count === 1 ? inferredName : `${inferredName}${count}`;
			while (used.has(name)) {
				name = `${inferredName}${used.size + 1}`;
			}
			used.add(name);
			return `{${name}}`;
		})
		.join("/");
};

export const routePathForEndpoint = (endpoint: EndpointSummary) =>
	uniquePathParameterTemplate(
		endpoint.template.startsWith("/")
			? endpoint.template
			: `/${endpoint.template}`,
	);

export const pathParameterNames = (template: string) =>
	[...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");

const fallbackOperationName = (endpoint: EndpointSummary) => {
	const raw =
		`${endpoint.method.toLowerCase()} ${endpoint.host} ${endpoint.template}`
			.replace(/\{([^}]+)\}/g, "by $1")
			.replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase())
			.replace(/^[A-Z]/, (letter) => letter.toLowerCase());
	const safe = raw.replace(/[^a-zA-Z0-9_$]/g, "");
	if (!safe) {
		return `${endpoint.method.toLowerCase()}Endpoint`;
	}
	return /^[a-zA-Z_$]/.test(safe) ? safe : `endpoint${safe}`;
};

const operationNameForEndpoint = (
	endpoint: EndpointSummary,
	used: Set<string>,
) => {
	const base = endpoint.operationName ?? fallbackOperationName(endpoint);
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	let index = 2;
	let next = `${base}${index}`;
	while (used.has(next)) {
		index += 1;
		next = `${base}${index}`;
	}
	used.add(next);
	return next;
};

const tagKey = (tag: string) => tag.trim().toLowerCase();

const visibleProfileTagKeys = (profile: SiteProfile) => {
	const keys = new Set(
		[profile.displayName, profile.host]
			.map(tagKey)
			.filter((tag) => tag.length > 0),
	);
	for (const label of profile.host.split(".")) {
		const key = tagKey(label);
		if (key && !genericHostLabels.has(key)) {
			keys.add(key);
		}
	}
	return keys;
};

export const visibleTagsForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
) => {
	const tags = [
		...new Set((endpoint.tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
	];
	const semanticTags = tags.filter((tag) => !technicalTags.has(tagKey(tag)));
	const profileTags = visibleProfileTagKeys(profile);
	const localTags = semanticTags.filter((tag) => !profileTags.has(tagKey(tag)));
	return [localTags[0] ?? semanticTags[0] ?? "API"];
};

const replayCommand = (profile: SiteProfile, operationName: string) =>
	`harpist auth replay ${profile.host} ${operationName}`;

const accessTypeCredentialKinds: Partial<Record<AccessType, CredentialKind[]>> =
	{
		"api-key": ["api-key"],
		"basic-auth": ["authorization"],
		"bearer-token": ["authorization"],
		"browser-context": ["browser-session"],
		"public-client-key": ["public-client-key"],
		"session-cookie": ["browser-session"],
		"signed-request": ["authorization"],
	};

const runtimeAuthKindsForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
): CredentialKind[] => {
	const fromAccess = endpoint.access?.type
		? accessTypeCredentialKinds[endpoint.access.type]
		: undefined;
	if (fromAccess) {
		return fromAccess;
	}
	return (profile.authBundle?.methods ?? [])
		.filter((method) => method.credentialed)
		.map((method) => method.type);
};

const descriptionForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
	operationName: string,
) => {
	const base =
		endpoint.notes ??
		endpoint.description ??
		`Observed ${endpoint.method.toUpperCase()} request for ${endpoint.template}.`;
	return base.includes("harpist auth replay")
		? base
		: `${base}\n\nReplay with \`${replayCommand(profile, operationName)}\`.`;
};

const inputSchemaForEndpoint = (
	endpoint: EndpointSummary,
): ContractJsonSchema => {
	const path = routePathForEndpoint(endpoint);
	const params = Object.fromEntries(
		pathParameterNames(path).map((name) => [name, stringSchema]),
	);
	const query = Object.fromEntries(
		(endpoint.queryParams ?? []).map((param) => [
			param.name,
			param.repeated ? stringArraySchema : stringSchema,
		]),
	);
	const properties: Record<string, JsonValue> = {};
	const required: string[] = [];
	if (Object.keys(params).length > 0) {
		properties.params = {
			additionalProperties: false,
			properties: params,
			required: Object.keys(params),
			type: "object",
		};
		required.push("params");
	}
	if (Object.keys(query).length > 0) {
		properties.query = {
			additionalProperties: false,
			properties: query,
			type: "object",
		};
	}
	if (methodAllowsBody(endpoint.method)) {
		properties.body = endpoint.requestBody?.schema ?? unknownSchema;
	}
	return {
		additionalProperties: false,
		properties,
		required,
		type: "object",
	};
};

const responseProfiles = (endpoint: EndpointSummary) =>
	(endpoint.statuses.length > 0 ? endpoint.statuses : [200]).map((status) => {
		const responseBody = endpoint.responseBodies?.find(
			(response) => response.status === status,
		);
		return {
			contentType: responseBody?.contentType ?? "application/json",
			description: status >= 400 ? "Error response" : "Observed response",
			schema: responseBody?.schema ?? unknownSchema,
			status,
		};
	});

const outputSchemaForEndpoint = (endpoint: EndpointSummary) =>
	endpoint.responseBodies?.find(
		(response) => response.status >= 200 && response.status < 300,
	)?.schema ??
	endpoint.responseBodies?.[0]?.schema ??
	unknownSchema;

const queryParametersForEndpoint = (endpoint: EndpointSummary) =>
	Object.fromEntries(
		(endpoint.queryParams ?? []).map((param) => [
			param.name,
			{
				description:
					param.values.length > 0
						? `Observed query parameter. Example: ${JSON.stringify(
								param.values[0],
							)}.`
						: "Observed query parameter.",
				required: false,
				schema: param.repeated ? stringArraySchema : stringSchema,
			},
		]),
	);

export const createRecordedSiteContractProfile = (
	profile: SiteProfile,
	options: { source?: string; updatedAt?: string } = {},
) => {
	const used = new Set<string>();
	const generatedAt = options.updatedAt ?? new Date().toISOString();
	return resolveContractProfile({
		$schema: CONTRACT_PROFILE_SCHEMA_ID,
		auth: jsonObject({
			bundle: profile.authBundle,
			runtime: {
				bindsCredentialValues: false,
				credentials: "auth.credentials",
				credentialsCommand: `harpist auth list ${profile.host}`,
				loginCommand: `harpist auth login ${profile.host}`,
				replay: "auth.replay",
				source: "profile.latestAuth",
			},
			summary: profile.auth,
		}),
		format: CONTRACT_PROFILE_FORMAT,
		operations: profile.endpoints
			.filter((endpoint) => endpoint.included !== false)
			.map((endpoint) => {
				const operationId = operationNameForEndpoint(endpoint, used);
				const path = routePathForEndpoint(endpoint);
				const responses = responseProfiles(endpoint);
				return {
					description: descriptionForEndpoint(profile, endpoint, operationId),
					extensions: {
						"x-harpist": jsonObject({
							access: endpoint.access,
							documentationSource: options.source,
							documentationUpdatedAt: options.updatedAt,
							endpointKey: endpoint.templateKey,
							replayCommand: replayCommand(profile, operationId),
							runtimeAuth: {
								bindsCredentialValues: false,
								kinds: runtimeAuthKindsForEndpoint(profile, endpoint),
								mode: "latest-auth-option",
								source: "profile.latestAuth",
							},
							sourceTags: endpoint.tags ?? [],
						}),
					},
					inputSchema: inputSchemaForEndpoint(endpoint),
					method: endpoint.method.toUpperCase(),
					operationId,
					outputSchema: outputSchemaForEndpoint(endpoint),
					parameters: {
						path: Object.fromEntries(
							pathParameterNames(path).map((name) => [
								name,
								{ required: true, schema: stringSchema },
							]),
						),
						query: queryParametersForEndpoint(endpoint),
					},
					path,
					provenance: {
						documentationSource: options.source,
						documentationUpdatedAt: options.updatedAt,
						endpointKey: endpoint.templateKey,
						exactKey: endpoint.exactKey,
						host: endpoint.host,
						lastSeenAt: endpoint.lastSeenAt,
						path: endpoint.path,
						queryParams: endpoint.queryParams ?? [],
						samples: endpoint.samples,
						sourceTags: endpoint.tags ?? [],
						statuses: endpoint.statuses,
						template: endpoint.template,
					},
					replay: {
						command: replayCommand(profile, operationId),
						selector: operationId,
					},
					request: methodAllowsBody(endpoint.method)
						? {
								body: {
									contentType:
										endpoint.requestBody?.contentType ?? "application/json",
									required: false,
									schema: endpoint.requestBody?.schema ?? unknownSchema,
								},
							}
						: undefined,
					responses,
					summary: endpoint.description ?? operationId,
					tags: visibleTagsForEndpoint(profile, endpoint),
				};
			}),
		service: {
			displayName: profile.displayName,
			host: profile.host,
			origin: profile.origin,
			servers: [{ url: profile.origin }],
		},
		source: {
			generatedAt,
			source: options.source,
		},
		version: CONTRACT_PROFILE_VERSION,
	});
};

const defaultResponse = {
	contentType: "application/json",
	description: "Observed response",
	schema: unknownSchema,
	status: 200,
};

export const resolveContractProfile = (input: unknown): ContractProfile => {
	const result = contractProfileSchema.safeParse(input);
	if (!result.success) {
		throw new Error(`Invalid contract profile: ${result.error.message}`);
	}
	const issues: string[] = [];
	const usedOperations = new Set<string>();
	const usedRoutes = new Set<string>();
	const service = {
		...result.data.service,
		servers: result.data.service.servers ?? [
			{ url: result.data.service.origin },
		],
	};
	const operations = result.data.operations.map((operation, index) => {
		if (!operation.path.startsWith("/")) {
			issues.push(`operations[${index}].path must start with '/'.`);
		}
		if (usedOperations.has(operation.operationId)) {
			issues.push(`Duplicate operationId '${operation.operationId}'.`);
		}
		usedOperations.add(operation.operationId);
		const routeKey = `${operation.method} ${operation.path}`;
		if (usedRoutes.has(routeKey)) {
			issues.push(`Duplicate route '${routeKey}'.`);
		}
		usedRoutes.add(routeKey);
		const pathNames = pathParameterNames(operation.path);
		const pathNameSet = new Set(pathNames);
		if (pathNames.length !== pathNameSet.size) {
			issues.push(`Route '${routeKey}' repeats a path parameter name.`);
		}
		const pathParameters = { ...(operation.parameters.path ?? {}) };
		for (const name of pathNames) {
			const existing = pathParameters[name];
			pathParameters[name] = {
				...existing,
				required: true,
				schema: existing?.schema ?? stringSchema,
			};
		}
		for (const name of Object.keys(pathParameters)) {
			if (!pathNameSet.has(name)) {
				issues.push(
					`Route '${routeKey}' declares unused path parameter '${name}'.`,
				);
			}
		}
		const responses =
			operation.responses.length > 0 ? operation.responses : [defaultResponse];
		return {
			...operation,
			outputSchema:
				operation.outputSchema ?? responses[0]?.schema ?? unknownSchema,
			parameters: {
				...operation.parameters,
				path: pathParameters,
			},
			responses,
		};
	});
	if (issues.length > 0) {
		throw new Error(`Invalid contract profile:\n- ${issues.join("\n- ")}`);
	}
	return {
		...result.data,
		operations,
		service,
	};
};
