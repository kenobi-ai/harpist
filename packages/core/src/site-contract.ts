import type { AnyContractProcedure, Route } from "@orpc/contract";
import { oc } from "@orpc/contract";
import { z } from "zod";
import type { EndpointSummary, SiteProfile } from "./profiles";

type RecordedSiteContract = Record<string, AnyContractProcedure>;

type RecordedSiteContractOptions = {
	source?: string;
	updatedAt?: string;
};

type RecordedRoutePath = Extract<Route["path"], string>;

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
	"app", "co", "com", "dev", "io", "net", "org", "www",
]);

const methodAllowsBody = (method: string) =>
	["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());

const uniquePathParameterTemplate = (template: string) => {
	const used = new Set<string>();
	const counts = new Map<string, number>();
	return template.replace(/\{([^}]+)\}/g, (_, rawName: string) => {
		const count = (counts.get(rawName) ?? 0) + 1;
		counts.set(rawName, count);

		let name = count === 1 ? rawName : `${rawName}${count}`;
		let suffix = count;
		while (used.has(name)) {
			suffix += 1;
			name = `${rawName}${suffix}`;
		}
		used.add(name);
		return `{${name}}`;
	});
};

const pathParameterNames = (template: string) =>
	[...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

const responseObject = (endpoint: EndpointSummary) =>
	Object.fromEntries(
		(endpoint.statuses.length > 0 ? endpoint.statuses : [200]).map((status) => [
			String(status),
			{
				description: status >= 400 ? "Error response" : "Observed response",
			},
		]),
	);

const requestBodyObject = () => ({
	content: {
		"application/json": {
			schema: {},
		},
	},
	required: false,
});

const routePath = (endpoint: EndpointSummary) =>
	uniquePathParameterTemplate(
		endpoint.template.startsWith("/")
			? endpoint.template
			: `/${endpoint.template}`,
	) as RecordedRoutePath;

const routeMethod = (endpoint: EndpointSummary) =>
	endpoint.method.toUpperCase() as Route["method"];

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

export const recordedSiteContractExportName = (host: string) => {
	const safe = host.replace(/[^a-zA-Z0-9_$]/g, "_");
	const name = safe || "recordedSite";
	return `${/^[a-zA-Z_$]/.test(name) ? name : `_${name}`}Contract`;
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
	if (base.includes("harpist auth replay")) {
		return base;
	}
	return `${base}\n\nReplay with \`${replayCommand(profile, operationName)}\`.`;
};

const inputSchemaForEndpoint = (endpoint: EndpointSummary) => {
	const shape: Record<string, z.ZodType> = {};
	const params = Object.fromEntries(
		pathParameterNames(routePath(endpoint)).map((name) => [name, z.string()]),
	);

	if (Object.keys(params).length > 0) {
		shape.params = z.object(params);
	}

	if (methodAllowsBody(endpoint.method)) {
		shape.body = z.unknown().optional();
	}

	return z.object(shape);
};

const xHarpistForEndpoint = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
	operationName: string,
	options: RecordedSiteContractOptions,
) => ({
	access: endpoint.access,
	documentationSource: options.source,
	documentationUpdatedAt: options.updatedAt,
	endpointKey: endpoint.templateKey,
	replayCommand: replayCommand(profile, operationName),
	runtimeAuth: {
		bindsCredentialValues: false,
		mode: "latest-auth-option",
		source: "profile.latestAuth",
	},
	sourceTags: endpoint.tags ?? [],
});

const createRecordedSiteProcedure = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
	operationName: string,
	options: RecordedSiteContractOptions,
) =>
	oc
		.route({
			description: descriptionForEndpoint(profile, endpoint, operationName),
			inputStructure: "detailed",
			method: routeMethod(endpoint),
			operationId: operationName,
			path: routePath(endpoint),
			spec: (operation) => ({
				...operation,
				...(methodAllowsBody(endpoint.method)
					? { requestBody: requestBodyObject() }
					: {}),
				responses: responseObject(endpoint),
				servers: [
					{
						url: `https://${endpoint.host}`,
					},
				],
				"x-harpist": xHarpistForEndpoint(
					profile,
					endpoint,
					operationName,
					options,
				),
			}),
			summary: endpoint.description ?? operationName,
			tags: visibleTagsForEndpoint(profile, endpoint),
		})
		.input(inputSchemaForEndpoint(endpoint))
		.output(z.unknown());

const literal = (value: unknown) => JSON.stringify(value, null, 2);

const inputSchemaSourceForEndpoint = (endpoint: EndpointSummary) => {
	const properties: string[] = [];
	const params = pathParameterNames(routePath(endpoint));
	if (params.length > 0) {
		properties.push(
			`params: z.object({ ${params
				.map((name) => `${JSON.stringify(name)}: z.string()`)
				.join(", ")} })`,
		);
	}
	if (methodAllowsBody(endpoint.method)) {
		properties.push("body: z.unknown().optional()");
	}
	return `z.object({${properties.length > 0 ? ` ${properties.join(", ")} ` : ""}})`;
};

const sourcePropertyName = (name: string) =>
	/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);

const procedureSource = (
	profile: SiteProfile,
	endpoint: EndpointSummary,
	operationName: string,
	options: RecordedSiteContractOptions,
) =>
	[
		`  ${sourcePropertyName(operationName)}: oc.route({`,
		`      method: ${literal(routeMethod(endpoint))},`,
		`      path: ${literal(routePath(endpoint))},`,
		`      operationId: ${literal(operationName)},`,
		`      summary: ${literal(endpoint.description ?? operationName)},`,
		`      description: ${literal(descriptionForEndpoint(profile, endpoint, operationName))},`,
		`      tags: ${literal(visibleTagsForEndpoint(profile, endpoint))},`,
		'      inputStructure: "detailed",',
		"      spec: (operation) => ({",
		"        ...operation,",
		...(methodAllowsBody(endpoint.method)
			? [`        requestBody: ${literal(requestBodyObject())},`]
			: []),
		`        responses: ${literal(responseObject(endpoint))},`,
		`        servers: ${literal([{ url: `https://${endpoint.host}` }])},`,
		`        "x-harpist": ${literal(
			xHarpistForEndpoint(profile, endpoint, operationName, options),
		)},`,
		"      }),",
		"    })",
		`    .input(${inputSchemaSourceForEndpoint(endpoint)})`,
		"    .output(z.unknown()),",
	].join("\n");

export const createRecordedSiteContract = (
	profile: SiteProfile,
	options: RecordedSiteContractOptions = {},
): RecordedSiteContract => {
	const used = new Set<string>();
	const contract: RecordedSiteContract = {};

	for (const endpoint of profile.endpoints.filter(
		(item) => item.included !== false,
	)) {
		const operationName = operationNameForEndpoint(endpoint, used);
		contract[operationName] = createRecordedSiteProcedure(
			profile,
			endpoint,
			operationName,
			options,
		);
	}

	return contract;
};

export const createRecordedSiteContractSource = (
	profile: SiteProfile,
	options: RecordedSiteContractOptions = {},
) => {
	const used = new Set<string>();
	const procedures = profile.endpoints
		.filter((endpoint) => endpoint.included !== false)
		.map((endpoint) =>
			procedureSource(
				profile,
				endpoint,
				operationNameForEndpoint(endpoint, used),
				options,
			),
		);

	return [
		'import { oc } from "@orpc/contract";',
		'import { z } from "zod";',
		"",
		`export const ${recordedSiteContractExportName(profile.host)} = {`,
		...procedures,
		"} as const;",
		"",
		`export type ${recordedSiteContractExportName(profile.host).replace(/Contract$/, "ContractRouter")} = typeof ${recordedSiteContractExportName(profile.host)};`,
		"",
	].join("\n");
};
