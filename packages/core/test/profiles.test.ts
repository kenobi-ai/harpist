import { describe, expect, test } from "bun:test";
import {
	buildAgentHandoffText,
	DEFAULT_SETTINGS,
	type SiteProfile,
	summariseRecording,
} from "../src/profiles";

const profile = (overrides: Partial<SiteProfile> = {}): SiteProfile =>
	({
		auth: {
			confidence: "high",
			credentialed: true,
			evidence: ["Cookie header"],
			label: "Browser session",
			type: "session-cookie",
		},
		createdAt: "2026-07-01T00:00:00.000Z",
		derivedEndpointCount: 78,
		displayName: "www.example.test",
		endpointTemplateKeys: [],
		endpoints: [],
		host: "www.example.test",
		lastRecordingId: "recording-123",
		latestAuth: {
			label: "Latest auth ready",
			recordingId: "recording-123",
			status: "ready",
			validation: { status: "not-checked" },
			valueCount: 1,
			values: [],
		},
		origin: "https://www.example.test",
		recordingCount: 1,
		recordings: [],
		scannedEndpointCount: 78,
		scannedEndpointKeys: [],
		status: "synced",
		updatedAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	}) as SiteProfile;

describe("agent handoff text", () => {
	test("stays focused on recording facts instead of workflow steps", () => {
		const handoff = buildAgentHandoffText(
			profile({
				remoteDocsUrl: "http://localhost:4277/profiles/www.example.test/docs",
			}),
			DEFAULT_SETTINGS,
		);

		expect(handoff).toBe(
			[
				"Use the Harpist skill for www.example.test.",
				"Recording: recording-123 (78 endpoints).",
				"Auth: Browser session.",
				"Credential: Latest auth ready.",
			].join("\n"),
		);
		expect(handoff).not.toContain("http://");
		expect(handoff).not.toContain("Bridge URL");
		expect(handoff).not.toContain("oRPC URL");
		expect(handoff).not.toContain("Docs:");
		expect(handoff).not.toContain("auth.replay");
		expect(handoff).not.toContain("Recapture auth");
	});
});

describe("recording summaries", () => {
	test("destructures observed query parameters", () => {
		const summary = summariseRecording(
			[
				{
					body: JSON.stringify({
						count: 1,
						duration_ms: 12,
						query: "harpist",
						skills: [{ name: "Harpist", slug: "harpist" }],
					}),
					method: "GET",
					requestHeaders: {},
					responseMime: "application/json",
					startedDateTime: "2026-07-01T00:00:00.000Z",
					status: 200,
					url: "https://www.example.test/api/search?q=harpist&tag=cli&tag=api",
				},
				{
					body: JSON.stringify({
						count: 0,
						duration_ms: 8,
						query: "docs",
						searchType: "semantic",
						skills: [],
					}),
					method: "GET",
					requestHeaders: {},
					responseMime: "application/json",
					startedDateTime: "2026-07-01T00:00:01.000Z",
					status: 200,
					url: "https://www.example.test/api/search?q=docs",
				},
			],
			{
				host: "www.example.test",
				origin: "https://www.example.test",
				title: "Example",
				url: "https://www.example.test",
			},
		);

		expect(summary.endpoints[0]?.queryParams).toEqual([
			{
				name: "q",
				repeated: false,
				samples: 2,
				values: ["harpist", "docs"],
			},
			{
				name: "tag",
				repeated: true,
				samples: 1,
				values: ["cli", "api"],
			},
		]);
		expect(summary.endpoints[0]?.responseBodies?.[0]).toMatchObject({
			contentType: "application/json",
			schema: {
				properties: {
					count: { type: "integer" },
					duration_ms: { type: "integer" },
					query: { type: "string" },
					searchType: { type: "string" },
					skills: {
						items: {
							properties: {
								name: { type: "string" },
								slug: { type: "string" },
							},
							type: "object",
						},
						type: "array",
					},
				},
				type: "object",
			},
			status: 200,
		});
	});
});
