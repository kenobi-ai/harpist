import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PendingEntry } from "../../core/src/har";
import { buildHar } from "../../core/src/har";
import { runAuthLoginCommand } from "../src/auth-login-command";
import { createBridgeStore } from "../src/store";

const origin = "https://www.example.test";
const host = "www.example.test";

const apiEntry = (): PendingEntry => ({
	body: '{"ok":true}',
	method: "GET",
	requestHeaders: {
		Accept: "application/json",
		Cookie: "session=alpha-session",
	},
	responseHeaders: { "Content-Type": "application/json" },
	responseMime: "application/json",
	startedDateTime: "2026-07-03T12:00:00.000Z",
	status: 200,
	statusText: "OK",
	url: `${origin}/api/items`,
});

describe("auth login extension race", () => {
	let directory: string;
	let store: ReturnType<typeof createBridgeStore>;
	let bridge: ReturnType<typeof Bun.serve>;
	let bridgeUrl: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "harpist-login-race-"));
		store = createBridgeStore(join(directory, "data"));
		await store.ingestRecording({
			bridgeUrl: "http://127.0.0.1:4277",
			har: buildHar([apiEntry()]),
			meta: {
				host,
				origin,
				startedAt: "2026-07-03T12:00:00.000Z",
				tabId: 1,
				title: "Race fixture",
				url: origin,
			},
		});
		bridge = Bun.serve({
			fetch: () => new Response("{}", { status: 200 }),
			hostname: "127.0.0.1",
			port: 0,
		});
		bridgeUrl = `http://127.0.0.1:${bridge.port}`;
	});

	afterEach(async () => {
		bridge?.stop(true);
		await rm(directory, {
			force: true,
			recursive: true,
		});
	});

	test("wakes the extension and skips the direct open once claimed", async () => {
		await store.recordExtensionPresence("ext-abc");
		const opened: string[] = [];
		let claimInFlight = Promise.resolve();
		const claimer = setInterval(() => {
			claimInFlight = claimInFlight.then(async () => {
				await store.commands.pull("ext-abc");
			});
		}, 100);

		try {
			await runAuthLoginCommand(store, [host, "--no-wait"], {
				bridgeUrl,
				claimWaitMs: 2_000,
				openUrl: (url) => opened.push(url),
			});
		} finally {
			clearInterval(claimer);
			await claimInFlight;
		}

		expect(opened).toEqual([`${bridgeUrl}/wake`]);
	});

	test("falls back to a direct open and expires the command when unclaimed", async () => {
		await store.recordExtensionPresence("ext-abc");
		const opened: string[] = [];

		await runAuthLoginCommand(store, [host, "--no-wait"], {
			bridgeUrl,
			claimWaitMs: 500,
			openUrl: (url) => opened.push(url),
		});

		expect(opened).toEqual([`${bridgeUrl}/wake`, origin]);
		expect(await store.commands.pull("late-extension")).toHaveLength(0);
	});

	test("skips the wake entirely when no extension has ever synced", async () => {
		const opened: string[] = [];

		await runAuthLoginCommand(store, [host, "--no-wait"], {
			bridgeUrl,
			claimWaitMs: 500,
			openUrl: (url) => opened.push(url),
		});

		expect(opened).toEqual([origin]);
	});
});
