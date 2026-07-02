import { describe, expect, test } from "bun:test";
import {
	type ToolingParityInput,
	toolingParity,
	toolingParityFindings,
} from "./tooling-parity.rule";

const validInput = (): ToolingParityInput => ({
	agents: [
		"Before reporting code or config work as done, run `bun run fix` and then `bun run check`.",
		"Do not start a dev service for this repo.",
	].join("\n"),
	biome: {
		assist: {
			actions: {
				source: {
					organizeImports: "on",
					useSortedPackageJson: "on",
				},
			},
		},
		linter: {
			enabled: true,
		},
	},
	rootPackage: {
		scripts: {
			check:
				"bun run lint && bun run typecheck && bun test ./.pokayoke/rules/*.test.ts ./packages/*/test/*.test.ts && bun run knip && bun run pokayoke check",
			compile: "bun run typecheck",
			fix: "biome check --write --error-on-warnings .",
			knip: "knip",
			lint: "biome check --error-on-warnings .",
			"lint:all": "biome check --error-on-warnings --max-diagnostics=none .",
			typecheck: "bun run --workspaces --sequential typecheck",
		},
	},
	workspaces: [
		{
			name: "harpist-workspace",
			packageJson: {},
			root: ".",
		},
		{
			name: "@harpist/core",
			packageJson: {
				scripts: {
					compile: "bun run typecheck",
					typecheck: "tsc --noEmit -p tsconfig.json",
				},
			},
			root: "packages/core",
		},
	],
	zedSettings: {
		format_on_save: "on",
		languages: Object.fromEntries(
			[
				"CSS",
				"HTML",
				"JavaScript",
				"JSON",
				"JSONC",
				"JSX",
				"TSX",
				"TypeScript",
			].map((language) => [
				language,
				{
					code_actions_on_format: {
						"source.fixAll.biome": true,
						"source.organizeImports.biome": true,
					},
					formatter: {
						language_server: {
							name: "biome",
						},
					},
					prettier: {
						allowed: false,
					},
				},
			]),
		),
		lsp: {
			biome: {
				settings: {
					require_config_file: true,
				},
			},
		},
	},
	zedTasks: [
		"check",
		"fix",
		"format",
		"knip",
		"lint",
		"lint:all",
		"typecheck",
	].map((label) => ({
		args: ["run", label],
		command: "bun",
		cwd: "$ZED_WORKTREE_ROOT",
		label,
	})),
});

describe("repo/tooling-parity", () => {
	test("passes when tooling surfaces stay aligned", () => {
		expect(toolingParityFindings(validInput())).toHaveLength(0);
	});

	test("reports root scripts that hide Biome diagnostics", () => {
		const input = validInput();
		input.rootPackage = {
			scripts: {
				...(input.rootPackage.scripts as Record<string, string>),
				lint: "biome check --diagnostic-level=error .",
			},
		};

		expect(toolingParityFindings(input).map((item) => item.message)).toContain(
			'Script "lint" hides non-error Biome diagnostics.',
		);
	});

	test("reports expanded Biome lint rule config", () => {
		const input = validInput();
		input.biome = {
			assist: input.biome.assist,
			linter: {
				rules: {
					preset: "all",
				},
			},
		};

		expect(toolingParityFindings(input).map((item) => item.message)).toContain(
			"Biome lint rules must stay close to defaults instead of being enumerated.",
		);
	});

	test("reports Zed language drift", () => {
		const input = validInput();
		input.zedSettings = {
			...input.zedSettings,
			languages: {
				...(input.zedSettings.languages as Record<string, unknown>),
				TypeScript: {},
			},
		};

		const messages = toolingParityFindings(input).map((item) => item.message);

		expect(messages).toContain("TypeScript must use Biome as formatter.");
		expect(messages).toContain("TypeScript must run Biome fixAll on format.");
	});

	test("runs against pokayoke workspace context", async () => {
		const input = validInput();
		const files = new Map([
			["AGENTS.md", input.agents],
			["biome.json", JSON.stringify(input.biome)],
			[".zed/settings.json", JSON.stringify(input.zedSettings)],
			[".zed/tasks.json", JSON.stringify(input.zedTasks)],
		]);

		const result = await toolingParity.run({
			fix: false,
			options: undefined,
			files: async () => [],
			glob: async () => [],
			packageJson: async (workspace = ".") =>
				workspace === "."
					? input.rootPackage
					: input.workspaces[1]?.packageJson,
			parseTypescript: async () => {
				throw new Error("parseTypescript is not used by this rule.");
			},
			readFile: async (file) => files.get(file) ?? "",
			report: () => {},
			root: "/repo",
			workspaces: async () =>
				input.workspaces.map(({ name, root }) => ({ name, root })),
		});

		expect(result.findings).toHaveLength(0);
	});
});
