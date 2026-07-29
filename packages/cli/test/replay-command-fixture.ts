import { fileURLToPath } from "node:url";
import { buildHar } from "../../core/src/har";
import { createBridgeStore } from "../src/store";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

export const runCliWithEnv = async (
	args: string[],
	env: Record<string, string>,
) => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "packages/cli/src/cli.ts", ...args],
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

export const seedReplayFixture = async (input: {
	dataDir: string;
	operationName?: string;
	origin: string;
	path?: string;
}) => {
	const store = createBridgeStore(input.dataDir);
	const host = new URL(input.origin).host;
	const path = input.path ?? "/api/replay";
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
				url: `${input.origin}${path}`,
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
	if (input.operationName) {
		await store.annotateEndpoint(
			host,
			`POST ${host}${path.replace(/\?.*$/, "").replace(/\/123$/, "/{id}")}`,
			{ operationName: input.operationName },
		);
	}
	return { host };
};
