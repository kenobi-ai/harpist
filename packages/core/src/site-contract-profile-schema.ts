import { z } from "zod";
import { contractJsonSchemaSchema, jsonValueSchema } from "./json-schema-zod";

export const CONTRACT_PROFILE_FORMAT = "harpist.contract-profile";
export const CONTRACT_PROFILE_VERSION = 1;
export const CONTRACT_PROFILE_SCHEMA_ID =
	"https://harpist.dev/schemas/contract-profile.v1.json";

const unknownSchema = {};
const nonEmptyString = z.string().trim().min(1);
export const contractProfileMethodSchema = z.enum([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
	"TRACE",
]);
const statusSchema = z.union([
	z.number().int().min(100).max(599),
	z.literal("default"),
]);
const extensionMapSchema = z.record(z.string(), jsonValueSchema).optional();
const parameterSchema = z.object({
	description: nonEmptyString.optional(),
	required: z.boolean().optional(),
	schema: contractJsonSchemaSchema.default(unknownSchema),
});
const parameterMapSchema = z.record(z.string(), parameterSchema).default({});

export const contractProfileSchema = z.object({
	$schema: z.literal(CONTRACT_PROFILE_SCHEMA_ID),
	auth: z.record(z.string(), jsonValueSchema).optional(),
	components: z
		.object({
			schemas: z.record(z.string(), contractJsonSchemaSchema).optional(),
		})
		.optional(),
	extensions: extensionMapSchema,
	format: z.literal(CONTRACT_PROFILE_FORMAT),
	operations: z.array(
		z.object({
			description: nonEmptyString,
			extensions: extensionMapSchema,
			inputSchema: contractJsonSchemaSchema.default(unknownSchema),
			method: contractProfileMethodSchema,
			operationId: nonEmptyString,
			outputSchema: contractJsonSchemaSchema.optional(),
			parameters: z
				.object({
					header: parameterMapSchema.optional(),
					path: parameterMapSchema.optional(),
					query: parameterMapSchema.optional(),
				})
				.default({}),
			path: nonEmptyString,
			provenance: z
				.object({
					documentationSource: nonEmptyString.optional(),
					documentationUpdatedAt: nonEmptyString.optional(),
					endpointKey: nonEmptyString,
					exactKey: nonEmptyString,
					host: nonEmptyString,
					lastSeenAt: nonEmptyString,
					path: nonEmptyString,
					samples: z.number().int().nonnegative(),
					sourceTags: z.array(nonEmptyString).default([]),
					statuses: z.array(z.number().int()).default([]),
					template: nonEmptyString,
				})
				.optional(),
			replay: z
				.object({
					authSource: nonEmptyString.default("profile.latestAuth"),
					command: nonEmptyString,
					selector: nonEmptyString.optional(),
				})
				.optional(),
			request: z
				.object({
					body: z
						.object({
							contentType: nonEmptyString.default("application/json"),
							required: z.boolean().default(false),
							schema: contractJsonSchemaSchema.default(unknownSchema),
						})
						.optional(),
				})
				.optional(),
			responses: z
				.array(
					z.object({
						contentType: nonEmptyString.default("application/json"),
						description: nonEmptyString.default("Observed response"),
						schema: contractJsonSchemaSchema.default(unknownSchema),
						status: statusSchema,
					}),
				)
				.default([]),
			summary: nonEmptyString,
			tags: z.array(nonEmptyString).default(["API"]),
		}),
	),
	service: z.object({
		displayName: nonEmptyString,
		host: nonEmptyString,
		origin: nonEmptyString,
		servers: z
			.array(
				z.object({
					description: nonEmptyString.optional(),
					url: nonEmptyString,
				}),
			)
			.optional(),
	}),
	source: z.object({
		generatedAt: nonEmptyString,
		generator: nonEmptyString.default("harpist"),
		kind: nonEmptyString.default("harpist-profile"),
		source: nonEmptyString.optional(),
	}),
	version: z.literal(CONTRACT_PROFILE_VERSION),
});

export type ContractProfile = z.infer<typeof contractProfileSchema>;
export type ContractProfileOperation = ContractProfile["operations"][number];

export const CONTRACT_PROFILE_JSON_SCHEMA = {
	$defs: {
		jsonSchema: {
			oneOf: [{ type: "boolean" }, { type: "object" }],
		},
		operation: {
			additionalProperties: false,
			properties: {
				description: { type: "string" },
				inputSchema: { $ref: "#/$defs/jsonSchema" },
				method: { enum: contractProfileMethodSchema.options },
				operationId: { type: "string" },
				outputSchema: { $ref: "#/$defs/jsonSchema" },
				parameters: { type: "object" },
				path: { pattern: "^/", type: "string" },
				request: { type: "object" },
				responses: { items: { type: "object" }, type: "array" },
				summary: { type: "string" },
				tags: { items: { type: "string" }, type: "array" },
			},
			required: ["method", "path", "operationId", "summary", "description"],
			type: "object",
		},
	},
	$id: CONTRACT_PROFILE_SCHEMA_ID,
	$schema: "https://json-schema.org/draft/2020-12/schema",
	additionalProperties: false,
	properties: {
		$schema: { const: CONTRACT_PROFILE_SCHEMA_ID },
		auth: { type: "object" },
		components: { type: "object" },
		extensions: { type: "object" },
		format: { const: CONTRACT_PROFILE_FORMAT },
		operations: { items: { $ref: "#/$defs/operation" }, type: "array" },
		service: {
			additionalProperties: false,
			properties: {
				displayName: { type: "string" },
				host: { type: "string" },
				origin: { type: "string" },
				servers: { items: { type: "object" }, type: "array" },
			},
			required: ["host", "origin", "displayName"],
			type: "object",
		},
		source: { type: "object" },
		version: { const: CONTRACT_PROFILE_VERSION },
	},
	required: [
		"$schema",
		"format",
		"version",
		"service",
		"source",
		"operations",
	],
	title: "Harpist Contract Profile",
	type: "object",
} as const;
