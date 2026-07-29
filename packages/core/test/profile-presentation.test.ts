import { describe, expect, test } from "bun:test";
import {
	latestProfileNeedingRefinement,
	redactSiteProfile,
	type SiteProfile,
} from "../src/profiles";

const profile = (overrides: Partial<SiteProfile> = {}): SiteProfile =>
	({
		auth: {
			confidence: "low",
			credentialed: false,
			evidence: [],
			label: "No user auth",
			type: "none",
		},
		createdAt: "2026-07-01T00:00:00.000Z",
		derivedEndpointCount: 0,
		displayName: "www.example.test",
		endpointTemplateKeys: [],
		endpoints: [],
		host: "www.example.test",
		origin: "https://www.example.test",
		recordingCount: 0,
		recordings: [],
		scannedEndpointCount: 0,
		scannedEndpointKeys: [],
		status: "idle",
		updatedAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	}) as SiteProfile;

const pendingProfile = (host: string, updatedAt: string) =>
	profile({
		host,
		lastRecordingId: `${host}-recording`,
		recordings: [
			{
				auth: profile().auth,
				createdAt: updatedAt,
				derivedEndpointCount: 1,
				durationMs: 1,
				entryCount: 1,
				id: `${host}-recording`,
				methodBreakdown: { GET: 1 },
				processingStatus: "new",
				scannedEndpointCount: 1,
				sourceUrl: `https://${host}`,
			},
		],
		updatedAt,
	});

describe("profile presentation helpers", () => {
	test("selects the newest profile awaiting agent work", () => {
		const older = pendingProfile(
			"older.example.test",
			"2026-07-01T00:00:00.000Z",
		);
		const newer = pendingProfile(
			"newer.example.test",
			"2026-07-02T00:00:00.000Z",
		);

		expect(
			latestProfileNeedingRefinement({
				[older.host]: older,
				[newer.host]: newer,
			})?.host,
		).toBe(newer.host);
	});

	test("removes credential values from profile and recording auth", () => {
		const latestAuth = {
			label: "Latest auth ready",
			status: "ready" as const,
			validation: { status: "not-checked" as const },
			valueCount: 1,
			values: [
				{
					capturedAt: "2026-07-01T00:00:00.000Z",
					credentialed: true,
					kind: "cookie" as const,
					name: "session",
					replayable: true,
					source: "recording" as const,
					type: "session-cookie" as const,
					value: "top-secret",
				},
			],
		};
		const redacted = redactSiteProfile(
			profile({
				latestAuth,
				recordings: [
					{
						auth: profile().auth,
						createdAt: "2026-07-01T00:00:00.000Z",
						derivedEndpointCount: 1,
						durationMs: 1,
						entryCount: 1,
						id: "recording-1",
						latestAuth,
						methodBreakdown: { GET: 1 },
						processingStatus: "new",
						scannedEndpointCount: 1,
						sourceUrl: "https://www.example.test",
					},
				],
			}),
		);

		expect(JSON.stringify(redacted)).not.toContain("top-secret");
		expect(redacted.latestAuth?.values[0]).toMatchObject({
			name: "session",
			redacted: true,
		});
		expect(redacted.latestAuth?.values[0]).not.toHaveProperty("valuePreview");
		expect(redacted.recordings[0]?.latestAuth?.values[0]).toMatchObject({
			name: "session",
			redacted: true,
		});
		expect(redacted.recordings[0]?.latestAuth?.values[0]).not.toHaveProperty(
			"valuePreview",
		);
	});
});
