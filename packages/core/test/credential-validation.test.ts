import { describe, expect, test } from "bun:test";
import { credentialValidationFromResponse } from "../src/credential-validation";

describe("credentialValidationFromResponse", () => {
	const checkedAt = "2026-07-07T12:00:00.000Z";

	test("401 and 403 mark credentials invalid", () => {
		const validation = credentialValidationFromResponse(
			{ body: "", headers: [], status: 401 },
			{ checkedAt },
		);
		expect(validation?.result).toBe("invalid");
		expect(validation?.statusCode).toBe(401);
	});

	test("2xx JSON marks credentials valid", () => {
		const validation = credentialValidationFromResponse(
			{
				body: '{"ok":true}',
				headers: [["content-type", "application/json"]],
				status: 200,
			},
			{ checkedAt },
		);
		expect(validation?.result).toBe("valid");
	});

	test("redirects to a login page mark credentials invalid", () => {
		const validation = credentialValidationFromResponse(
			{
				body: "",
				headers: [["location", "https://www.example.test/login?next=/api"]],
				status: 302,
			},
			{ checkedAt },
		);
		expect(validation?.result).toBe("invalid");
	});

	test("other redirects and server errors are inconclusive", () => {
		expect(
			credentialValidationFromResponse(
				{
					body: "",
					headers: [["location", "https://www.example.test/api/v2"]],
					status: 308,
				},
				{ checkedAt },
			),
		).toBeNull();
		expect(
			credentialValidationFromResponse(
				{ body: "", headers: [], status: 503 },
				{ checkedAt },
			),
		).toBeNull();
	});

	test("a 200 HTML login page is inconclusive rather than valid", () => {
		expect(
			credentialValidationFromResponse(
				{
					body: '<html><form><input type="password" /></form></html>',
					headers: [["content-type", "text/html"]],
					status: 200,
				},
				{ checkedAt },
			),
		).toBeNull();
	});
});
