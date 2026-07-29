import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EndpointSummary } from "../../core/src/profiles";
import { createBridgeStore } from "../src/store";

describe("endpoint identity commands", () => {
	test("rejects an endpoint belonging to another host", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-endpoint-"));
		const endpoint = {
			exactKey: "GET other.example.test/v1/items/123",
			host: "other.example.test",
			lastSeenAt: "2026-07-01T00:00:00.000Z",
			method: "GET",
			path: "/v1/items/123",
			samples: 1,
			statuses: [200],
			template: "/v1/items/current",
			templateKey: "GET other.example.test/v1/items/current",
		} satisfies EndpointSummary;
		try {
			await expect(
				createBridgeStore(join(directory, "data")).upsertEndpoint(
					"api.example.test",
					endpoint,
				),
			).rejects.toThrow("does not match target profile");
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});
