import { describe, expect, test } from "bun:test";
import {
	createBridgeRuntime,
	DEFAULT_AGENT_IDLE_TIMEOUT_MS,
	parseBridgeServeOptions,
	parseDurationMs,
} from "../src/bridge-runtime";

describe("bridge runtime", () => {
	test("parses duration strings", () => {
		expect(parseDurationMs("1500")).toBe(1500);
		expect(parseDurationMs("30s")).toBe(30_000);
		expect(parseDurationMs("15m")).toBe(900_000);
		expect(parseDurationMs("1h")).toBe(3_600_000);
	});

	test("defaults agent bridges to an idle timeout", () => {
		expect(parseBridgeServeOptions(["--agent"])).toEqual({
			idleTimeoutMs: DEFAULT_AGENT_IDLE_TIMEOUT_MS,
			startedBy: "agent",
		});
		expect(
			parseBridgeServeOptions(["--agent", "--idle-timeout", "30s"]),
		).toEqual({
			idleTimeoutMs: 30_000,
			startedBy: "agent",
		});
		expect(parseBridgeServeOptions(["--idle-timeout=1h"])).toEqual({
			idleTimeoutMs: 3_600_000,
			startedBy: "user",
		});
	});

	test("reports ownership and idle metadata in health", () => {
		let timestamp = Date.parse("2026-07-02T12:00:00.000Z");
		const runtime = createBridgeRuntime({
			bridgeUrl: "http://127.0.0.1:4277",
			dataDir: "/tmp/harpist-data",
			idleTimeoutMs: 900_000,
			now: () => new Date(timestamp),
			pid: 123,
			startedBy: "agent",
		});

		timestamp += 1000;
		runtime.touch();
		timestamp += 2000;

		expect(runtime.health()).toMatchObject({
			bridgeUrl: "http://127.0.0.1:4277",
			dataDir: "/tmp/harpist-data",
			idleForMs: 2000,
			idleTimeoutMs: 900_000,
			lastActivityAt: "2026-07-02T12:00:01.000Z",
			name: "harpist-bridge",
			ok: true,
			pid: 123,
			startedAt: "2026-07-02T12:00:00.000Z",
			startedBy: "agent",
			time: "2026-07-02T12:00:03.000Z",
			uptimeMs: 3000,
		});
		runtime.dispose();
	});
});
