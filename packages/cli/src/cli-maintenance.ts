import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";
import process from "node:process";

type Fail = (message: string) => never;

type CliPackageJson = {
	version?: unknown;
};

export const readCliVersion = async (fail: Fail) => {
	const packageJson = JSON.parse(
		await readFile(new URL("../package.json", import.meta.url), "utf8"),
	) as CliPackageJson;
	if (typeof packageJson.version !== "string") {
		fail("packages/cli/package.json has no string version.");
	}
	return packageJson.version;
};

const isUnsafePurgeTarget = (path: string) => {
	const resolved = resolve(path);
	return (
		resolved === parse(resolved).root ||
		resolved === resolve(homedir()) ||
		resolved === resolve(process.env.INIT_CWD ?? process.cwd())
	);
};

export const purgeDataDir = async (dataDir: string, fail: Fail) => {
	if (isUnsafePurgeTarget(dataDir)) {
		fail(`Refusing to purge unsafe data dir: ${dataDir}`);
	}
	await rm(dataDir, {
		force: true,
		recursive: true,
	});
	console.log(`Purged Harpist data dir: ${dataDir}`);
};
