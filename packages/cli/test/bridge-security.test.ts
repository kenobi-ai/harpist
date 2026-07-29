import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeHealthSnapshot } from "../src/bridge-runtime";
import { openApiWithReplayExamples } from "../src/profile-docs";
import { createHarpistBridgeServer } from "../src/server";
import { createBridgeStore } from "../src/store";
import { seedReplayFixture } from "./replay-command-fixture";

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

describe("bridge browser boundary", () => {
	let app: ReturnType<typeof createHarpistBridgeServer>;
	let dataDir: string;
	let directory: string;
	let host: string;
	let store: ReturnType<typeof createBridgeStore>;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "harpist-security-"));
		dataDir = join(directory, "data");
		({ host } = await seedReplayFixture({
			dataDir,
			origin: "https://api.example.test",
		}));
		store = createBridgeStore(dataDir);
		const artifactPaths = await store.writeSiteArtifacts(host, {
			contractProfile: {},
			contractSource: "export const contract = {};\n",
			metadata: {},
			openapi: {
				info: { title: "Example", version: "1.0.0" },
				openapi: "3.1.0",
				paths: {},
			},
		});
		await store.setArtifacts(host, {
			...artifactPaths,
			status: "ready",
			updatedAt: "2026-07-07T12:00:00.000Z",
		});
		app = createHarpistBridgeServer({ bridgeUrl, health, store });
	});

	afterEach(async () => {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	});

	test("blocks contract API reads from bridge-hosted browser scripts", async () => {
		const browserHeaders = {
			origin: bridgeUrl,
			"sec-fetch-site": "same-origin",
		};
		const responses = await Promise.all(
			[
				`${bridgeUrl}/profiles`,
				`${bridgeUrl}/profiles/${host}/profile.json`,
				`${bridgeUrl}/profiles/${host}/openapi.json`,
				`${bridgeUrl}/profiles/${host}/contract-profile.json`,
			].map((url) =>
				app.fetch(
					new Request(url, {
						headers: browserHeaders,
					}),
				),
			),
		);

		for (const response of responses) {
			expect(response.status).toBe(403);
		}
		expect(await responses[0]?.text()).toContain(
			"limited to the Harpist extension",
		);
	});

	test("permits only the redacted docs contract route to bridge pages", async () => {
		const response = await app.fetch(
			new Request(`${bridgeUrl}/profiles/${host}/openapi.scalar.json`, {
				headers: {
					origin: bridgeUrl,
					"sec-fetch-site": "same-origin",
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).not.toContain("test-session");
	});

	test("allows extension API reads and local non-browser clients", async () => {
		const extensionResponse = await app.fetch(
			new Request(`${bridgeUrl}/profiles`, {
				headers: {
					origin: "chrome-extension://abcdefghijklmnop",
					"sec-fetch-site": "cross-site",
				},
			}),
		);
		const localResponse = await app.fetch(new Request(`${bridgeUrl}/profiles`));

		expect(extensionResponse.status).toBe(200);
		expect(localResponse.status).toBe(200);
	});

	test("redacts browser-facing profile and replay material", async () => {
		const profileResponse = await app.fetch(
			new Request(`${bridgeUrl}/profiles/${host}/profile.json`),
		);
		const replayResponse = await app.fetch(
			new Request(
				`${bridgeUrl}/profiles/${host}/replay.txt?templateKey=${encodeURIComponent(
					`POST ${host}/api/replay`,
				)}`,
			),
		);
		const output = `${await profileResponse.text()}\n${await replayResponse.text()}`;

		expect(profileResponse.status).toBe(200);
		expect(replayResponse.status).toBe(200);
		expect(output).not.toContain("test-session");
		expect(output).not.toContain("csrf-123");
		expect(output).not.toContain('"hello":"world"');
		expect(output).toContain("<redacted>");
	});

	test("keeps generated Scalar examples redacted", async () => {
		const profile = await store.requireProfile(host);
		const openapi = await openApiWithReplayExamples({
			openapi: {
				paths: {
					"/api/replay": {
						post: {
							"x-harpist": {
								endpointKey: `POST ${host}/api/replay`,
							},
						},
					},
				},
			},
			profile,
			store,
		});
		const output = JSON.stringify(openapi);

		expect(output).toContain("Redacted auth curl");
		expect(output).toContain("<redacted>");
		expect(output).not.toContain("test-session");
		expect(output).not.toContain("csrf-123");
		expect(output).not.toContain('"hello":"world"');
	});

	test("serves docs with a restrictive browser policy", async () => {
		const response = await app.fetch(
			new Request(`${bridgeUrl}/profiles/${host}/docs`),
		);

		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("content-security-policy")).toContain(
			"connect-src 'self'",
		);
		expect(response.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
		expect(await response.text()).toContain('integrity="sha384-');
	});
});
