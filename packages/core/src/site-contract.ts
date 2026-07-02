import type { AnyContractProcedure, Route } from "@orpc/contract";
import { oc } from "@orpc/contract";
import { jsonSchemaToZod, jsonSchemaToZodSource } from "./json-schema-zod";
import type { SiteProfile } from "./profiles";
import {
	createRecordedSiteContractProfile,
	resolveContractProfile,
} from "./site-contract-profile";
import type {
	ContractProfile,
	ContractProfileOperation,
} from "./site-contract-profile-schema";

type RecordedSiteContract = Record<string, AnyContractProcedure>;
type RecordedSiteContractOptions = {
	source?: string;
	updatedAt?: string;
};
type RecordedRoutePath = Extract<Route["path"], string>;

export { visibleTagsForEndpoint } from "./site-contract-profile";

const unknownSchema = {};

export const recordedSiteContractExportName = (host: string) => {
	const safe = host.replace(/[^a-zA-Z0-9_$]/g, "_");
	const name = safe || "recordedSite";
	return `${/^[a-zA-Z_$]/.test(name) ? name : `_${name}`}Contract`;
};

const literal = (value: unknown) => JSON.stringify(value, null, 2);

const sourcePropertyName = (name: string) =>
	/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);

const requestBodyObject = (operation: ContractProfileOperation) =>
	operation.request?.body
		? {
				content: {
					[operation.request.body.contentType]: {
						schema: operation.request.body.schema,
					},
				},
				required: operation.request.body.required,
			}
		: undefined;

const responseObject = (operation: ContractProfileOperation) =>
	Object.fromEntries(
		operation.responses.map((response) => [
			String(response.status),
			{
				content: {
					[response.contentType]: {
						schema: response.schema,
					},
				},
				description: response.description,
			},
		]),
	);

const xHarpistForOperation = (operation: ContractProfileOperation) => ({
	...(operation.extensions?.["x-harpist"] &&
	typeof operation.extensions["x-harpist"] === "object"
		? operation.extensions["x-harpist"]
		: {}),
	documentationSource:
		operation.provenance?.documentationSource ??
		(operation.extensions?.["x-harpist"] as { documentationSource?: unknown })
			?.documentationSource,
	documentationUpdatedAt:
		operation.provenance?.documentationUpdatedAt ??
		(
			operation.extensions?.["x-harpist"] as {
				documentationUpdatedAt?: unknown;
			}
		)?.documentationUpdatedAt,
	endpointKey:
		operation.provenance?.endpointKey ??
		(operation.extensions?.["x-harpist"] as { endpointKey?: unknown })
			?.endpointKey,
	replayCommand: operation.replay?.command,
	runtimeAuth: {
		bindsCredentialValues: false,
		mode: "latest-auth-option",
		source: operation.replay?.authSource ?? "profile.latestAuth",
	},
	sourceTags: operation.provenance?.sourceTags ?? [],
});

const routeSpecObject = (
	profile: ContractProfile,
	operation: ContractProfileOperation,
) => ({
	...(requestBodyObject(operation)
		? { requestBody: requestBodyObject(operation) }
		: {}),
	responses: responseObject(operation),
	servers: profile.service.servers,
	"x-harpist": xHarpistForOperation(operation),
});

const outputSchemaForOperation = (operation: ContractProfileOperation) =>
	operation.outputSchema ?? operation.responses[0]?.schema ?? unknownSchema;

const createRecordedSiteProcedure = (
	profile: ContractProfile,
	operation: ContractProfileOperation,
) =>
	oc
		.route({
			description: operation.description,
			inputStructure: "detailed",
			method: operation.method as Route["method"],
			operationId: operation.operationId,
			path: operation.path as RecordedRoutePath,
			spec: (routeOperation) =>
				({
					...routeOperation,
					...routeSpecObject(profile, operation),
				}) as typeof routeOperation,
			summary: operation.summary,
			tags: operation.tags,
		})
		.input(jsonSchemaToZod(operation.inputSchema))
		.output(jsonSchemaToZod(outputSchemaForOperation(operation)));

const procedureSource = (
	profile: ContractProfile,
	operation: ContractProfileOperation,
) =>
	[
		`  ${sourcePropertyName(operation.operationId)}: oc.route({`,
		`      method: ${literal(operation.method)} as const,`,
		`      path: ${literal(operation.path)},`,
		`      operationId: ${literal(operation.operationId)},`,
		`      summary: ${literal(operation.summary)},`,
		`      description: ${literal(operation.description)},`,
		`      tags: ${literal(operation.tags)},`,
		'      inputStructure: "detailed",',
		"      spec: (operation) => ({",
		"        ...operation,",
		`        ...${literal(routeSpecObject(profile, operation))},`,
		"      }),",
		"    })",
		`    .input(${jsonSchemaToZodSource(operation.inputSchema)})`,
		`    .output(${jsonSchemaToZodSource(outputSchemaForOperation(operation))}),`,
	].join("\n");

export const createContractProfileContract = (
	input: ContractProfile,
): RecordedSiteContract => {
	const profile = resolveContractProfile(input);
	return Object.fromEntries(
		profile.operations.map((operation) => [
			operation.operationId,
			createRecordedSiteProcedure(profile, operation),
		]),
	);
};

export const createContractProfileContractSource = (input: ContractProfile) => {
	const profile = resolveContractProfile(input);
	const procedures = profile.operations.map((operation) =>
		procedureSource(profile, operation),
	);
	const exportName = recordedSiteContractExportName(profile.service.host);
	const routerName = exportName.replace(/Contract$/, "ContractRouter");
	return [
		'import { oc } from "@orpc/contract";',
		'import { z } from "zod";',
		"",
		`export const ${exportName} = {`,
		...procedures,
		"} as const;",
		"",
		`export type ${routerName} = typeof ${exportName};`,
		"",
	].join("\n");
};

export const createRecordedSiteContract = (
	profile: SiteProfile,
	options: RecordedSiteContractOptions = {},
): RecordedSiteContract =>
	createContractProfileContract(
		createRecordedSiteContractProfile(profile, options),
	);

export const createRecordedSiteContractSource = (
	profile: SiteProfile,
	options: RecordedSiteContractOptions = {},
) =>
	createContractProfileContractSource(
		createRecordedSiteContractProfile(profile, options),
	);
