import { describe, expect, test } from "bun:test";
import { formatExecutedReplayResponse } from "../src/replay";

const response = {
	body: '{"ok":true,"count":2,"message":"done","missing":null}',
	headers: [
		["content-type", "application/json"],
		["x-replay", "ok"],
	] as [string, string][],
	status: 202,
	statusText: "Accepted",
};

describe("replay response formatting", () => {
	test("prints the response body only by default", () => {
		expect(formatExecutedReplayResponse(response)).toBe(
			[
				"{",
				'  "ok": true,',
				'  "count": 2,',
				'  "message": "done",',
				'  "missing": null',
				"}",
			].join("\n"),
		);
	});

	test("colorizes pretty-printed JSON responses when requested", () => {
		const output = formatExecutedReplayResponse(response, { color: true });

		expect(output).not.toContain("HTTP 202 Accepted");
		expect(output).toContain('\x1b[36m"ok"\x1b[0m: \x1b[35mtrue\x1b[0m');
		expect(output).toContain('\x1b[36m"count"\x1b[0m: \x1b[33m2\x1b[0m');
		expect(output).toContain('\x1b[36m"message"\x1b[0m: \x1b[32m"done"\x1b[0m');
		expect(output).toContain('\x1b[36m"missing"\x1b[0m: \x1b[2mnull\x1b[0m');
	});

	test("prints request and response metadata in verbose mode", () => {
		const output = formatExecutedReplayResponse(response, {
			request: {
				body: '{"hello":"world"}',
				headers: [
					{
						name: "Content-Type",
						redacted: false,
						secret: false,
						value: "application/json",
					},
					{
						name: "Cookie",
						redacted: false,
						secret: true,
						value: "session=test-session",
					},
				],
				method: "POST",
				url: "https://api.example.test/api/replay",
			},
			verbose: true,
		});

		expect(output).toBe(
			[
				"Request",
				"POST https://api.example.test/api/replay",
				"Content-Type: application/json",
				"Cookie: <redacted>",
				"",
				"{",
				'  "hello": "<redacted>"',
				"}",
				"",
				"Response",
				"HTTP 202 Accepted",
				"content-type: application/json",
				"x-replay: ok",
				"",
				"{",
				'  "ok": true,',
				'  "count": 2,',
				'  "message": "done",',
				'  "missing": null',
				"}",
			].join("\n"),
		);
	});
});
