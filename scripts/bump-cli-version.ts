#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type PackageJson = {
	version?: unknown;
	[key: string]: unknown;
};

type ParsedVersion = {
	major: number;
	minor: number;
	patch: number;
	prerelease?: string;
};

const packageUrl = new URL("../packages/cli/package.json", import.meta.url);
const skillUrl = new URL("../skills/harpist/SKILL.md", import.meta.url);
const packagePath = process.env.HARPIST_BUMP_PACKAGE_JSON
	? pathToFileURL(resolve(process.env.HARPIST_BUMP_PACKAGE_JSON))
	: packageUrl;
const skillPath = process.env.HARPIST_BUMP_SKILL_MD
	? pathToFileURL(resolve(process.env.HARPIST_BUMP_SKILL_MD))
	: skillUrl;
const args = process.argv.slice(2);
const increment = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
const preid =
	args.find((arg) => arg.startsWith("--preid="))?.slice("--preid=".length) ??
	"next";

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const parseVersion = (version: string): ParsedVersion => {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
	if (!match) {
		fail(`Invalid current version: ${version}`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4],
	};
};

const formatVersion = (version: ParsedVersion) =>
	`${version.major}.${version.minor}.${version.patch}${
		version.prerelease ? `-${version.prerelease}` : ""
	}`;

const bumpPrerelease = (version: ParsedVersion): ParsedVersion => {
	const current = version.prerelease?.match(
		new RegExp(`^${preid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)$`),
	);
	if (current) {
		return {
			...version,
			prerelease: `${preid}.${Number(current[1]) + 1}`,
		};
	}
	return {
		...version,
		patch: version.patch + 1,
		prerelease: `${preid}.0`,
	};
};

const bumpVersion = (
	version: ParsedVersion,
	requestedIncrement: string,
): ParsedVersion => {
	if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedIncrement)) {
		return parseVersion(requestedIncrement);
	}
	switch (requestedIncrement) {
		case "major":
			return { major: version.major + 1, minor: 0, patch: 0 };
		case "minor":
			return { major: version.major, minor: version.minor + 1, patch: 0 };
		case "patch":
			return {
				major: version.major,
				minor: version.minor,
				patch: version.patch + 1,
			};
		case "prerelease":
			return bumpPrerelease(version);
		default:
			fail(
				"Usage: bun run scripts/bump-cli-version.ts <major|minor|patch|prerelease|x.y.z> [--dry-run] [--preid=next]",
			);
	}
};

const escapeRegex = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const updateSkillVersion = (skill: string, version: string) => {
	const start = "<!-- harpist:cli-version:start -->";
	const end = "<!-- harpist:cli-version:end -->";
	const block = new RegExp(
		`(${escapeRegex(start)}\\n)[\\s\\S]*?(\\n${escapeRegex(end)})`,
	);
	if (!block.test(skill)) {
		fail("skills/harpist/SKILL.md is missing the CLI version block.");
	}
	return skill.replace(
		block,
		`$1- Current published Harpist CLI version: \`${version}\`.$2`,
	);
};

if (!increment) {
	fail(
		"Usage: bun run scripts/bump-cli-version.ts <major|minor|patch|prerelease|x.y.z> [--dry-run] [--preid=next]",
	);
}

const packageJson = JSON.parse(
	await readFile(packagePath, "utf8"),
) as PackageJson;
const skill = await readFile(skillPath, "utf8");

if (typeof packageJson.version !== "string") {
	fail("packages/cli/package.json has no string version.");
}

const nextVersion = formatVersion(
	bumpVersion(parseVersion(packageJson.version), increment),
);
packageJson.version = nextVersion;
const nextSkill = updateSkillVersion(skill, nextVersion);

if (!dryRun) {
	await Promise.all([
		writeFile(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`),
		writeFile(skillPath, nextSkill),
	]);
}

console.log(nextVersion);
