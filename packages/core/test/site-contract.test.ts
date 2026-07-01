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
		exactKey: "GET https://app.clay.com/v3/workbooks/123",
		host: "app.clay.com",
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v3/workbooks/123",
		samples: 1,
		statuses: [200],
		template: "/v3/workbooks/{id}",
		templateKey: "GET app.clay.com /v3/workbooks/{id}",
		...overrides,
	}) as EndpointSummary;

const profile = (endpoints: EndpointSummary[]): SiteProfile =>
	({
		displayName: "app.clay.com",
		endpoints,
		host: "app.clay.com",
		origin: "https://app.clay.com",
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
					description: "Get Workbook",
					tags: ["Clay", "Workbooks", "Writes"],
				}),
				endpoint({
					description: "Run Table",
					method: "PATCH",
					path: "/v3/tables/123/run",
					tags: ["same-site", "api", "write", "table"],
					template: "/v3/tables/{id}/run",
					templateKey: "PATCH app.clay.com /v3/tables/{id}/run",
				}),
			]),
		);

		expect(routeTagsFromSource(source)).toEqual([["Workbooks"], ["table"]]);
	});

	test("falls back to a useful single tag", () => {
		const site = profile([]);

		expect(
			visibleTagsForEndpoint(site, endpoint({ tags: ["Clay"] })),
		).toEqual(["Clay"]);
		expect(
			visibleTagsForEndpoint(site, endpoint({ tags: ["same-site", "api"] })),
		).toEqual(["API"]);
	});
});
