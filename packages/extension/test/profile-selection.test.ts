import { describe, expect, test } from "bun:test";
import type { SiteProfile } from "@harpist/core/profiles";
import { selectPopupProfile } from "../lib/profile-selection";

const profile = (
	host: string,
	overrides: Partial<SiteProfile> = {},
): SiteProfile => ({
	auth: {
		confidence: "low",
		credentialed: false,
		evidence: [],
		label: "No user auth",
		type: "none",
	},
	createdAt: "2026-07-01T00:00:00.000Z",
	derivedEndpointCount: 0,
	displayName: host,
	endpointTemplateKeys: [],
	endpoints: [],
	host,
	origin: `https://${host}`,
	recordingCount: 0,
	recordings: [],
	scannedEndpointCount: 0,
	scannedEndpointKeys: [],
	status: "idle",
	updatedAt: "2026-07-01T00:00:00.000Z",
	...overrides,
});

const pendingProfile = (host: string): SiteProfile => {
	const recordingId = `${host}-recording`;
	return profile(host, {
		lastRecordingId: recordingId,
		recordingCount: 1,
		recordings: [
			{
				auth: profile(host).auth,
				createdAt: "2026-07-02T00:00:00.000Z",
				derivedEndpointCount: 1,
				durationMs: 1,
				entryCount: 1,
				id: recordingId,
				methodBreakdown: { GET: 1 },
				processingStatus: "new",
				scannedEndpointCount: 1,
				sourceUrl: `https://${host}`,
			},
		],
		updatedAt: "2026-07-02T00:00:00.000Z",
	});
};

describe("popup profile selection", () => {
	test("keeps the active site's profile ahead of an unrelated pending profile", () => {
		const trainline = profile("www.thetrainline.com");
		const sheets = pendingProfile("docs.google.com");

		expect(
			selectPopupProfile({
				activeHost: trainline.host,
				profiles: {
					[trainline.host]: trainline,
					[sheets.host]: sheets,
				},
			})?.host,
		).toBe(trainline.host);
	});

	test("keeps explicit documentation context ahead of the active site", () => {
		const trainline = profile("www.thetrainline.com");
		const sheets = profile("docs.google.com");

		expect(
			selectPopupProfile({
				activeHost: trainline.host,
				documentationHost: sheets.host,
				profiles: {
					[trainline.host]: trainline,
					[sheets.host]: sheets,
				},
			})?.host,
		).toBe(sheets.host);
	});

	test("falls back to a pending profile when the active site has none", () => {
		const sheets = pendingProfile("docs.google.com");

		expect(
			selectPopupProfile({
				activeHost: "www.thetrainline.com",
				profiles: { [sheets.host]: sheets },
			})?.host,
		).toBe(sheets.host);
	});
});
