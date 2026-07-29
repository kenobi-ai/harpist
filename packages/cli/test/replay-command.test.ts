import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executeReplayBundle,
	formatExecutedReplayResponse,
} from "../src/replay";
import { runCliWithEnv, seedReplayFixture } from "./replay-command-fixture";

describe("auth replay command", () => {
	test("requires a host outside an interactive terminal", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const result = await runCliWithEnv(["auth", "replay"], {
				HARPIST_DATA_DIR: join(directory, "data"),
			});

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("Missing host");
			expect(result.stderr).toContain("choose a site");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("executor sends captured request details", async () => {
		let capturedRequest:
			| {
					body?: unknown;
					contentType: string | null;
					cookie: string | null;
					csrf: string | null;
					method?: string;
					redirect?: RequestRedirect;
					url: string;
			  }
			| undefined;
		const response = await executeReplayBundle(
			{
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
					{
						name: "X-CSRF-Token",
						redacted: false,
						secret: true,
						value: "csrf-123",
					},
				],
				method: "POST",
				url: "https://api.example.test/api/replay",
			},
			{
				fetch: async (url, init) => {
					const headers = init.headers as Headers;
					capturedRequest = {
						body: init.body,
						contentType: headers.get("content-type"),
						cookie: headers.get("cookie"),
						csrf: headers.get("x-csrf-token"),
						method: init.method,
						redirect: init.redirect,
						url,
					};
					return new Response('{"ok":true}', {
						headers: {
							"Content-Type": "application/json",
							"X-Replay": "ok",
						},
						status: 202,
						statusText: "Accepted",
					});
				},
			},
		);

		expect(capturedRequest).toEqual({
			body: '{"hello":"world"}',
			contentType: "application/json",
			cookie: "session=test-session",
			csrf: "csrf-123",
			method: "POST",
			redirect: "manual",
			url: "https://api.example.test/api/replay",
		});
		expect(formatExecutedReplayResponse(response)).toBe(
			["{", '  "ok": true', "}"].join("\n"),
		);
	});

	test("prints curl without executing it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const origin = "https://api.example.test";
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				origin,
			});

			const result = await runCliWithEnv(["auth", "replay", host, "--curl"], {
				HARPIST_DATA_DIR: join(directory, "data"),
			});

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("curl -i -X 'POST'");
			expect(result.stdout).toContain(`'${origin}/api/replay'`);
			expect(result.stdout).toContain("-H 'Cookie: session=test-session'");
			expect(result.stdout).toContain('--data-raw \'{"hello":"world"}\'');
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("redacts auth, path, query, and body values from review output", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				operationName: "createReplay",
				origin: "https://api.example.test",
				path: "/api/replay/123?token=query-secret&view=private",
			});

			const result = await runCliWithEnv(
				["auth", "replay", host, "createReplay", "--redacted-curl"],
				{ HARPIST_DATA_DIR: join(directory, "data") },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("<redacted>");
			expect(result.stdout).not.toContain("test-session");
			expect(result.stdout).not.toContain("csrf-123");
			expect(result.stdout).not.toContain("query-secret");
			expect(result.stdout).not.toContain("private");
			expect(result.stdout).not.toContain('"hello":"world"');
			expect(result.stdout).not.toContain("/123");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("rejects ambiguous replay options", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				origin: "https://api.example.test",
			});
			const environment = {
				HARPIST_DATA_DIR: join(directory, "data"),
			};
			const [output, input] = await Promise.all([
				runCliWithEnv(
					["auth", "replay", host, "--curl", "--redacted-curl"],
					environment,
				),
				runCliWithEnv(
					[
						"auth",
						"replay",
						host,
						"--json",
						'{"query":{"page":1}}',
						"--query",
						"page=2",
					],
					environment,
				),
			]);

			expect(output.exitCode).toBe(1);
			expect(output.stderr).toContain("only one");
			expect(input.exitCode).toBe(1);
			expect(input.stderr).toContain("cannot be combined");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("does not silently execute captured input when interactive input is unavailable", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				operationName: "createReplay",
				origin: "https://api.example.test",
				path: "/api/replay?sort=old",
			});

			const result = await runCliWithEnv(
				["auth", "replay", host, "createReplay"],
				{ HARPIST_DATA_DIR: join(directory, "data") },
			);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("Interactive replay requires a TTY");
			expect(result.stderr).toContain("--query");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("requires explicit approval for a non-interactive mutation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				operationName: "createReplay",
				origin: "https://api.example.test",
			});

			const result = await runCliWithEnv(
				["auth", "replay", host, "createReplay", "--no-interactive"],
				{ HARPIST_DATA_DIR: join(directory, "data") },
			);

			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("Refusing to send POST");
			expect(result.stderr).toContain("--redacted-curl");
			expect(result.stderr).toContain("--yes");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("accepts operation input as flags", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const origin = "https://api.example.test";
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				operationName: "createReplay",
				origin,
				path: "/api/replay/123?sort=old",
			});

			const result = await runCliWithEnv(
				[
					"auth",
					"replay",
					host,
					"createReplay",
					"--param",
					"id=456",
					"--query",
					"sort=new",
					"--query",
					"limit=10",
					"--body",
					'{"hello":"there"}',
					"--curl",
				],
				{ HARPIST_DATA_DIR: join(directory, "data") },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain("curl -i -X 'POST'");
			expect(result.stdout).toContain(
				"'https://api.example.test/api/replay/456?sort=new&limit=10'",
			);
			expect(result.stdout).toContain("-H 'Content-Type: application/json'");
			expect(result.stdout).toContain('--data-raw \'{"hello":"there"}\'');
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("accepts operation input as JSON", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		try {
			const origin = "https://api.example.test";
			const { host } = await seedReplayFixture({
				dataDir: join(directory, "data"),
				operationName: "createReplay",
				origin,
				path: "/api/replay/123?sort=old",
			});

			const result = await runCliWithEnv(
				[
					"auth",
					"replay",
					host,
					"createReplay",
					"--json",
					JSON.stringify({
						body: { hello: "json" },
						params: { id: "789" },
						query: { include: ["a", "b"], sort: "json" },
					}),
					"--curl",
				],
				{ HARPIST_DATA_DIR: join(directory, "data") },
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
			expect(result.stdout).toContain(
				"'https://api.example.test/api/replay/789?include=a&include=b&sort=json'",
			);
			expect(result.stdout).toContain('--data-raw \'{"hello":"json"}\'');
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});
});
