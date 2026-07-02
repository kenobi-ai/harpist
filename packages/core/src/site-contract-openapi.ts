import type { ContractProfileOperation } from "./site-contract-profile-schema";
import {
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_VERSION,
	type ContractProfile,
} from "./site-contract-profile-schema";
import { resolveContractProfile } from "./site-contract-profile";

const openApiParameters = (operation: ContractProfileOperation) =>
	(["path", "query", "header"] as const).flatMap((where) =>
		Object.entries(operation.parameters[where] ?? {}).map(([name, parameter]) => ({
			description: parameter.description,
			in: where,
			name,
			required: where === "path" ? true : (parameter.required ?? false),
			schema: parameter.schema,
		})),
	);

const openApiRequestBody = (operation: ContractProfileOperation) =>
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

const openApiResponses = (operation: ContractProfileOperation) =>
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

export const createOpenApiDocumentFromContractProfile = (
	input: ContractProfile,
	options: { source?: string; updatedAt?: string } = {},
) => {
	const profile = resolveContractProfile(input);
	const paths: Record<string, Record<string, unknown>> = {};
	for (const operation of profile.operations) {
		const pathItem = paths[operation.path] ?? {};
		pathItem[operation.method.toLowerCase()] = {
			description: operation.description,
			operationId: operation.operationId,
			parameters: openApiParameters(operation),
			requestBody: openApiRequestBody(operation),
			responses: openApiResponses(operation),
			summary: operation.summary,
			tags: operation.tags,
			...(operation.extensions ?? {}),
		};
		paths[operation.path] = pathItem;
	}
	return {
		components: profile.components,
		info: {
			description: `Generated from ${profile.service.host}'s Harpist contract profile.`,
			title: `${profile.service.displayName} API`,
			version: "0.1.0",
		},
		openapi: "3.1.0",
		paths,
		servers: profile.service.servers,
		"x-harpist": {
			contractProfileFormat: CONTRACT_PROFILE_FORMAT,
			contractProfileVersion: CONTRACT_PROFILE_VERSION,
			generatedAt: options.updatedAt ?? profile.source.generatedAt,
			host: profile.service.host,
			source: options.source ?? profile.source.source,
			sourceArtifact: "contract-profile.json",
		},
	};
};
