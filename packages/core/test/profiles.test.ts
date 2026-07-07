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

	test("marks unprocessed latest recordings as needing refinement", () => {
		const handoff = buildAgentHandoffText(
			profile({
				recordings: [
					{
						auth: {
							confidence: "high",
							credentialed: true,
							evidence: ["Cookie header"],
							label: "Browser session",
							type: "session-cookie",
						},
						createdAt: "2026-07-01T00:00:00.000Z",
						derivedEndpointCount: 78,
						durationMs: 1000,
						entryCount: 100,
						id: "recording-123",
						methodBreakdown: { GET: 100 },
						processingStatus: "new",
						scannedEndpointCount: 78,
						sourceUrl: "https://www.example.test",
					},
				],
			}),
			DEFAULT_SETTINGS,
		);

		expect(handoff).toContain("Status: Needs refinement.");
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

	test("can defer body schema inference while preserving endpoint counts", () => {
		const summary = summariseRecording(
			[
				{
					body: JSON.stringify({
						items: [{ id: "one" }, { id: "two" }],
					}),
					method: "POST",
					postData: JSON.stringify({ query: "harpist" }),
					postDataMime: "application/json",
					requestHeaders: {},
					responseMime: "application/json",
					startedDateTime: "2026-07-01T00:00:00.000Z",
					status: 200,
					url: "https://www.example.test/api/search",
				},
			],
			{
				host: "www.example.test",
				origin: "https://www.example.test",
				title: "Example",
				url: "https://www.example.test",
			},
			{ inferBodies: false },
		);

		expect(summary.recording.derivedEndpointCount).toBe(1);
		expect(summary.endpoints[0]?.requestBody).toBeUndefined();
		expect(summary.endpoints[0]?.responseBodies).toBeUndefined();
	});

	test("infers large JSON response bodies when requested", () => {
		const summary = summariseRecording(
			[
				{
					body: JSON.stringify({
						payload: "x".repeat(150_000),
					}),
					method: "GET",
					requestHeaders: {},
					responseMime: "application/json",
					startedDateTime: "2026-07-01T00:00:00.000Z",
					status: 200,
					url: "https://www.example.test/api/large",
				},
			],
			{
				host: "www.example.test",
				origin: "https://www.example.test",
				title: "Example",
				url: "https://www.example.test",
			},
		);

		expect(summary.endpoints[0]?.responseBodies?.[0]?.schema).toMatchObject({
			properties: {
				payload: { type: "string" },
			},
			type: "object",
		});
	});

	test("keeps heterogeneous array schema inference bounded", () => {
		const summary = summariseRecording(
			[
				{
					body: JSON.stringify(
						Array.from({ length: 500 }, (_item, index) => ({
							id: index,
							[`dynamic_${index}`]: {
								deep: {
									value: index % 2 === 0 ? String(index) : index,
								},
							},
							nested: Array.from({ length: 12 }, (_nested, nestedIndex) => ({
								[`choice_${index}_${nestedIndex}`]: nestedIndex,
							})),
						})),
					),
					method: "GET",
					requestHeaders: {},
					responseMime: "application/json",
					startedDateTime: "2026-07-01T00:00:00.000Z",
					status: 200,
					url: "https://www.example.test/api/heterogeneous",
				},
			],
			{
				host: "www.example.test",
				origin: "https://www.example.test",
				title: "Example",
				url: "https://www.example.test",
			},
		);

		const schema = summary.endpoints[0]?.responseBodies?.[0]?.schema;
		expect(JSON.stringify(schema).length).toBeLessThan(100_000);
	});
});
