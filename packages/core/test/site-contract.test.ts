import { describe, expect, test } from "bun:test";

import type { EndpointSummary, SiteProfile } from "../src/profiles";
import {
	createRecordedSiteContractSource,
	visibleTagsForEndpoint,
} from "../src/site-contract";

const endpoint = (
	overrides: Partial<EndpointSummary> = {},
): EndpointSummary =>
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
		displayName: "api.example.test",
		endpoints,
		host: "api.example.test",
		origin: "https://api.example.test",
	}) as SiteProfile;

const routeTagsFromSource = (source: string) =>
	[...source.matchAll(/^      tags: (\[[\s\S]*?\]),$/gm)].map((match) =>
		JSON.parse(match[1] ?? "[]"),
	);

describe("recorded site contract docs tags", () => {
	test("uses one visible navigation tag per operation", () => {
		const source = createRecordedSiteContractSource(
			profile([
				endpoint({
					description: "Get Project",
					tags: ["Example", "Projects", "Writes"],
				}),
				endpoint({
					description: "Run Report",
					method: "PATCH",
					path: "/v1/reports/123/run",
					tags: ["same-site", "api", "write", "reports"],
					template: "/v1/reports/{id}/run",
					templateKey: "PATCH api.example.test /v1/reports/{id}/run",
				}),
			]),
		);

		expect(routeTagsFromSource(source)).toEqual([["Projects"], ["reports"]]);
	});

	test("falls back to a useful single tag", () => {
		const site = profile([]);

		expect(
			visibleTagsForEndpoint(site, endpoint({ tags: ["Example"] })),
		).toEqual(["Example"]);
		expect(
			visibleTagsForEndpoint(site, endpoint({ tags: ["same-site", "api"] })),
		).toEqual(["API"]);
	});
});
