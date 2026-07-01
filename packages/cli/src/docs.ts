import type { ProfileArtifacts, SiteProfile } from "@harpist/core/profiles";
import { buildRecordedSiteArtifacts } from "./artifacts";
import { buildReplayBundle } from "./replay";
import type { BridgeStore } from "./store";

type OpenApiOperation = Record<string, unknown> & {
	description?: string;
	operationId?: string;
	summary?: string;
	tags?: string[];
};

type EndpointDocInput = {
	description: string;
	included?: boolean;
	method?: string;
	notes?: string;
	operationName?: string;
	path?: string;
	summary: string;
	tags?: string[];
	templateKey?: string;
};

type DocsApplyInput = {
	agentNotes?: string;
	endpoints: EndpointDocInput[];
	host?: string;
	lastBridgeMessage?: string;
	source?: string;
	status?: ProfileArtifacts["status"];
};

type OperationRef = {
	method: string;
	operation: OpenApiOperation;
	path: string;
};

const httpMethods = [
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"trace",
] as const;

const placeholderPatterns = [
	/API-shaped host or path/i,
	/included because/i,
	/observed during the recorded browser workflow/i,
	/^Gets? .+ observed during/i,
	/^Submits? .+ observed during/i,
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown, field: string) => {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error(
			`Endpoint documentation field '${field}' must be a string.`,
		);
	}
	const trimmed = value.trim();
	return trimmed || undefined;
};

const requiredString = (value: unknown, field: string) => {
	const trimmed = optionalString(value, field);
	if (!trimmed) {
		throw new Error(`Endpoint documentation field '${field}' is required.`);
	}
	return trimmed;
};

const optionalBoolean = (value: unknown, field: string) => {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "boolean") {
		throw new Error(
			`Endpoint documentation field '${field}' must be a boolean.`,
		);
	}
	return value;
};

const optionalStringArray = (value: unknown, field: string) => {
	if (value === undefined) {
		return undefined;
	}
	if (
		!Array.isArray(value) ||
		value.some((item) => typeof item !== "string" || item.trim() === "")
	) {
		throw new Error(
			`Endpoint documentation field '${field}' must be an array of strings.`,
		);
	}
	return [...new Set(value.map((item) => item.trim()))];
};

const parseDocsApplyInput = (value: unknown): DocsApplyInput => {
	if (!isRecord(value)) {
		throw new Error("Docs input must be a JSON object.");
	}
	const rawEndpoints = value.endpoints ?? value.operations;
	if (!Array.isArray(rawEndpoints) || rawEndpoints.length === 0) {
		throw new Error("Docs input must include a non-empty endpoints array.");
	}
	const endpoints = rawEndpoints.map((raw, index): EndpointDocInput => {
		if (!isRecord(raw)) {
			throw new Error(
				`Endpoint documentation at index ${index} must be an object.`,
			);
		}
		const templateKey = optionalString(raw.templateKey, "templateKey");
		const operationName = optionalString(raw.operationName, "operationName");
		const method = optionalString(raw.method, "method")?.toUpperCase();
		const path = optionalString(raw.path, "path");
		if (!templateKey && !operationName && !(method && path)) {
			throw new Error(
				`Endpoint documentation at index ${index} needs templateKey, operationName, or method + path.`,
			);
		}
		return {
			description: requiredString(raw.description, "description"),
			included: optionalBoolean(raw.included, "included"),
			method,
			notes: optionalString(raw.notes, "notes"),
			operationName,
			path,
			summary: requiredString(raw.summary, "summary"),
			tags: optionalStringArray(raw.tags, "tags"),
			templateKey,
		};
	});
	return {
		agentNotes: optionalString(value.agentNotes, "agentNotes"),
		endpoints,
		host: optionalString(value.host, "host"),
		lastBridgeMessage: optionalString(
			value.lastBridgeMessage,
			"lastBridgeMessage",
		),
		source: optionalString(value.source, "source"),
		status:
			value.status === "missing" ||
			value.status === "draft" ||
			value.status === "ready"
				? value.status
				: undefined,
	};
};

const matchEndpoint = (profile: SiteProfile, doc: EndpointDocInput) => {
	const matches = profile.endpoints.filter((endpoint) => {
		if (doc.templateKey && endpoint.templateKey === doc.templateKey) {
			return true;
		}
		if (doc.operationName && endpoint.operationName === doc.operationName) {
			return true;
		}
		return (
			doc.method === endpoint.method &&
			(doc.path === endpoint.path || doc.path === endpoint.template)
		);
	});
	if (matches.length === 0) {
		throw new Error(
			`No endpoint matched documentation selector '${
				doc.templateKey ?? doc.operationName ?? `${doc.method} ${doc.path}`
			}'.`,
		);
	}
	if (matches.length > 1) {
		throw new Error(
			`Documentation selector '${
				doc.templateKey ?? doc.operationName ?? `${doc.method} ${doc.path}`
			}' matched ${matches.length} endpoints. Use templateKey.`,
		);
	}
	return matches[0];
};

const buildCliArtifact = (profile: SiteProfile) =>
	[
		`# ${profile.host}`,
		"",
		"Refined API candidates:",
		...profile.endpoints
			.filter((endpoint) => endpoint.included !== false)
			.map((endpoint) => {
				const selector = endpoint.operationName ?? endpoint.templateKey;
				return `- ${selector}: ${endpoint.method} https://${endpoint.host}${endpoint.template}`;
			}),
		"",
		"Use `harpist docs review <host>` to check documentation quality.",
		"Use `harpist auth replay <host> <operationName-or-templateKey>` to get a runnable curl command with captured credentials.",
	].join("\n");

export const applyProfileDocs = async (
	store: BridgeStore,
	options: {
		bridgeUrl: string;
		host: string;
		input: unknown;
	},
) => {
	const input = parseDocsApplyInput(options.input);
	if (input.host && input.host !== options.host) {
		throw new Error(
			`Docs input is for '${input.host}', but CLI target was '${options.host}'.`,
		);
	}
	const profile = await store.requireProfile(options.host);
	const now = new Date().toISOString();
	const source = input.source ?? "harpist docs apply";
	const nextEndpoints = [...profile.endpoints];
	const applied: string[] = [];

	for (const doc of input.endpoints) {
		const endpoint = matchEndpoint(profile, doc);
		const index = nextEndpoints.findIndex(
			(item) => item.templateKey === endpoint.templateKey,
		);
		const operationName =
			doc.operationName ??
			endpoint.operationName ??
			endpoint.templateKey.replace(/[^a-zA-Z0-9_$]/g, "_");
		const included = doc.included ?? endpoint.included ?? true;
		const tags = doc.tags ?? endpoint.tags;
		nextEndpoints[index] = {
			...endpoint,
			description: doc.summary,
			included,
			notes: doc.notes ?? doc.description,
			operationName,
			tags,
		};
		applied.push(endpoint.templateKey);
	}

	const includedEndpoints = nextEndpoints.filter(
		(endpoint) => endpoint.included !== false,
	);
	const artifactProfile: SiteProfile = {
		...profile,
		derivedEndpointCount: includedEndpoints.length,
		endpointTemplateKeys: includedEndpoints.map(
			(endpoint) => endpoint.templateKey,
		),
		endpoints: nextEndpoints,
	};
	const generatedArtifacts = await buildRecordedSiteArtifacts(artifactProfile, {
		auth:
			profile.artifacts?.auth ??
			profile.authBundle?.label ??
			profile.auth.label,
		cli: buildCliArtifact(artifactProfile),
		paths: store.getSiteArtifactPaths(profile.host),
		source,
		status: input.status ?? "ready",
		updatedAt: now,
	});
	await store.writeSiteArtifacts(profile.host, generatedArtifacts.files);
	const nextProfile: SiteProfile = {
		...artifactProfile,
		agentNotes:
			input.agentNotes ??
			`${profile.host} docs refined by ${source}; endpoint descriptions are profile metadata.`,
		artifacts: generatedArtifacts.profileArtifacts,
		lastBridgeMessage: input.lastBridgeMessage ?? `Docs refined by ${source}`,
		remoteDocsUrl: `${options.bridgeUrl}/profiles/${encodeURIComponent(
			profile.host,
		)}/docs`,
		remoteProjectId: profile.host,
		status: "synced",
		updatedAt: now,
	};

	await store.saveProfile(nextProfile);
	return {
		appliedEndpointCount: applied.length,
		docs: nextProfile.remoteDocsUrl,
		host: nextProfile.host,
		source,
		updatedAt: now,
	};
};

const operationsFromOpenApi = (openapi: unknown): OperationRef[] => {
	if (!isRecord(openapi) || !isRecord(openapi.paths)) {
		return [];
	}
	const operations: OperationRef[] = [];
	for (const [path, pathItem] of Object.entries(openapi.paths)) {
		if (!isRecord(pathItem)) {
			continue;
		}
		for (const method of httpMethods) {
			const operation = pathItem[method];
			if (isRecord(operation)) {
				operations.push({
					method,
					operation: operation as OpenApiOperation,
					path,
				});
			}
		}
	}
	return operations;
};

const normaliseText = (value: unknown) =>
	typeof value === "string"
		? value.replace(/\s+/g, " ").trim().toLowerCase()
		: "";

const duplicatedTexts = (values: string[]) => {
	const counts = new Map<string, number>();
	for (const value of values.filter(Boolean)) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([value, count]) => ({
			count,
			value,
		}));
};

const operationTags = (operation: OpenApiOperation) =>
	Array.isArray(operation.tags)
		? operation.tags.filter(
				(tag): tag is string => typeof tag === "string" && tag.trim() !== "",
			)
		: [];

export const reviewProfileDocs = async (
	store: BridgeStore,
	options: {
		host: string;
	},
) => {
	const profile = await store.requireProfile(options.host);
	const openapi = await store.readProfileOpenApi(profile.host);
	const contractSource = await store.readProfileContract(profile.host);
	const operations = operationsFromOpenApi(openapi);
	const includedEndpoints = profile.endpoints.filter(
		(endpoint) => endpoint.included !== false,
	);
	const issues: string[] = [];
	const warnings: string[] = [];

	if (!openapi) {
		issues.push("No OpenAPI artifact has been written.");
	}
	if (profile.artifacts?.status !== "ready") {
		issues.push(
			`Documentation artifact status is '${profile.artifacts?.status ?? "missing"}', not 'ready'.`,
		);
	}
	if (
		!contractSource ||
		!profile.artifacts?.contractPath ||
		profile.artifacts.contractFormat !== "orpc-typescript-source" ||
		profile.artifacts.generatedFrom !== "profile" ||
		!contractSource.includes('from "@orpc/contract"') ||
		!contractSource.includes(".route(")
	) {
		issues.push("Contract artifact is not oRPC contract source.");
	}
	const rootHarpist = isRecord(openapi) ? openapi["x-harpist"] : undefined;
	if (
		profile.artifacts?.openapiSource !== "contract-file" ||
		!profile.artifacts.openapiPath ||
		!isRecord(rootHarpist) ||
		rootHarpist.sourceArtifact !== "contract.ts"
	) {
		issues.push("OpenAPI artifact was not generated from contract.ts.");
	}
	if (operations.length === 0) {
		issues.push("OpenAPI artifact has no operations.");
	}
	if (operations.length !== includedEndpoints.length) {
		warnings.push(
			`OpenAPI has ${operations.length} operations for ${includedEndpoints.length} included endpoints.`,
		);
	}
	const invalidVisibleTags = operations.filter(
		(item) => operationTags(item.operation).length !== 1,
	);
	if (invalidVisibleTags.length > 0) {
		issues.push(
			`${invalidVisibleTags.length} operation(s) use zero or multiple visible tags; Scalar duplicates operations across tag sections unless each operation has exactly one tag.`,
		);
	}

	const summaries = operations.map((item) =>
		normaliseText(item.operation.summary),
	);
	const descriptions = operations.map((item) =>
		normaliseText(item.operation.description),
	);
	const repeatedSummaries = duplicatedTexts(summaries);
	const repeatedDescriptions = duplicatedTexts(descriptions);
	if (repeatedSummaries.length > 0) {
		issues.push(
			`${repeatedSummaries.length} repeated summary value(s) found in docs.`,
		);
	}
	if (repeatedDescriptions.length > 0) {
		issues.push(
			`${repeatedDescriptions.length} repeated description value(s) found in docs.`,
		);
	}
	const placeholderOperations = operations.filter((item) =>
		placeholderPatterns.some(
			(pattern) =>
				pattern.test(String(item.operation.description ?? "")) ||
				pattern.test(String(item.operation.summary ?? "")),
		),
	);
	if (placeholderOperations.length > 0) {
		issues.push(
			`${placeholderOperations.length} operation(s) still contain neutral placeholder documentation.`,
		);
	}
	const uncreditedOperations = operations.filter((item) => {
		const harpist = item.operation["x-harpist"];
		return (
			!isRecord(harpist) ||
			typeof harpist.documentationSource !== "string" ||
			harpist.documentationSource.trim() === ""
		);
	});
	if (uncreditedOperations.length > 0) {
		warnings.push(
			`${uncreditedOperations.length} operation(s) do not record a documentation source.`,
		);
	}

	const recordings = await store.listStoredRecordings(profile.host);
	let replayReadyCount = 0;
	const replayFailures: string[] = [];
	for (const operationRef of operations) {
		const harpist = operationRef.operation["x-harpist"];
		const templateKey =
			isRecord(harpist) && typeof harpist.endpointKey === "string"
				? harpist.endpointKey
				: undefined;
		if (!templateKey) {
			replayFailures.push(
				`${operationRef.method.toUpperCase()} ${operationRef.path}`,
			);
			continue;
		}
		try {
			buildReplayBundle({
				profile,
				recordings,
				templateKey,
			});
			replayReadyCount += 1;
		} catch (error) {
			replayFailures.push(
				`${operationRef.method.toUpperCase()} ${operationRef.path}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
	if (replayFailures.length > 0) {
		issues.push(`${replayFailures.length} operation(s) lack replay material.`);
	}

	return {
		artifactStatus: profile.artifacts?.status ?? "missing",
		docs: profile.remoteDocsUrl,
		host: profile.host,
		includedEndpointCount: includedEndpoints.length,
		issues,
		ok: issues.length === 0,
		openapiOperationCount: operations.length,
		replayFailures,
		replayReadyCount,
		sample: operations.slice(0, 5).map((item) => ({
			description: item.operation.description,
			method: item.method.toUpperCase(),
			path: item.path,
			source: isRecord(item.operation["x-harpist"])
				? item.operation["x-harpist"].documentationSource
				: undefined,
			summary: item.operation.summary,
		})),
		uniqueDescriptionCount: new Set(descriptions.filter(Boolean)).size,
		uniqueSummaryCount: new Set(summaries.filter(Boolean)).size,
		warnings,
	};
};
