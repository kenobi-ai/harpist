import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHar } from "../../core/src/har";
import {
	executeReplayBundle,
	formatExecutedReplayResponse,
} from "../src/replay";
import { createBridgeStore } from "../src/store";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

type CliRun = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

type CliArgs = string | string[];

const cliArgs = (arg: CliArgs) => (Array.isArray(arg) ? arg : arg.split(" "));

const runCli = async (arg: CliArgs): Promise<CliRun> => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "packages/cli/src/cli.ts", ...cliArgs(arg)],
		cwd: workspaceRoot,
		stderr: "pipe",
		stdout: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return {
		exitCode,
		stderr,
		stdout: stdout.trim(),
	};
};

const runCliWithEnv = async (
	arg: CliArgs,
	env: Record<string, string>,
): Promise<CliRun> => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "packages/cli/src/cli.ts", ...cliArgs(arg)],
		cwd: workspaceRoot,
		env: {
			...process.env,
			...env,
		},
		stderr: "pipe",
		stdout: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return {
		exitCode,
		stderr,
		stdout: stdout.trim(),
	};
};

const exists = async (path: string) => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const seedReplayFixture = async (input: {
	dataDir: string;
	origin: string;
}) => {
	const store = createBridgeStore(input.dataDir);
	const host = new URL(input.origin).host;
	const capturedAt = "2026-07-03T12:00:00.000Z";
	await store.ingestRecording({
		bridgeUrl: "http://127.0.0.1:4277",
		har: buildHar([
			{
				body: '{"captured":true}',
				method: "POST",
				postData: '{"hello":"world"}',
				postDataMime: "application/json",
				requestHeaders: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Cookie: "session=test-session",
					"X-CSRF-Token": "csrf-123",
				},
				responseHeaders: {
					"Content-Type": "application/json",
				},
				responseMime: "application/json",
				startedDateTime: capturedAt,
				status: 200,
				statusText: "OK",
				url: `${input.origin}/api/replay`,
			},
		]),
		meta: {
			host,
			origin: input.origin,
			startedAt: capturedAt,
			tabId: 1,
			title: "Replay fixture",
			url: input.origin,
		},
	});
	return { host };
};

describe("cli", () => {
	test("prints package version", async () => {
		const packageJson = JSON.parse(
			await readFile(new URL("../package.json", import.meta.url), "utf8"),
		) as { version: string };

		for (const arg of ["version", "--version", "-v"]) {
			expect(await runCli(arg)).toEqual({
				exitCode: 0,
				stderr: "",
				stdout: packageJson.version,
			});
		}
	});

	test("auth replay executor sends captured request details", async () => {
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
			[
				"HTTP 202 Accepted",
				"content-type: application/json",
				"x-replay: ok",
				"",
				'{"ok":true}',
			].join("\n"),
		);
	});

	test("auth replay --curl prints curl without executing it", async () => {
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

	test("prints purge command and home data dir default in help", async () => {
		const result = await runCli("help");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("harpist purge");
		expect(result.stdout).toContain(
			"HARPIST_DATA_DIR  default ~/.harpist-data",
		);
	});

	test("purges the configured data dir", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		const dataDir = join(directory, "data");
		try {
			await mkdir(dataDir, { recursive: true });
			await writeFile(join(dataDir, "profiles.json"), "{}", "utf8");

			const result = await runCliWithEnv("purge", {
				HARPIST_DATA_DIR: dataDir,
			});

			expect(result).toEqual({
				exitCode: 0,
				stderr: "",
				stdout: `Purged Harpist data dir: ${dataDir}`,
			});
			expect(await exists(dataDir)).toBe(false);
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});
});
