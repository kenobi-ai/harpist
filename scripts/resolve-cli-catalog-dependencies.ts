#!/usr/bin/env bun
import { access, readFile, rm, writeFile } from "node:fs/promises";
import process from "node:process";

const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

type DependencyField = (typeof DEPENDENCY_FIELDS)[number];
type JsonRecord = Record<string, unknown>;
export type PackageJson = JsonRecord &
	Partial<Record<DependencyField, unknown>>;

const rootPackageUrl = new URL("../package.json", import.meta.url);
const cliPackageUrl = new URL("../packages/cli/package.json", import.meta.url);
const backupPackageUrl = new URL(
	"../packages/cli/package.json.catalog-backup",
	import.meta.url,
);

export function resolveCatalogDependencies(
	packageJson: PackageJson,
	rootPackageJson: PackageJson,
): PackageJson {
	const catalog = readCatalog(rootPackageJson);
	const resolved = structuredClone(packageJson) as PackageJson;

	for (const field of DEPENDENCY_FIELDS) {
		const dependencies = readOptionalRecord(resolved[field]);
		if (!dependencies) {
			continue;
		}

		resolved[field] = Object.fromEntries(
			Object.entries(dependencies).map(([name, spec]) => [
				name,
				spec === "catalog:" ? resolveCatalogSpec(name, catalog) : spec,
			]),
		);
	}

	return resolved;
}

async function main(args: string[]) {
	const command = args[0];

	switch (command) {
		case "apply":
			await applyResolvedPackageJson();
			break;
		case "restore":
			await restoreOriginalPackageJson();
			break;
		default:
			fail(
				"Usage: bun run scripts/resolve-cli-catalog-dependencies.ts <apply|restore>",
			);
	}
}

async function applyResolvedPackageJson() {
	if (await fileExists(backupPackageUrl)) {
		fail(
			"packages/cli/package.json.catalog-backup already exists. Run the restore command before packing again.",
		);
	}

	const originalPackageJsonText = await readFile(cliPackageUrl, "utf8");
	const cliPackageJson = parsePackageJson(
		originalPackageJsonText,
		"packages/cli/package.json",
	);
	const rootPackageJson = parsePackageJson(
		await readFile(rootPackageUrl, "utf8"),
		"package.json",
	);
	const resolvedPackageJson = resolveCatalogDependencies(
		cliPackageJson,
		rootPackageJson,
	);

	await writeFile(backupPackageUrl, originalPackageJsonText);
	try {
		await writeFile(
			cliPackageUrl,
			`${JSON.stringify(resolvedPackageJson, null, "\t")}\n`,
		);
	} catch (error) {
		await writeFile(cliPackageUrl, originalPackageJsonText);
		await rm(backupPackageUrl, { force: true });
		throw error;
	}
}

async function restoreOriginalPackageJson() {
	if (!(await fileExists(backupPackageUrl))) {
		return;
	}

	await writeFile(cliPackageUrl, await readFile(backupPackageUrl, "utf8"));
	await rm(backupPackageUrl);
}

function readCatalog(packageJson: PackageJson): JsonRecord {
	const workspaces = readRecord(packageJson.workspaces);

	return {
		...readRecord(packageJson.catalog),
		...readRecord(workspaces.catalog),
	};
}

function resolveCatalogSpec(name: string, catalog: JsonRecord): string {
	const spec = catalog[name];
	if (typeof spec !== "string") {
		fail(
			`Dependency ${name} uses "catalog:" but is missing from the root catalog.`,
		);
	}
	return spec;
}

function parsePackageJson(text: string, file: string): PackageJson {
	try {
		return JSON.parse(text) as PackageJson;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		fail(`Could not parse ${file}: ${message}`);
	}
}

function readOptionalRecord(value: unknown): JsonRecord | undefined {
	if (value === undefined) {
		return undefined;
	}
	return readRecord(value);
}

function readRecord(value: unknown): JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: {};
}

async function fileExists(url: URL): Promise<boolean> {
	try {
		await access(url);
		return true;
	} catch {
		return false;
	}
}

function fail(message: string): never {
	throw new Error(message);
}

if (import.meta.main) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
