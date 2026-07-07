import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialSetStatus } from "../../core/src/credentials";
import type { PendingEntry } from "../../core/src/har";
import { buildHar } from "../../core/src/har";
import { runAuthCheckCommand } from "../src/auth-commands";
import { createBridgeStore } from "../src/store";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const origin = "https://www.example.test";
const host = "www.example.test";

const runCli = async (args: string[], dataDir: string) => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "packages/cli/src/cli.ts", ...args],
		cwd: workspaceRoot,
		env: {
			...process.env,
			HARPIST_DATA_DIR: dataDir,
			NO_COLOR: "1",
		},
		stderr: "pipe",
		stdout: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stderr, stdout: stdout.trim() };
};

const apiEntry = (overrides: Partial<PendingEntry> = {}): PendingEntry => ({
	body: '{"ok":true}',
	method: "GET",
	requestHeaders: {
		Accept: "application/json",
		Cookie: "session=alpha-session",
		"X-Auth-Token": "key-alpha",
	},
	responseHeaders: { "Content-Type": "application/json" },
	responseMime: "application/json",
	startedDateTime: "2026-07-03T12:00:00.000Z",
	status: 200,
	statusText: "OK",
	url: `${origin}/api/items`,
	...overrides,
});

const seed = async (dataDir: string) => {
	const store = createBridgeStore(dataDir);
	await store.ingestRecording({
		bridgeUrl: "http://127.0.0.1:4277",
		har: buildHar([apiEntry()]),
		meta: {
			host,
			origin,
			startedAt: "2026-07-03T12:00:00.000Z",
			tabId: 1,
			title: "Auth fixture",
			url: origin,
		},
	});
	await store.ingestRecording({
		bridgeUrl: "http://127.0.0.1:4277",
		har: buildHar([
			apiEntry({
				requestHeaders: {
					Accept: "application/json",
					Cookie: "session=beta-session",
					"X-Auth-Token": "key-beta",
				},
				startedDateTime: "2026-07-04T12:00:00.000Z",
			}),
		]),
		meta: {
			host,
			origin,
			startedAt: "2026-07-04T12:00:00.000Z",
			tabId: 1,
			title: "Auth fixture",
			url: origin,
		},
	});
	return store;
};

describe("auth commands", () => {
	let directory: string;
	let dataDir: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "harpist-auth-cmd-"));
		dataDir = join(directory, "data");
	});

	afterEach(async () => {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	});

	test("auth list shows both generations without leaking secrets", async () => {
		await seed(dataDir);
		const result = await runCli(["auth", "list", host], dataDir);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(host);
		expect(result.stdout).toContain("Browser session + API key");
		expect(result.stdout.match(/cred_[0-9a-f]{12}/g)?.length).toBe(2);
		expect(result.stdout).not.toContain("beta-session");
		expect(result.stdout).not.toContain("key-alpha");
	});

	test("auth list --json emits a redacted ledger", async () => {
		await seed(dataDir);
		const result = await runCli(["auth", "list", host, "--json"], dataDir);

		expect(result.exitCode).toBe(0);
		const ledger = JSON.parse(result.stdout) as {
			sets: { redacted: boolean; status: string }[];
		};
		expect(ledger.sets).toHaveLength(2);
		expect(ledger.sets[0]?.redacted).toBe(true);
		expect(result.stdout).not.toContain("alpha-session");
	});

	test("auth use pins a credential and replay --auth selects one", async () => {
		const store = await seed(dataDir);
		const ledger = await store.getAuthLedger(host);
		const older = ledger.sets[1];
		expect(older).toBeDefined();

		const use = await runCli(["auth", "use", host, older?.id ?? ""], dataDir);
		expect(use.exitCode).toBe(0);
		expect(use.stdout).toContain(`Pinned ${older?.id}`);

		const list = await runCli(["auth", "list", host], dataDir);
		expect(list.stdout).toContain(`● ${older?.id}`);

		const curl = await runCli(
			[
				"auth",
				"replay",
				host,
				`GET ${host}/api/items`,
				"--auth",
				older?.id ?? "",
				"--curl",
				"--no-interactive",
			],
			dataDir,
		);
		expect(curl.exitCode).toBe(0);
		expect(curl.stdout).toContain("session=alpha-session");
		expect(curl.stdout).not.toContain("beta-session");
	});

	test("pinned credentials become the replay default", async () => {
		const store = await seed(dataDir);
		const ledger = await store.getAuthLedger(host);
		const older = ledger.sets[1];
		await store.setActiveCredential(host, older?.id ?? "");

		const curl = await runCli(
			[
				"auth",
				"replay",
				host,
				`GET ${host}/api/items`,
				"--curl",
				"--no-interactive",
			],
			dataDir,
		);
		expect(curl.stdout).toContain("session=alpha-session");
	});

	test("auth check probes a GET endpoint and records validation", async () => {
		const store = await seed(dataDir);

		await runAuthCheckCommand(store, [host, "--all"], {
			fetch: async () => ({
				headers: new Headers({ "content-type": "application/json" }),
				status: 401,
				statusText: "Unauthorized",
				text: () => Promise.resolve('{"error":"expired"}'),
			}),
		});

		expect(process.exitCode).toBe(1);
		process.exitCode = 0;
		const ledger = await store.getAuthLedger(host);
		expect(ledger.sets.every((set) => set.validation?.statusCode === 401)).toBe(
			true,
		);
	});

	test("auth login --no-wait prints instructions without waiting", async () => {
		await seed(dataDir);
		const result = await runCli(
			["auth", "login", host, "--no-open", "--no-wait"],
			dataDir,
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(`Opening ${origin}`);
		expect(result.stdout).toContain("start a recording");
	});

	test("a live 401 replay marks the credential invalid end to end", async () => {
		const server = Bun.serve({
			fetch: () =>
				new Response('{"error":"unauthorized"}', {
					headers: { "content-type": "application/json" },
					status: 401,
				}),
			hostname: "127.0.0.1",
			port: 0,
		});
		try {
			const liveOrigin = `http://127.0.0.1:${server.port}`;
			const liveHost = new URL(liveOrigin).host;
			const store = createBridgeStore(dataDir);
			await store.ingestRecording({
				bridgeUrl: "http://127.0.0.1:4277",
				har: buildHar([apiEntry({ url: `${liveOrigin}/api/items` })]),
				meta: {
					host: liveHost,
					origin: liveOrigin,
					startedAt: "2026-07-03T12:00:00.000Z",
					tabId: 1,
					title: "Live fixture",
					url: liveOrigin,
				},
			});

			const result = await runCli(
				[
					"auth",
					"replay",
					liveHost,
					`GET ${liveHost}/api/items`,
					"--no-interactive",
				],
				dataDir,
			);

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toContain("auth login");
			const ledger = await store.getAuthLedger(liveHost);
			const set = ledger.sets[0];
			expect(set?.validation?.statusCode).toBe(401);
			expect(set && credentialSetStatus(set)).toBe("invalid");
		} finally {
			server.stop(true);
		}
	});

	test("auth set-login-url persists and login honours it", async () => {
		await seed(dataDir);
		const set = await runCli(
			["auth", "set-login-url", host, `${origin}/account/signin`],
			dataDir,
		);
		expect(set.exitCode).toBe(0);

		const login = await runCli(
			["auth", "login", host, "--no-open", "--no-wait"],
			dataDir,
		);
		expect(login.stdout).toContain(`Opening ${origin}/account/signin`);
	});

	test("prompting commands error cleanly without a TTY", async () => {
		await seed(dataDir);

		const use = await runCli(["auth", "use"], dataDir);
		expect(use.exitCode).toBe(1);
		expect(use.stderr).toContain("Missing host");
		expect(use.stderr).toContain("harpist auth use");

		const login = await runCli(["auth", "login"], dataDir);
		expect(login.exitCode).toBe(1);
		expect(login.stderr).toContain("Missing host");

		const check = await runCli(["auth", "check"], dataDir);
		expect(check.exitCode).toBe(1);
		expect(check.stderr).toContain("Missing host");
	});

	test("auth use resolves a bare credential id against a prompted or single host", async () => {
		const store = await seed(dataDir);
		const ledger = await store.getAuthLedger(host);
		const older = ledger.sets[1];

		const result = await runCli(["auth", "use", older?.id ?? ""], dataDir);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Missing host");
	});
});
