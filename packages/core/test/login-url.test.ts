import { describe, expect, test } from "bun:test";
import type { PendingEntry } from "../src/har";
import { captureAutoStopSignal, inferLoginUrl } from "../src/login-url";

const entry = (overrides: Partial<PendingEntry> = {}): PendingEntry => ({
	method: "GET",
	requestHeaders: {},
	startedDateTime: "2026-07-03T12:00:00.000Z",
	url: "https://www.example.test/",
	...overrides,
});

describe("inferLoginUrl", () => {
	test("prefers the referer of the request granted a session cookie", () => {
		const url = inferLoginUrl(
			[
				entry({
					method: "POST",
					requestHeaders: {
						Referer: "https://www.example.test/account/signin?next=/dash",
					},
					responseHeaders: {
						"Set-Cookie": "session=abc123; Path=/; HttpOnly",
					},
					url: "https://www.example.test/api/login",
				}),
			],
			"www.example.test",
		);

		expect(url).toBe("https://www.example.test/account/signin?next=/dash");
	});

	test("ignores cross-site referers", () => {
		const url = inferLoginUrl(
			[
				entry({
					method: "POST",
					requestHeaders: { Referer: "https://accounts.other.test/login" },
					responseHeaders: { "Set-Cookie": "sid=abc; Path=/" },
					url: "https://www.example.test/api/session",
				}),
			],
			"www.example.test",
		);

		expect(url).toBeUndefined();
	});

	test("falls back to a same-site HTML page with a login path", () => {
		const url = inferLoginUrl(
			[
				entry({
					responseMime: "text/html",
					status: 200,
					url: "https://www.example.test/login",
				}),
				entry({ url: "https://www.example.test/api/items" }),
			],
			"www.example.test",
		);

		expect(url).toBe("https://www.example.test/login");
	});

	test("returns undefined when nothing login-like was recorded", () => {
		expect(
			inferLoginUrl(
				[entry({ url: "https://www.example.test/api/items" })],
				"www.example.test",
			),
		).toBeUndefined();
	});
});

describe("captureAutoStopSignal", () => {
	const grantEntry = entry({
		method: "POST",
		responseHeaders: { "Set-Cookie": "session=fresh; Path=/; HttpOnly" },
		startedDateTime: "2026-07-07T12:00:10.000Z",
		status: 200,
		url: "https://auth.example.test/api/login",
	});

	test("stays unsatisfied before a session cookie is granted", () => {
		const signal = captureAutoStopSignal(
			[entry({ status: 200, url: "https://www.example.test/login" })],
			"www.example.test",
		);
		expect(signal.satisfied).toBe(false);
	});

	test("stays unsatisfied until a same-site 2xx follows the grant", () => {
		const signal = captureAutoStopSignal([grantEntry], "www.example.test");
		expect(signal.satisfied).toBe(false);
		expect(signal.grantAt).toBe("2026-07-07T12:00:10.000Z");
	});

	test("satisfied once a post-login same-site request completes", () => {
		const signal = captureAutoStopSignal(
			[
				grantEntry,
				entry({
					startedDateTime: "2026-07-07T12:00:12.000Z",
					status: 200,
					url: "https://www.example.test/api/me",
				}),
			],
			"www.example.test",
		);
		expect(signal.satisfied).toBe(true);
	});

	test("cross-site follow-ups do not satisfy the signal", () => {
		const signal = captureAutoStopSignal(
			[
				grantEntry,
				entry({
					startedDateTime: "2026-07-07T12:00:12.000Z",
					status: 200,
					url: "https://cdn.other.test/analytics",
				}),
			],
			"www.example.test",
		);
		expect(signal.satisfied).toBe(false);
	});
});
