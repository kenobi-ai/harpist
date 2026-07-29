import { describe, expect, test } from "bun:test";
import type { PopupState, SiteProfile } from "@harpist/core/profiles";
import { buildDebugSnapshot } from "../lib/debug-snapshot";

describe("debug snapshot", () => {
	test("keeps troubleshooting metadata without captured values or URLs", () => {
		const profile = {
			auth: {
				confidence: "high",
				credentialed: true,
				evidence: [],
				label: "Session",
				type: "session-cookie",
			},
			createdAt: "2026-07-01T00:00:00.000Z",
			derivedEndpointCount: 1,
			displayName: "Example",
			endpointTemplateKeys: ["GET api.example.test/items/{id}"],
			endpoints: [
				{
					exactKey: "GET api.example.test/items/123",
					host: "api.example.test",
					lastSeenAt: "2026-07-01T00:00:00.000Z",
					method: "GET",
					path: "/items/123",
					queryParams: [
						{
							name: "token",
							repeated: false,
							samples: 1,
							values: ["query-secret"],
						},
					],
					samples: 1,
					statuses: [200],
					template: "/items/{id}",
					templateKey: "GET api.example.test/items/{id}",
				},
			],
			host: "api.example.test",
			latestAuth: {
				label: "Latest auth ready",
				status: "ready",
				validation: { status: "not-checked" },
				valueCount: 1,
				values: [
					{
						capturedAt: "2026-07-01T00:00:00.000Z",
						credentialed: true,
						kind: "cookie",
						name: "session",
						replayable: true,
						source: "recording",
						type: "session-cookie",
						value: "session-secret",
					},
				],
			},
			origin: "https://api.example.test",
			recordingCount: 1,
			recordings: [],
			scannedEndpointCount: 1,
			scannedEndpointKeys: ["GET api.example.test/items/123"],
			status: "idle",
			updatedAt: "2026-07-01T00:00:00.000Z",
		} satisfies SiteProfile;
		const state = {
			activeDocumentation: null,
			activePage: {
				host: profile.host,
				origin: profile.origin,
				title: "Example",
				url: "https://api.example.test/items?token=url-secret",
			},
			activeRecording: null,
			bridge: {
				active: true,
				availability: "online",
				url: "http://localhost:4277",
			},
			capture: {
				entryCount: 0,
				recording: false,
				tabCount: 0,
				tabId: null,
			},
			diagnostics: [],
			profiles: { [profile.host]: profile },
			settings: { serverUrl: "http://localhost:4277" },
		} satisfies PopupState;

		const output = JSON.stringify(buildDebugSnapshot(state));

		expect(output).toContain("api.example.test");
		expect(output).not.toContain("session-secret");
		expect(output).not.toContain("query-secret");
		expect(output).not.toContain("url-secret");
		expect(output).not.toContain("/items/123");
	});
});
