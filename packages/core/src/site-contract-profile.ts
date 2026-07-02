import type { EndpointSummary, SiteProfile } from "./profiles";
import type { ContractJsonSchema, JsonValue } from "./json-schema-zod";
import {
	type ContractProfile,
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_SCHEMA_ID,
	CONTRACT_PROFILE_VERSION,
	contractProfileSchema,
} from "./site-contract-profile-schema";

const unknownSchema = {} satisfies ContractJsonSchema;
const stringSchema = { type: "string" } satisfies ContractJsonSchema;
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

export {
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_JSON_SCHEMA,
	CONTRACT_PROFILE_SCHEMA_ID,
	CONTRACT_PROFILE_VERSION,
	contractProfileSchema,
} from "./site-contract-profile-schema";
export type { ContractProfile, ContractProfileOperation } from "./site-contract-profile-schema";

const jsonObject = (value: unknown) =>
	JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;

export const methodAllowsBody = (method: string) =>
	["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());

const uniquePathParameterTemplate = (template: string) => {
	const used = new Set<string>();
	const counts = new Map<string, number>();
	return template.replace(/\{([^}]+)\}/g, (_, rawName: string) => {
		const count = (counts.get(rawName) ?? 0) + 1;
		counts.set(rawName, count);
		let name = count === 1 ? rawName : `${rawName}${count}`;
		while (used.has(name)) {
			name = `${rawName}${used.size + 1}`;
		}
		used.add(name);
		return `{${name}}`;
	});
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
	if (methodAllowsBody(endpoint.method)) {
		properties.body = unknownSchema;
	}
	return {
		additionalProperties: false,
		properties,
		required,
		type: "object",
	};
};

const responseProfiles = (endpoint: EndpointSummary) =>
	(endpoint.statuses.length > 0 ? endpoint.statuses : [200]).map((status) => ({
		description: status >= 400 ? "Error response" : "Observed response",
		schema: unknownSchema,
		status,
	}));

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
								mode: "latest-auth-option",
								source: "profile.latestAuth",
							},
							sourceTags: endpoint.tags ?? [],
						}),
					},
					inputSchema: inputSchemaForEndpoint(endpoint),
					method: endpoint.method.toUpperCase(),
					operationId,
					outputSchema: unknownSchema,
					parameters: {
						path: Object.fromEntries(
							pathParameterNames(path).map((name) => [
								name,
								{ required: true, schema: stringSchema },
							]),
						),
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
						? { body: { required: false, schema: unknownSchema } }
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

const defaultResponse = { contentType: "application/json", description: "Observed response", schema: unknownSchema, status: 200 };

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
		servers: result.data.service.servers ?? [{ url: result.data.service.origin }],
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
				issues.push(`Route '${routeKey}' declares unused path parameter '${name}'.`);
			}
		}
		const responses =
			operation.responses.length > 0 ? operation.responses : [defaultResponse];
		return {
			...operation,
			outputSchema: operation.outputSchema ?? responses[0]?.schema ?? unknownSchema,
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
