import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeHealthSnapshot } from "../src/bridge-runtime";
import { createHarpistBridgeServer } from "../src/server";
import { createBridgeStore } from "../src/store";

const bridgeUrl = "http://127.0.0.1:4277";

const health = (): BridgeHealthSnapshot => ({
	bridgeUrl,
	dataDir: "/tmp/harpist-data",
	idleForMs: 0,
	lastActivityAt: "2026-07-07T12:00:00.000Z",
	name: "harpist-bridge",
	ok: true,
	pid: 123,
	startedAt: "2026-07-07T12:00:00.000Z",
	startedBy: "user",
	time: "2026-07-07T12:00:00.000Z",
	uptimeMs: 0,
	version: "0.1.0",
});

describe("wake page and command channel", () => {
	let directory: string;
	let store: ReturnType<typeof createBridgeStore>;
	let app: ReturnType<typeof createHarpistBridgeServer>;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "harpist-wake-"));
		store = createBridgeStore(join(directory, "data"));
		app = createHarpistBridgeServer({ bridgeUrl, health, store });
	});

	afterEach(async () => {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	});

	test("wake page falls back when no extension has synced", async () => {
		const response = await app.fetch(new Request(`${bridgeUrl}/wake`));
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("has not synced with this bridge yet");
	});

	test("wake page targets the last-seen extension id", async () => {
		await store.recordExtensionPresence("abcdefghijklmnopabcdefghijklmnop");
		const response = await app.fetch(new Request(`${bridgeUrl}/wake`));
		const body = await response.text();
		expect(body).toContain('"abcdefghijklmnopabcdefghijklmnop"');
		expect(body).toContain("PULL_COMMANDS");
	});

	test("wake page never embeds an unsafe extension id", async () => {
		await store.recordExtensionPresence("</script><script>alert(1)");
		const body = await (
			await app.fetch(new Request(`${bridgeUrl}/wake`))
		).text();
		expect(body).not.toContain("alert(1)");
		expect(body).toContain("has not synced");
	});

	test("commands round-trip: enqueue → pull claims → complete", async () => {
		const command = await store.commands.enqueue({
			kind: "capture-auth",
			payload: {
				host: "www.example.test",
				loginUrl: "https://www.example.test/login",
			},
		});

		const pull = await app.fetch(
			new Request(`${bridgeUrl}/commands/pull`, {
				body: JSON.stringify({ consumerId: "ext-abc" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(pull.status).toBe(200);
		const pulled = (await pull.json()) as {
			commands: { claimedBy?: string; id: string; status: string }[];
		};
		expect(pulled.commands).toHaveLength(1);
		expect(pulled.commands[0]?.id).toBe(command.id);
		expect(pulled.commands[0]?.status).toBe("claimed");
		expect(pulled.commands[0]?.claimedBy).toBe("ext-abc");

		const again = await app.fetch(
			new Request(`${bridgeUrl}/commands/pull`, {
				body: JSON.stringify({ consumerId: "ext-abc" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(
			((await again.json()) as { commands: unknown[] }).commands,
		).toHaveLength(0);

		const complete = await app.fetch(
			new Request(`${bridgeUrl}/commands/${command.id}/complete`, {
				body: JSON.stringify({}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(complete.status).toBe(200);
		expect(((await complete.json()) as { status: string }).status).toBe("done");
	});

	test("stale pending commands expire instead of firing late", async () => {
		const command = await store.commands.enqueue({
			kind: "capture-auth",
			payload: {
				host: "www.example.test",
				loginUrl: "https://www.example.test/login",
			},
			ttlMs: -1,
		});
		const pulled = await store.commands.pull("ext-abc");
		expect(pulled).toHaveLength(0);
		expect((await store.commands.get(command.id))?.status).toBe("expired");
	});

	test("completing an unknown command 404s", async () => {
		const response = await app.fetch(
			new Request(`${bridgeUrl}/commands/cmd_missing/complete`, {
				body: JSON.stringify({}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		);
		expect(response.status).toBe(404);
	});
});
