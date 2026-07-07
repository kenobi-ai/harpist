import { describe, expect, test } from "bun:test";
import {
	type AuthLedger,
	credentialSetFromLatestAuth,
	credentialSetStatus,
	redactAuthLedger,
	syncLedgerWithProfile,
} from "../src/credentials";
import type { LatestAuth, LatestAuthValue } from "../src/profiles";

const value = (overrides: Partial<LatestAuthValue> = {}): LatestAuthValue => ({
	capturedAt: "2026-07-03T12:00:00.000Z",
	credentialed: true,
	kind: "cookie",
	name: "session",
	replayable: true,
	source: "recording",
	type: "browser-session",
	value: "session-value",
	...overrides,
});

const latestAuth = (
	values: LatestAuthValue[],
	overrides: Partial<LatestAuth> = {},
): LatestAuth => ({
	label: "Latest auth ready",
	recordingId: "rec-1",
	status: "ready",
	validation: { status: "not-checked" },
	valueCount: values.length,
	values,
	...overrides,
});

describe("credentialSetFromLatestAuth", () => {
	test("groups one recording's values into a single generation", () => {
		const set = credentialSetFromLatestAuth(
			"api.example.test",
			latestAuth([
				value(),
				value({
					kind: "header",
					name: "x-api-key",
					type: "api-key",
					value: "key-123",
				}),
				value({
					credentialed: false,
					kind: "header",
					name: "x-csrf-token",
					type: "csrf-token",
					value: "csrf-123",
				}),
			]),
		);

		expect(set).not.toBeNull();
		expect(set?.kinds).toEqual(["browser-session", "api-key", "csrf-token"]);
		expect(set?.label).toBe("Browser session + API key");
		expect(set?.credentialed).toBe(true);
		expect(set?.recordingId).toBe("rec-1");
		expect(set?.id).toMatch(/^cred_[0-9a-f]{12}$/);
	});

	test("dedupes the same cookie captured with and without domain metadata", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([
				value({ host: "www.example.test" }),
				value({
					domain: ".example.test",
					expiresAt: "2026-07-05T12:00:00.000Z",
				}),
			]),
		);

		expect(set?.values).toHaveLength(1);
		expect(set?.values[0]?.domain).toBe(".example.test");
		expect(set?.expiresAt).toBe("2026-07-05T12:00:00.000Z");
	});

	test("keeps same-name cookies whose values differ", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([
				value({ value: "one" }),
				value({ domain: ".example.test", value: "two" }),
			]),
		);

		expect(set?.values).toHaveLength(2);
	});

	test("produces a stable id for the same credential material", () => {
		const first = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value()]),
		);
		const second = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value({ capturedAt: "2026-07-04T09:00:00.000Z" })], {
				recordingId: "rec-2",
			}),
		);
		const different = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value({ value: "rotated" })]),
		);

		expect(first?.id).toBe(second?.id ?? "");
		expect(first?.id).not.toBe(different?.id ?? "");
	});

	test("returns null when nothing replayable was captured", () => {
		expect(
			credentialSetFromLatestAuth("www.example.test", latestAuth([])),
		).toBeNull();
		expect(
			credentialSetFromLatestAuth("www.example.test", undefined),
		).toBeNull();
	});
});

describe("credentialSetStatus", () => {
	const now = Date.parse("2026-07-07T12:00:00.000Z");

	test("is ready without expiry or validation signals", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value()]),
		);
		expect(set && credentialSetStatus(set, now)).toBe("ready");
	});

	test("expires when every expiring credentialed value is past", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([
				value({ expiresAt: "2026-07-06T12:00:00.000Z" }),
				value({
					credentialed: false,
					expiresAt: "2027-01-01T00:00:00.000Z",
					name: "consent",
				}),
			]),
		);
		expect(set && credentialSetStatus(set, now)).toBe("expired");
	});

	test("an invalid replay check wins over everything", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value()]),
		);
		expect(
			set &&
				credentialSetStatus(
					{
						...set,
						validation: {
							checkedAt: "2026-07-07T11:00:00.000Z",
							result: "invalid",
							statusCode: 401,
						},
					},
					now,
				),
		).toBe("invalid");
	});

	test("a valid check after expiry trusts the check", () => {
		const set = credentialSetFromLatestAuth(
			"www.example.test",
			latestAuth([value({ expiresAt: "2026-07-06T12:00:00.000Z" })]),
		);
		expect(
			set &&
				credentialSetStatus(
					{
						...set,
						validation: {
							checkedAt: "2026-07-07T11:00:00.000Z",
							result: "valid",
							statusCode: 200,
						},
					},
					now,
				),
		).toBe("valid");
	});
});

describe("syncLedgerWithProfile", () => {
	const profileWith = (auths: (LatestAuth | undefined)[]) => ({
		host: "www.example.test",
		latestAuth: auths[0],
		recordings: auths.slice(1).map((auth, index) => ({
			auth: {
				confidence: "high" as const,
				evidence: [],
				label: "Browser session",
			},
			createdAt: `2026-07-0${index + 1}T00:00:00.000Z`,
			derivedEndpointCount: 0,
			durationMs: 0,
			entryCount: 0,
			id: `rec-${index + 2}`,
			latestAuth: auth,
			methodBreakdown: {},
			scannedEndpointCount: 0,
			sourceUrl: "https://www.example.test",
		})),
	});

	test("accumulates distinct generations and dedupes repeats", () => {
		const generationA = latestAuth([value({ value: "gen-a" })]);
		const generationB = latestAuth([value({ value: "gen-b" })], {
			recordingId: "rec-2",
		});
		const { changed, ledger } = syncLedgerWithProfile(
			null,
			profileWith([generationA, generationB, generationA]),
			{ now: "2026-07-07T00:00:00.000Z" },
		);

		expect(changed).toBe(true);
		expect(ledger.sets).toHaveLength(2);
		expect(ledger.version).toBe(1);
	});

	test("preserves validation results across resyncs", () => {
		const generation = latestAuth([value()]);
		const first = syncLedgerWithProfile(null, profileWith([generation]), {
			now: "2026-07-07T00:00:00.000Z",
		});
		const withValidation: AuthLedger = {
			...first.ledger,
			sets: first.ledger.sets.map((set) => ({
				...set,
				validation: {
					checkedAt: "2026-07-07T01:00:00.000Z",
					result: "valid" as const,
					statusCode: 200,
				},
			})),
		};

		const second = syncLedgerWithProfile(
			withValidation,
			profileWith([generation]),
			{ now: "2026-07-07T02:00:00.000Z" },
		);

		expect(second.changed).toBe(false);
		expect(second.ledger.sets[0]?.validation?.result).toBe("valid");
		expect(second.ledger.updatedAt).toBe(withValidation.updatedAt);
	});

	test("keeps active pin and login url", () => {
		const first = syncLedgerWithProfile(
			null,
			profileWith([latestAuth([value()])]),
			{ now: "2026-07-07T00:00:00.000Z" },
		);
		const pinned: AuthLedger = {
			...first.ledger,
			activeCredentialId: first.ledger.sets[0]?.id,
			loginUrl: "https://www.example.test/login",
		};
		const second = syncLedgerWithProfile(
			pinned,
			profileWith([latestAuth([value()])]),
			{ now: "2026-07-07T01:00:00.000Z" },
		);

		expect(second.ledger.activeCredentialId).toBe(pinned.activeCredentialId);
		expect(second.ledger.loginUrl).toBe("https://www.example.test/login");
	});
});

describe("redactAuthLedger", () => {
	test("strips raw values and computes per-set status", () => {
		const { ledger } = syncLedgerWithProfile(
			null,
			{
				host: "www.example.test",
				latestAuth: latestAuth([value({ value: "super-secret-session" })]),
				recordings: [],
			},
			{ now: "2026-07-07T00:00:00.000Z" },
		);
		const redacted = redactAuthLedger(ledger);

		expect(redacted.sets[0]?.status).toBe("ready");
		expect(redacted.sets[0]?.redacted).toBe(true);
		expect(JSON.stringify(redacted)).not.toContain("super-secret-session");
		expect(redacted.sets[0]?.values[0]?.valuePreview).toBe("supe...sion");
	});
});
