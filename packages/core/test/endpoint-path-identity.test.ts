import { describe, expect, test } from "bun:test";
import { summariseRecording } from "../src/profiles";

const summarisePaths = (paths: string[]) =>
	summariseRecording(
		paths.map((path, index) => ({
			method: "GET",
			requestHeaders: {},
			startedDateTime: `2026-07-01T00:00:0${index}.000Z`,
			status: 200,
			url: `https://api.example.test${path}`,
		})),
		{
			host: "api.example.test",
			origin: "https://api.example.test",
			title: "Example",
			url: "https://api.example.test",
		},
	);

describe("endpoint path identity", () => {
	test("keeps alphabetic RPC operation paths distinct", () => {
		const summary = summarisePaths([
			"/api/Reports/GetProfilePictureUrls",
			"/api/Reports/GetUpdatedProgressStatsFromElastic",
		]);

		expect(summary.endpoints.map((endpoint) => endpoint.template)).toEqual([
			"/api/Reports/GetProfilePictureUrls",
			"/api/Reports/GetUpdatedProgressStatsFromElastic",
		]);
		expect(summary.recording.derivedEndpointCount).toBe(2);
	});

	test("does not template alphabetic segments resembling hexadecimal ids", () => {
		const summary = summarisePaths(["/api/deadbeef", "/api/feedface"]);

		expect(summary.endpoints.map((endpoint) => endpoint.template)).toEqual([
			"/api/deadbeef",
			"/api/feedface",
		]);
	});

	test("keeps long RPC operation names containing version numbers literal", () => {
		const summary = summarisePaths([
			"/api/Reports/GetUpdatedCampaignProgressStatsV2",
			"/api/Reports/ExchangeOAuth2AuthorizationCode",
			"/api/reports/getupdatedcampaignprogressstatsv2",
			"/api/reports/get-campaign-progress-stats-v2",
			"/api/reports/ABCDEFGHJKMNPQRSTVWXYZABCD",
			"/api/reports/deadbeef2026",
		]);

		expect(summary.endpoints.map((endpoint) => endpoint.template)).toEqual([
			"/api/reports/ABCDEFGHJKMNPQRSTVWXYZABCD",
			"/api/reports/deadbeef2026",
			"/api/Reports/ExchangeOAuth2AuthorizationCode",
			"/api/reports/get-campaign-progress-stats-v2",
			"/api/reports/getupdatedcampaignprogressstatsv2",
			"/api/Reports/GetUpdatedCampaignProgressStatsV2",
		]);
	});

	test("still templates numeric and opaque id segments", () => {
		const summary = summarisePaths([
			"/api/items/customer123456789012",
			"/api/items/customer987654321098",
			"/api/items/123",
			"/api/items/550e8400-e29b-41d4-a716-446655440000",
			"/api/items/01JBEZ5E7M7Q7MYP2WV2NQ9WCR",
		]);

		expect(summary.endpoints).toHaveLength(1);
		expect(summary.endpoints[0]).toMatchObject({
			samples: 5,
			template: "/api/items/{id}",
		});
	});
});
