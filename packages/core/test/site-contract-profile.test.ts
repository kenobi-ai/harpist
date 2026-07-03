import { describe, expect, test } from "bun:test";
import { jsonSchemaToZod } from "../src/json-schema-zod";
import type { EndpointSummary, SiteProfile } from "../src/profiles";
import { createContractProfileContractSource } from "../src/site-contract";
import { createOpenApiDocumentFromContractProfile } from "../src/site-contract-openapi";
import {
	CONTRACT_PROFILE_FORMAT,
	createRecordedSiteContractProfile,
	resolveContractProfile,
} from "../src/site-contract-profile";

const endpoint = (overrides: Partial<EndpointSummary> = {}): EndpointSummary =>
	({
		exactKey: "GET https://api.example.test/v1/projects/123",
		host: "api.example.test",
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v1/projects/123",
		samples: 1,
		statuses: [200],
		template: "/v1/projects/{id}",
		templateKey: "GET api.example.test /v1/projects/{id}",
		...overrides,
	}) as EndpointSummary;

const profile = (endpoints: EndpointSummary[]): SiteProfile =>
	({
		auth: {
			confidence: "high",
			evidence: ["test"],
			label: "Browser session",
			type: "session-cookie",
		},
		displayName: "api.example.test",
		endpoints,
		host: "api.example.test",
		origin: "https://api.example.test",
		recordings: [],
	}) as SiteProfile;

describe("contract profile", () => {
	test("resolves a portable JSON profile before rendering artifacts", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([
				endpoint({
					description: "Get Project",
					operationName: "getProject",
					tags: ["Example", "Projects"],
				}),
				endpoint({
					description: "Get Project Task",
					exactKey: "GET https://api.example.test/v1/projects/123/tasks/456",
					operationName: "getProject",
					path: "/v1/projects/123/tasks/456",
					template: "/v1/projects/{id}/tasks/{id}",
					templateKey: "GET api.example.test /v1/projects/{id}/tasks/{id}",
				}),
			]),
			{
				source: "test",
				updatedAt: "2026-07-02T00:00:00.000Z",
			},
		);

		expect(contractProfile.format).toBe(CONTRACT_PROFILE_FORMAT);
		expect(contractProfile.operations.map((item) => item.operationId)).toEqual([
			"getProject",
			"getProject2",
		]);
		expect(contractProfile.operations[1]?.path).toBe(
			"/v1/projects/{id}/tasks/{id2}",
		);
		expect(contractProfile.operations[1]?.parameters.path).toHaveProperty(
			"id2",
		);

		const openapi = createOpenApiDocumentFromContractProfile(contractProfile);
		expect(openapi["x-harpist"].sourceArtifact).toBe("contract-profile.json");
		expect(openapi.paths["/v1/projects/{id}"]?.get).toMatchObject({
			operationId: "getProject",
			summary: "Get Project",
			tags: ["Projects"],
		});
	});

	test("models observed query parameters as contract inputs", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([
				endpoint({
					description: "Search",
					exactKey: "GET api.example.test/api/search",
					operationName: "search",
					path: "/api/search",
					queryParams: [
						{
							name: "q",
							repeated: false,
							samples: 2,
							values: ["harpist"],
						},
						{
							name: "tag",
							repeated: true,
							samples: 1,
							values: ["cli", "api"],
						},
					],
					responseBodies: [
						{
							contentType: "application/json",
							schema: {
								properties: {
									count: { type: "integer" },
									query: { type: "string" },
									skills: {
										items: {
											properties: { name: { type: "string" } },
											type: "object",
										},
										type: "array",
									},
								},
								required: ["query", "skills", "count"],
								type: "object",
							},
							status: 200,
						},
					],
					template: "/api/search",
					templateKey: "GET api.example.test /api/search",
				}),
			]),
		);
		const operation = contractProfile.operations[0];

		expect(operation?.inputSchema).toMatchObject({
			properties: {
				query: {
					properties: {
						q: { type: "string" },
						tag: {
							items: { type: "string" },
							type: "array",
						},
					},
					type: "object",
				},
			},
		});
		expect(operation?.parameters.query).toMatchObject({
			q: { required: false, schema: { type: "string" } },
			tag: {
				required: false,
				schema: { items: { type: "string" }, type: "array" },
			},
		});
		expect(operation?.outputSchema).toMatchObject({
			properties: {
				count: { type: "integer" },
				query: { type: "string" },
				skills: { type: "array" },
			},
			type: "object",
		});
		expect(operation?.responses[0]?.schema).toMatchObject({
			properties: {
				count: { type: "integer" },
				query: { type: "string" },
				skills: { type: "array" },
			},
			type: "object",
		});

		const openapi = createOpenApiDocumentFromContractProfile(contractProfile);
		const parameters = openapi.paths["/api/search"]?.get?.parameters;
		expect(parameters).toContainEqual(
			expect.objectContaining({
				in: "query",
				name: "q",
				required: false,
				schema: { type: "string" },
			}),
		);
		expect(parameters).toContainEqual(
			expect.objectContaining({
				in: "query",
				name: "tag",
				schema: { items: { type: "string" }, type: "array" },
			}),
		);
		expect(
			openapi.paths["/api/search"]?.get?.responses["200"].content[
				"application/json"
			].schema,
		).toMatchObject({
			properties: {
				count: { type: "integer" },
				query: { type: "string" },
				skills: { type: "array" },
			},
			type: "object",
		});
	});

	test("rejects ambiguous or contradictory routes", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([
				endpoint({
					operationName: "getProject",
				}),
			]),
		);

		expect(() =>
			resolveContractProfile({
				...contractProfile,
				operations: [
					...contractProfile.operations,
					{
						...contractProfile.operations[0],
						path: "/v1/other/{id}",
					},
				],
			}),
		).toThrow("Duplicate operationId");

		expect(() =>
			resolveContractProfile({
				...contractProfile,
				operations: [
					{
						...contractProfile.operations[0],
						parameters: {
							path: {
								extra: { schema: { type: "string" } },
							},
						},
					},
				],
			}),
		).toThrow("unused path parameter");
	});

	test("derives missing output schema from the first response schema", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([endpoint({ operationName: "getProject" })]),
		);
		const operation = contractProfile.operations[0];
		const { outputSchema: _outputSchema, ...operationWithoutOutput } =
			operation;
		const resolved = resolveContractProfile({
			...contractProfile,
			operations: [
				{
					...operationWithoutOutput,
					responses: [
						{
							description: "Project",
							schema: {
								properties: { ok: { type: "boolean" } },
								required: ["ok"],
								type: "object",
							},
							status: 200,
						},
					],
				},
			],
		});

		expect(resolved.operations[0]?.outputSchema).toMatchObject({
			type: "object",
		});
	});

	test("renders JSON Schema into the generated oRPC adapter source", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([
				endpoint({
					method: "POST",
					operationName: "createProject",
					statuses: [201],
				}),
			]),
		);
		const resolved = resolveContractProfile({
			...contractProfile,
			operations: [
				{
					...contractProfile.operations[0],
					inputSchema: {
						additionalProperties: false,
						properties: {
							body: {
								additionalProperties: false,
								properties: {
									name: { type: "string" },
									priority: { type: "integer" },
								},
								required: ["name"],
								type: "object",
							},
						},
						required: ["body"],
						type: "object",
					},
				},
			],
		});
		const source = createContractProfileContractSource(resolved);

		expect(source).toContain("body: z.object");
		expect(source).toContain("name: z.string()");
		expect(source).toContain("priority: z.number().int().optional()");
	});

	test("validates the JSON Schema subset used by generated contracts", () => {
		const schema = jsonSchemaToZod({
			additionalProperties: false,
			properties: {
				count: { type: "integer" },
				kind: { const: "project" },
			},
			required: ["kind"],
			type: "object",
		});

		expect(schema.safeParse({ count: 2, kind: "project" }).success).toBe(true);
		expect(schema.safeParse({ kind: "task" }).success).toBe(false);
		expect(schema.safeParse({ extra: true, kind: "project" }).success).toBe(
			false,
		);
	});
});
