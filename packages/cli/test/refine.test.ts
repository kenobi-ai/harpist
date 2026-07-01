import { describe, expect, test } from "bun:test";
import type { EndpointSummary } from "@harpist/core/profiles";
import {
	applyExistingEndpointAnnotations,
	type EndpointDecision,
	hasCuratedEndpointDocumentation,
} from "../src/refine";

const endpoint = (
	overrides: Partial<EndpointSummary> = {},
): EndpointSummary =>
	({
		exactKey: "GET api.example.test/v1/projects/abc",
		host: "api.example.test",
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v1/projects/abc",
		samples: 1,
		statuses: [200],
		template: "/v1/projects/{id}",
		templateKey: "GET api.example.test/v1/projects/{id}",
		...overrides,
	}) as EndpointSummary;

const decision = (
	endpointSummary: EndpointSummary,
	overrides: Partial<EndpointDecision> = {},
): EndpointDecision => ({
	description: "Get Abc123 Project",
	endpoint: endpointSummary,
	included: true,
	notes: "Gets abc123 project observed during the recorded browser workflow.",
	operationName: "getApiExampleTestV1ProjectsById",
	tags: ["same-site", "api"],
	...overrides,
});

describe("refine endpoint annotations", () => {
	test("preserves curated endpoint docs through generic refinement", () => {
		const curated = endpoint({
			description: "Get Project",
			included: true,
			notes:
				"Fetches project metadata for the workspace, including the resource state needed to open the project view.",
			operationName: "getProject",
			tags: ["Example", "Projects"],
		});

		const result = applyExistingEndpointAnnotations(
			curated,
			decision(curated),
			{ htmlErrorOnly: false },
		);

		expect(result.description).toBe("Get Project");
		expect(result.notes).toContain("Fetches project metadata");
		expect(result.operationName).toBe("getProject");
		expect(result.tags).toEqual(["Example", "Projects"]);
		expect(result.included).toBe(true);
	});

	test("does not preserve neutral generated docs", () => {
		const neutral = endpoint({
			description: "Get Abc123 Project",
			notes: "Gets abc123 project observed during the recorded browser workflow.",
			tags: ["same-site", "api"],
		});
		const replacement = decision(neutral, {
			description: "Get Project",
			notes: "Gets projects observed during the recorded browser workflow.",
			tags: ["same-site", "api", "projects"],
		});

		expect(hasCuratedEndpointDocumentation(neutral)).toBe(false);
		expect(
			applyExistingEndpointAnnotations(neutral, replacement, {
				htmlErrorOnly: false,
			}),
		).toMatchObject({
			description: "Get Project",
			notes: "Gets projects observed during the recorded browser workflow.",
			tags: ["same-site", "api", "projects"],
		});
	});

	test("keeps html error samples excluded", () => {
		const curated = endpoint({
			description: "Get Project",
			included: true,
			notes: "Fetches project metadata for the workspace.",
			tags: ["Example", "Projects"],
		});

		expect(
			applyExistingEndpointAnnotations(curated, decision(curated), {
				htmlErrorOnly: true,
			}),
		).toMatchObject({
			included: false,
			notes:
				"Excluded because the sampled browser request returned an HTML access/error page.",
		});
	});
});
