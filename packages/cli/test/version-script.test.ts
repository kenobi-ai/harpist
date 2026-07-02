import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

type ScriptRun = {
	exitCode: number;
	stderr: string;
	stdout: string;
};

const runBumpScript = async (
	args: string[],
	env: Record<string, string>,
): Promise<ScriptRun> => {
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", "scripts/bump-cli-version.ts", ...args],
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

const writeFixture = async (directory: string) => {
	const packagePath = join(directory, "package.json");
	const skillPath = join(directory, "SKILL.md");
	await writeFile(
		packagePath,
		`${JSON.stringify({ name: "harpist", version: "1.2.3" }, null, "\t")}\n`,
		"utf8",
	);
	await writeFile(
		skillPath,
		[
			"before",
			"<!-- harpist:cli-version:start -->",
			"- Current published Harpist CLI version: `1.2.3`.",
			"<!-- harpist:cli-version:end -->",
			"after",
			"",
		].join("\n"),
		"utf8",
	);
	return { packagePath, skillPath };
};

describe("version bump script", () => {
	test("updates the CLI package and Harpist skill version", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-version-"));
		try {
			const { packagePath, skillPath } = await writeFixture(directory);

			const result = await runBumpScript(["patch"], {
				HARPIST_BUMP_PACKAGE_JSON: packagePath,
				HARPIST_BUMP_SKILL_MD: skillPath,
			});

			expect(result).toEqual({
				exitCode: 0,
				stderr: "",
				stdout: "1.2.4",
			});
			expect(JSON.parse(await readFile(packagePath, "utf8"))).toMatchObject({
				version: "1.2.4",
			});
			expect(await readFile(skillPath, "utf8")).toContain(
				"- Current published Harpist CLI version: `1.2.4`.",
			);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	test("leaves both files untouched on dry run", async () => {
		const directory = await mkdtemp(join(tmpdir(), "harpist-version-"));
		try {
			const { packagePath, skillPath } = await writeFixture(directory);
			const beforePackage = await readFile(packagePath, "utf8");
			const beforeSkill = await readFile(skillPath, "utf8");

			const result = await runBumpScript(["minor", "--dry-run"], {
				HARPIST_BUMP_PACKAGE_JSON: packagePath,
				HARPIST_BUMP_SKILL_MD: skillPath,
			});

			expect(result).toEqual({
				exitCode: 0,
				stderr: "",
				stdout: "1.3.0",
			});
			expect(await readFile(packagePath, "utf8")).toBe(beforePackage);
			expect(await readFile(skillPath, "utf8")).toBe(beforeSkill);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});
