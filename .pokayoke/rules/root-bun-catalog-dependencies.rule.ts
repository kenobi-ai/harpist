import type { Finding, Rule } from "pokayoke";

const RULE_ID = "repo/root-bun-catalog-dependencies";
const ROOT_PACKAGE_FILE = "package.json";
const DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

type PackageJson = {
	catalog?: unknown;
	workspaces?: unknown;
} & Partial<Record<DependencyField, unknown>>;

type PackageEntry = {
	file: string;
	packageJson: PackageJson;
};

export type RootBunCatalogDependencyInput = {
	packages: PackageEntry[];
	workspaceNames: ReadonlySet<string>;
};

const finding = (file: string, message: string): Finding => ({
	advice:
		'Declare external dependencies in package.json workspaces.catalog and reference them with "catalog:".',
	file,
	message,
	ruleId: RULE_ID,
	severity: "error",
});

export const rootBunCatalogDependencyFindings = ({
	packages,
	workspaceNames,
}: RootBunCatalogDependencyInput) => {
	const rootPackage = packages.find(
		(entry) => entry.file === ROOT_PACKAGE_FILE,
	);
	const catalog = rootPackage
		? readDefaultCatalog(rootPackage.packageJson)
		: new Set<string>();
	const findings: Finding[] = [];

	if (catalog.size === 0) {
		findings.push(
			finding(
				ROOT_PACKAGE_FILE,
				"Root package.json must define a Bun catalog.",
			),
		);
	}

	for (const { file, packageJson } of packages) {
		for (const field of DEPENDENCY_FIELDS) {
			for (const [name, version] of Object.entries(
				readRecord(packageJson[field]),
			)) {
				const spec = String(version);

				if (workspaceNames.has(name)) {
					if (!spec.startsWith("workspace:")) {
						findings.push(
							finding(
								file,
								`Internal workspace dependency ${name} must use "workspace:*".`,
							),
						);
					}
					continue;
				}

				if (!catalog.has(name)) {
					findings.push(
						finding(
							file,
							`External dependency ${name} must be declared in the root Bun catalog.`,
						),
					);
					continue;
				}

				if (spec !== "catalog:") {
					findings.push(
						finding(
							file,
							`External dependency ${name} must use "catalog:" instead of "${spec}".`,
						),
					);
				}
			}
		}
	}

	return findings;
};

export const rootBunCatalogDependencies: Rule = {
	meta: {
		docs: "Require every external package dependency to come from the root Bun catalog.",
		id: RULE_ID,
		kind: "project",
	},
	async run(context) {
		const workspaces = await context.workspaces();
		const packages = await Promise.all(
			workspaces.map(async (workspace) => ({
				file: packageJsonPath(workspace.root),
				packageJson: (await context.packageJson(workspace.root)) as PackageJson,
			})),
		);

		return {
			findings: rootBunCatalogDependencyFindings({
				packages,
				workspaceNames: new Set(workspaces.map((workspace) => workspace.name)),
			}),
		};
	},
};

function readDefaultCatalog(packageJson: PackageJson): Set<string> {
	const workspaces = readRecord(packageJson.workspaces);
	const nestedCatalog = readRecord(workspaces.catalog);
	const topLevelCatalog = readRecord(packageJson.catalog);

	return new Set([
		...Object.keys(nestedCatalog),
		...Object.keys(topLevelCatalog),
	]);
}

function readRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function packageJsonPath(workspaceRoot: string): string {
	return workspaceRoot === "."
		? ROOT_PACKAGE_FILE
		: `${workspaceRoot}/package.json`;
}
