import { describe, expect, test } from "bun:test";
import {
	rootBunCatalogDependencies,
	rootBunCatalogDependencyFindings,
} from "./root-bun-catalog-dependencies.rule";

describe("repo/root-bun-catalog-dependencies", () => {
	test("passes when external dependencies use the root catalog", () => {
		const root = {
			devDependencies: {
				typescript: "catalog:",
			},
			workspaces: {
				catalog: {
					react: "^19.2.4",
					typescript: "^5.9.3",
				},
			},
		};

		const findings = rootBunCatalogDependencyFindings({
			packages: [
				{ file: "package.json", packageJson: root },
				{
					file: "packages/app/package.json",
					packageJson: {
						dependencies: {
							"@harpist/core": "workspace:*",
							react: "catalog:",
						},
					},
				},
			],
			workspaceNames: new Set(["harpist-workspace", "@harpist/core"]),
		});

		expect(findings).toHaveLength(0);
	});

	test("reports literal external dependency versions", () => {
		const findings = rootBunCatalogDependencyFindings({
			packages: [
				{
					file: "packages/app/package.json",
					packageJson: {
						dependencies: {
							react: "^19.2.4",
						},
						workspaces: {
							catalog: {
								react: "^19.2.4",
							},
						},
					},
				},
				{
					file: "package.json",
					packageJson: {
						workspaces: {
							catalog: {
								react: "^19.2.4",
							},
						},
					},
				},
			],
			workspaceNames: new Set(["harpist-workspace"]),
		});

		expect(findings.map((item) => item.message)).toEqual([
			'External dependency react must use "catalog:" instead of "^19.2.4".',
		]);
	});

	test("reports external dependencies missing from the root catalog", () => {
		const findings = rootBunCatalogDependencyFindings({
			packages: [
				{
					file: "package.json",
					packageJson: {
						workspaces: {
							catalog: {},
						},
					},
				},
				{
					file: "packages/cli/package.json",
					packageJson: {
						dependencies: {
							hono: "catalog:",
						},
					},
				},
			],
			workspaceNames: new Set(["harpist-workspace"]),
		});

		expect(findings.map((item) => item.message)).toEqual([
			"Root package.json must define a Bun catalog.",
			"External dependency hono must be declared in the root Bun catalog.",
		]);
	});

	test("reports internal dependencies that do not use the workspace protocol", () => {
		const findings = rootBunCatalogDependencyFindings({
			packages: [
				{
					file: "package.json",
					packageJson: {
						workspaces: {
							catalog: {
								react: "^19.2.4",
							},
						},
					},
				},
				{
					file: "packages/app/package.json",
					packageJson: {
						dependencies: {
							"@harpist/core": "catalog:",
						},
					},
				},
			],
			workspaceNames: new Set(["harpist-workspace", "@harpist/core"]),
		});

		expect(findings.map((item) => item.message)).toEqual([
			'Internal workspace dependency @harpist/core must use "workspace:*".',
		]);
	});

	test("runs against pokayoke workspace context", async () => {
		const packageJsonByWorkspace = new Map([
			[
				".",
				{
					devDependencies: {
						typescript: "catalog:",
					},
					workspaces: {
						catalog: {
							typescript: "^5.9.3",
						},
					},
				},
			],
		]);

		const result = await rootBunCatalogDependencies.run({
			files: async () => [],
			fix: false,
			glob: async () => [],
			options: undefined,
			packageJson: async (workspace = ".") =>
				packageJsonByWorkspace.get(workspace),
			parseTypescript: async () => {
				throw new Error("parseTypescript is not used by this rule.");
			},
			readFile: async () => "",
			report: () => {},
			root: "/repo",
			workspaces: async () => [{ name: "harpist-workspace", root: "." }],
		});

		expect(result.findings).toHaveLength(0);
	});
});
