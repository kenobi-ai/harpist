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
		exactKey: "GET api.clay.com/v3/workbooks/abc",
		host: "api.clay.com",
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v3/workbooks/abc",
		samples: 1,
		statuses: [200],
		template: "/v3/workbooks/{id}",
		templateKey: "GET api.clay.com/v3/workbooks/{id}",
		...overrides,
	}) as EndpointSummary;

const decision = (
	endpointSummary: EndpointSummary,
	overrides: Partial<EndpointDecision> = {},
): EndpointDecision => ({
	description: "Get Wb 0sy3reyqwp Pfwpt4dzj",
	endpoint: endpointSummary,
	included: true,
	notes:
		"Gets wb 0sy3reyqwp pfwpt4dzj observed during the recorded browser workflow.",
	operationName: "getApiClayComV3WorkbooksById",
	tags: ["same-site", "api"],
	...overrides,
});

describe("refine endpoint annotations", () => {
	test("preserves curated endpoint docs through generic refinement", () => {
		const curated = endpoint({
			description: "Get Workbook",
			included: true,
			notes:
				"Fetches workbook metadata inside a Clay workspace, including the resource state needed to open the workbook view.",
			operationName: "getWorkbook",
			tags: ["Clay", "Workbooks"],
		});

		const result = applyExistingEndpointAnnotations(
			curated,
			decision(curated),
			{ htmlErrorOnly: false },
		);

		expect(result.description).toBe("Get Workbook");
		expect(result.notes).toContain("Fetches workbook metadata");
		expect(result.operationName).toBe("getWorkbook");
		expect(result.tags).toEqual(["Clay", "Workbooks"]);
		expect(result.included).toBe(true);
	});

	test("does not preserve neutral generated docs", () => {
		const neutral = endpoint({
			description: "Get Wb 0sy3reyqwp Pfwpt4dzj",
			notes:
				"Gets wb 0sy3reyqwp pfwpt4dzj observed during the recorded browser workflow.",
			tags: ["same-site", "api"],
		});
		const replacement = decision(neutral, {
			description: "Get Workbook",
			notes: "Gets workbooks observed during the recorded browser workflow.",
			tags: ["same-site", "api", "workbooks"],
		});

		expect(hasCuratedEndpointDocumentation(neutral)).toBe(false);
		expect(
			applyExistingEndpointAnnotations(neutral, replacement, {
				htmlErrorOnly: false,
			}),
		).toMatchObject({
			description: "Get Workbook",
			notes: "Gets workbooks observed during the recorded browser workflow.",
			tags: ["same-site", "api", "workbooks"],
		});
	});

	test("keeps html error samples excluded", () => {
		const curated = endpoint({
			description: "Get Workbook",
			included: true,
			notes: "Fetches workbook metadata inside a Clay workspace.",
			tags: ["Clay", "Workbooks"],
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
