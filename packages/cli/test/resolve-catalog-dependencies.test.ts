import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
	type PackageJson,
	resolveCatalogDependencies,
} from "../../../scripts/resolve-cli-catalog-dependencies";

describe("resolveCatalogDependencies", () => {
	test("replaces catalog dependency specs from the root Bun catalog", () => {
		const resolved = resolveCatalogDependencies(
			{
				dependencies: {
					hono: "catalog:",
					local: "workspace:*",
				},
				peerDependencies: {
					zod: "catalog:",
				},
			},
			{
				workspaces: {
					catalog: {
						hono: "^4.12.27",
						zod: "^4.4.3",
					},
				},
			},
		);

		expect(resolved.dependencies).toEqual({
			hono: "^4.12.27",
			local: "workspace:*",
		});
		expect(resolved.peerDependencies).toEqual({
			zod: "^4.4.3",
		});
	});

	test("resolves the repo CLI manifest without publishing catalog specs", async () => {
		const rootPackageJson = JSON.parse(
			await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
		) as PackageJson;
		const cliPackageJson = JSON.parse(
			await readFile(new URL("../package.json", import.meta.url), "utf8"),
		) as PackageJson;

		const resolved = resolveCatalogDependencies(
			cliPackageJson,
			rootPackageJson,
		);
		const dependencySpecs = Object.values(
			(resolved.dependencies ?? {}) as Record<string, unknown>,
		);

		expect(dependencySpecs).not.toContain("catalog:");
		expect(dependencySpecs).toContain("^4.12.27");
		expect(dependencySpecs).toContain("^4.4.3");
	});

	test("fails when a catalog dependency is missing from the root catalog", () => {
		expect(() =>
			resolveCatalogDependencies(
				{
					dependencies: {
						hono: "catalog:",
					},
				},
				{
					workspaces: {
						catalog: {},
					},
				},
			),
		).toThrow('Dependency hono uses "catalog:"');
	});
});
