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
});
