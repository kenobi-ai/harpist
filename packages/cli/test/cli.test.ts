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
import type { EndpointSummary, SiteProfile } from "../../core/src/profiles";
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

const testEndpoint = (
	overrides: Partial<EndpointSummary> = {},
): EndpointSummary => ({
	exactKey: "GET api.example.test/v1/items/123",
	host: "api.example.test",
	lastSeenAt: "2026-07-01T00:00:00.000Z",
	method: "GET",
	path: "/v1/items/123",
	samples: 1,
	statuses: [200],
	template: "/v1/items/{id}",
	templateKey: "GET api.example.test/v1/items/{id}",
	...overrides,
});

const testProfile = (overrides: Partial<SiteProfile> = {}): SiteProfile => ({
	artifacts: {
		status: "ready",
		updatedAt: "2026-07-01T00:00:00.000Z",
	},
	auth: {
		confidence: "low",
		credentialed: false,
		evidence: [],
		label: "No user auth",
		type: "none",
	},
	createdAt: "2026-07-01T00:00:00.000Z",
	derivedEndpointCount: 1,
	displayName: "api.example.test",
	endpointTemplateKeys: ["GET api.example.test/v1/items/{id}"],
	endpoints: [testEndpoint()],
	host: "api.example.test",
	origin: "https://api.example.test",
	recordingCount: 0,
	recordings: [],
	scannedEndpointCount: 1,
	scannedEndpointKeys: ["GET api.example.test/v1/items/123"],
	status: "synced",
	updatedAt: "2026-07-01T00:00:00.000Z",
	...overrides,
});

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

	test("writes large profile JSON to a file without truncation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		const dataDir = join(directory, "data");
		const output = join(directory, "profile.json");
		try {
			await createBridgeStore(dataDir).saveProfile(
				testProfile({
					agentNotes: "large-profile-field-".repeat(10_000),
				}),
			);

			const result = await runCliWithEnv(
				["profiles", "get", "api.example.test", "--output", output],
				{ HARPIST_DATA_DIR: dataDir },
			);
			const confirmation = JSON.parse(result.stdout) as {
				bytes: number;
				output: string;
			};
			const written = await readFile(output, "utf8");

			expect(result.exitCode).toBe(0);
			expect(confirmation.output).toBe(output);
			expect(confirmation.bytes).toBeGreaterThan(128 * 1024);
			expect(JSON.parse(written)).toMatchObject({
				host: "api.example.test",
			});
			expect((await stat(output)).mode & 0o777).toBe(0o600);
			expect((await stat(join(dataDir, "profiles.json"))).mode & 0o777).toBe(
				0o600,
			);
			expect((await stat(dataDir)).mode & 0o777).toBe(0o700);

			const refused = await runCliWithEnv(
				["profiles", "get", "api.example.test", "--output", output],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(refused.exitCode).toBe(1);
			expect(refused.stderr).toContain("Refusing to overwrite");

			const replaced = await runCliWithEnv(
				["profiles", "get", "api.example.test", "--output", output, "--force"],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(replaced.exitCode).toBe(0);

			const missingOutput = await runCliWithEnv(
				["profiles", "get", "api.example.test", "--output="],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(missingOutput.exitCode).toBe(1);
			expect(missingOutput.stderr).toContain("Missing value for --output");

			const duplicateOutput = await runCliWithEnv(
				[
					"profiles",
					"get",
					"api.example.test",
					"--output",
					join(directory, "one.json"),
					"--output",
					join(directory, "two.json"),
				],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(duplicateOutput.exitCode).toBe(1);
			expect(duplicateOutput.stderr).toContain(
				"--output may only be passed once",
			);
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});

	test("upserts and durably removes endpoint identities", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-cli-"));
		const dataDir = join(directory, "data");
		const endpointFile = join(directory, "endpoint.json");
		const replacement = testEndpoint({
			template: "/v1/items/current",
			templateKey: "GET api.example.test/v1/items/current",
		});
		try {
			const store = createBridgeStore(dataDir);
			await store.saveProfile(testProfile());
			await writeFile(
				endpointFile,
				`${JSON.stringify(replacement, null, 2)}\n`,
				"utf8",
			);

			const upserted = await runCliWithEnv(
				["endpoints", "upsert", "api.example.test", endpointFile],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(upserted.exitCode).toBe(0);
			const afterUpsert = await store.requireProfile("api.example.test");
			expect(afterUpsert.endpoints).toHaveLength(1);
			expect(afterUpsert.endpoints[0]?.templateKey).toBe(
				replacement.templateKey,
			);
			expect(afterUpsert.endpointIdentityOverrides).toContainEqual({
				exactKey: replacement.exactKey,
				template: replacement.template,
				templateKey: replacement.templateKey,
			});
			expect(afterUpsert.artifacts?.status).toBe("draft");

			const removed = await runCliWithEnv(
				["endpoints", "remove", "api.example.test", replacement.templateKey],
				{ HARPIST_DATA_DIR: dataDir },
			);
			expect(removed.exitCode).toBe(0);
			const afterRemove = await store.requireProfile("api.example.test");
			expect(afterRemove.endpoints).toEqual([]);
			expect(afterRemove.removedEndpointTemplateKeys).toContain(
				replacement.templateKey,
			);

			await store.ingestExtensionSnapshot({
				bridgeUrl: "http://127.0.0.1:4277",
				profiles: [
					testProfile({
						endpoints: [replacement],
						endpointTemplateKeys: [replacement.templateKey],
						updatedAt: "2026-07-01T00:01:00.000Z",
					}),
				],
				recordings: [],
			});
			const afterStaleSync = await store.requireProfile("api.example.test");
			expect(afterStaleSync.endpoints).toEqual([]);
			expect(afterStaleSync.removedEndpointTemplateKeys).toContain(
				replacement.templateKey,
			);

			await store.upsertEndpoint("api.example.test", replacement);
			await store.ingestExtensionSnapshot({
				bridgeUrl: "http://127.0.0.1:4277",
				profiles: [
					testProfile({
						endpoints: [],
						endpointTemplateKeys: [],
						removedEndpointTemplateKeys: [replacement.templateKey],
						updatedAt: "2026-07-01T00:02:00.000Z",
					}),
				],
				recordings: [],
			});
			const afterStaleRemoval = await store.requireProfile("api.example.test");
			expect(afterStaleRemoval.endpoints).toContainEqual(replacement);
			expect(afterStaleRemoval.removedEndpointTemplateKeys).not.toContain(
				replacement.templateKey,
			);

			await expect(
				store.upsertEndpoint("api.example.test", {
					...replacement,
					exactKey: "GET api.example.test/not-the-path",
				}),
			).rejects.toThrow("Endpoint exactKey must be");
		} finally {
			await rm(directory, {
				force: true,
				recursive: true,
			});
		}
	});
});
