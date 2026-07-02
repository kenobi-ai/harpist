import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { EndpointSummary, SiteProfile } from "../../core/src/profiles";
import { buildRecordedSiteArtifacts } from "../src/artifacts";

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

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

const profile = (): SiteProfile =>
	({
		auth: {
			confidence: "high",
			evidence: ["test"],
			label: "Browser session",
			type: "session-cookie",
		},
		displayName: "api.example.test",
		endpoints: [
			endpoint({
				description: "Get Project",
				notes: "Fetches project metadata for the workspace.",
				operationName: "getProject",
				tags: ["Example", "Projects"],
			}),
		],
		host: "api.example.test",
		origin: "https://api.example.test",
		recordings: [],
	}) as SiteProfile;

describe("recorded site artifacts", () => {
	test("writes contract profile as the source artifact", async () => {
		const artifacts = await buildRecordedSiteArtifacts(profile(), {
			paths: {
				contractPath: "sites/api-example-test/contract.ts",
				contractProfilePath: "sites/api-example-test/contract-profile.json",
				metadataPath: "sites/api-example-test/metadata.json",
				openapiPath: "sites/api-example-test/openapi.json",
			},
			source: "test",
			updatedAt: "2026-07-02T00:00:00.000Z",
		});

		expect(artifacts.files.contractProfile).toMatchObject({
			format: "harpist.contract-profile",
			version: 1,
		});
		expect(artifacts.files.contractSource).toContain("getProject");
		expect(artifacts.files.openapi).toMatchObject({
			"x-harpist": {
				sourceArtifact: "contract-profile.json",
			},
		});
		expect(artifacts.profileArtifacts).toMatchObject({
			contractProfileFormat: "harpist.contract-profile",
			contractProfilePath: "sites/api-example-test/contract-profile.json",
			generatedFrom: "contract-profile",
			openapiSource: "contract-profile",
		});
		expect(artifacts.profileArtifacts.contractProfileSha256).toBe(
			sha256(stableJson(artifacts.files.contractProfile)),
		);
		expect(artifacts.profileArtifacts.openapiSha256).toBe(
			sha256(stableJson(artifacts.files.openapi)),
		);
	});
});
