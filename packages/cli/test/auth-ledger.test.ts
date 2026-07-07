import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PendingEntry } from "../../core/src/har";
import { buildHar } from "../../core/src/har";
import { createBridgeStore } from "../src/store";

const origin = "https://www.example.test";
const host = "www.example.test";

const apiEntry = (overrides: Partial<PendingEntry> = {}): PendingEntry => ({
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
	...overrides,
});

const ingest = (
	store: ReturnType<typeof createBridgeStore>,
	entries: PendingEntry[],
	startedAt: string,
) =>
	store.ingestRecording({
		bridgeUrl: "http://127.0.0.1:4277",
		har: buildHar(entries),
		meta: {
			host,
			origin,
			startedAt,
			tabId: 1,
			title: "Ledger fixture",
			url: origin,
		},
	});

describe("auth ledger store", () => {
	let directory: string;
	let store: ReturnType<typeof createBridgeStore>;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "harpist-ledger-"));
		store = createBridgeStore(join(directory, "data"));
	});

	afterEach(async () => {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	});

	test("ingesting a recording materialises a credential set on disk", async () => {
		await ingest(store, [apiEntry()], "2026-07-03T12:00:00.000Z");

		const ledger = await store.getAuthLedger(host);
		expect(ledger.sets).toHaveLength(1);
		expect(ledger.sets[0]?.kinds).toEqual(["browser-session"]);
		expect(ledger.sets[0]?.label).toBe("Browser session");

		const file = join(directory, "data", "auth", "www-example-test.json");
		const stats = await stat(file);
		expect(stats.mode & 0o777).toBe(0o600);
	});

	test("a second login becomes a second generation; repeats dedupe", async () => {
		await ingest(store, [apiEntry()], "2026-07-03T12:00:00.000Z");
		await ingest(
			store,
			[
				apiEntry({
					requestHeaders: {
						Accept: "application/json",
						Cookie: "session=beta-session",
					},
					startedDateTime: "2026-07-04T12:00:00.000Z",
				}),
			],
			"2026-07-04T12:00:00.000Z",
		);
		await ingest(store, [apiEntry()], "2026-07-05T12:00:00.000Z");

		const ledger = await store.getAuthLedger(host);
		expect(ledger.sets).toHaveLength(2);
	});

	test("validation write-back and active pin survive resyncs", async () => {
		await ingest(store, [apiEntry()], "2026-07-03T12:00:00.000Z");
		const ledger = await store.getAuthLedger(host);
		const credentialId = ledger.sets[0]?.id ?? "";

		await store.recordCredentialValidation(host, credentialId, {
			checkedAt: "2026-07-07T12:00:00.000Z",
			result: "invalid",
			statusCode: 401,
		});
		await store.setActiveCredential(host, credentialId);

		const next = await store.getAuthLedger(host);
		expect(next.sets[0]?.validation?.statusCode).toBe(401);
		expect(next.activeCredentialId).toBe(credentialId);

		await store.setActiveCredential(host, null);
		expect(
			(await store.getAuthLedger(host)).activeCredentialId,
		).toBeUndefined();
	});

	test("rejects unknown credential ids", () => {
		expect(
			ingest(store, [apiEntry()], "2026-07-03T12:00:00.000Z").then(() =>
				store.setActiveCredential(host, "cred_missing00000"),
			),
		).rejects.toThrow("Unknown credential");
	});

	test("stores the login url", async () => {
		await ingest(store, [apiEntry()], "2026-07-03T12:00:00.000Z");
		await store.setAuthLoginUrl(host, `${origin}/login`);
		expect((await store.getAuthLedger(host)).loginUrl).toBe(`${origin}/login`);
	});
});
