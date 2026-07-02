import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

type CliRun = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

const runCli = async (arg: string): Promise<CliRun> => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "packages/cli/src/cli.ts", arg],
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
});
