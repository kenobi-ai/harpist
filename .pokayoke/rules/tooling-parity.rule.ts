import type { Finding, Rule } from "pokayoke";

const RULE_ID = "repo/tooling-parity";
const ROOT_PACKAGE = "package.json";
const BIOME_FILE = "biome.json";
const ZED_SETTINGS_FILE = ".zed/settings.json";
const ZED_TASKS_FILE = ".zed/tasks.json";
const AGENTS_FILE = "AGENTS.md";

const EXPECTED_ROOT_SCRIPTS = {
	check:
		"bun run lint && bun run typecheck && bun test ./.pokayoke/rules/*.test.ts ./packages/*/test/*.test.ts && bun run knip && bun run pokayoke check",
	compile: "bun run typecheck",
	fix: "biome check --write --error-on-warnings .",
	knip: "knip",
	lint: "biome check --error-on-warnings .",
	"lint:all": "biome check --error-on-warnings --max-diagnostics=none .",
	typecheck: "bun run --workspaces --sequential typecheck",
} as const;

const EXPECTED_ZED_TASKS = [
	"check",
	"fix",
	"format",
	"knip",
	"lint",
	"lint:all",
	"typecheck",
] as const;

const EXPECTED_ZED_LANGUAGES = [
	"CSS",
	"HTML",
	"JavaScript",
	"JSON",
	"JSONC",
	"JSX",
	"TSX",
	"TypeScript",
] as const;

type JsonRecord = Record<string, unknown>;

export type ToolingParityWorkspace = {
	name: string;
	packageJson: JsonRecord;
	root: string;
};

export type ToolingParityInput = {
	agents: string;
	biome: JsonRecord;
	rootPackage: JsonRecord;
	workspaces: ToolingParityWorkspace[];
	zedSettings: JsonRecord;
	zedTasks: unknown;
};

const finding = (file: string, message: string, advice?: string): Finding => ({
	advice,
	file,
	message,
	ruleId: RULE_ID,
	severity: "error",
});

export const toolingParityFindings = ({
	agents,
	biome,
	rootPackage,
	workspaces,
	zedSettings,
	zedTasks,
}: ToolingParityInput) => {
	const findings: Finding[] = [];

	checkRootScripts(rootPackage, findings);
	checkWorkspaceTypecheckScripts(workspaces, findings);
	checkBiomeConfig(biome, findings);
	checkZedSettings(zedSettings, findings);
	checkZedTasks(zedTasks, findings);
	checkAgentsInstructions(agents, findings);

	return findings;
};

export const toolingParity: Rule = {
	meta: {
		docs: "Keep the repo check/fix pipeline, Biome config, Zed config, and agent instructions aligned.",
		id: RULE_ID,
		kind: "project",
	},
	async run(context) {
		const workspaces = await Promise.all(
			(await context.workspaces()).map(async (workspace) => ({
				...workspace,
				packageJson: (await context.packageJson(workspace.root)) as JsonRecord,
			})),
		);

		return {
			findings: toolingParityFindings({
				agents: await context.readFile(AGENTS_FILE),
				biome: JSON.parse(await context.readFile(BIOME_FILE)) as JsonRecord,
				rootPackage: (await context.packageJson(".")) as JsonRecord,
				workspaces,
				zedSettings: JSON.parse(
					await context.readFile(ZED_SETTINGS_FILE),
				) as JsonRecord,
				zedTasks: JSON.parse(await context.readFile(ZED_TASKS_FILE)),
			}),
		};
	},
};

function checkRootScripts(rootPackage: JsonRecord, findings: Finding[]) {
	const scripts = readRecord(rootPackage.scripts);

	for (const [name, expected] of Object.entries(EXPECTED_ROOT_SCRIPTS)) {
		if (scripts[name] !== expected) {
			findings.push(
				finding(
					ROOT_PACKAGE,
					`Root script "${name}" must stay aligned with the repo tooling pipeline.`,
					`Expected "${name}": "${expected}".`,
				),
			);
		}
	}

	for (const [name, script] of Object.entries(scripts)) {
		if (
			typeof script === "string" &&
			script.includes("--diagnostic-level=error")
		) {
			findings.push(
				finding(
					ROOT_PACKAGE,
					`Script "${name}" hides non-error Biome diagnostics.`,
					"Use --error-on-warnings instead so CLI checks match editor diagnostics.",
				),
			);
		}
	}
}

function checkWorkspaceTypecheckScripts(
	workspaces: ToolingParityWorkspace[],
	findings: Finding[],
) {
	for (const workspace of workspaces) {
		if (workspace.root === ".") {
			continue;
		}

		const scripts = readRecord(workspace.packageJson.scripts);
		const file = `${workspace.root}/package.json`;

		if (scripts.compile !== "bun run typecheck") {
			findings.push(
				finding(
					file,
					`Workspace ${workspace.name} compile script must delegate to typecheck.`,
				),
			);
		}
		if (scripts.typecheck !== "tsc --noEmit -p tsconfig.json") {
			findings.push(
				finding(
					file,
					`Workspace ${workspace.name} must expose a tsc no-emit typecheck script.`,
				),
			);
		}
	}
}

function checkBiomeConfig(biome: JsonRecord, findings: Finding[]) {
	const sourceActions = readRecord(
		readRecord(readRecord(biome.assist).actions).source,
	);
	const linter = readRecord(biome.linter);

	if (sourceActions.organizeImports !== "on") {
		findings.push(
			finding(BIOME_FILE, "Biome must enforce organizeImports assist."),
		);
	}
	if (sourceActions.useSortedPackageJson !== "on") {
		findings.push(
			finding(BIOME_FILE, "Biome must enforce package.json sorting assist."),
		);
	}
	if (sourceActions.preset === "all") {
		findings.push(
			finding(BIOME_FILE, "Biome source assist preset must not be set to all."),
		);
	}
	if (hasOwn(linter, "rules")) {
		findings.push(
			finding(
				BIOME_FILE,
				"Biome lint rules must stay close to defaults instead of being enumerated.",
			),
		);
	}
}

function checkZedSettings(zedSettings: JsonRecord, findings: Finding[]) {
	if (zedSettings.format_on_save !== "on") {
		findings.push(finding(ZED_SETTINGS_FILE, "Zed must format on save."));
	}

	const biomeSettings = readRecord(
		readRecord(readRecord(zedSettings.lsp).biome).settings,
	);
	if (biomeSettings.require_config_file !== true) {
		findings.push(
			finding(
				ZED_SETTINGS_FILE,
				"Zed Biome must require the repo config file.",
			),
		);
	}

	const languages = readRecord(zedSettings.languages);
	for (const language of EXPECTED_ZED_LANGUAGES) {
		const config = readRecord(languages[language]);
		const formatter = readRecord(readRecord(config.formatter).language_server);
		const actions = readRecord(config.code_actions_on_format);
		const prettier = readRecord(config.prettier);

		if (formatter.name !== "biome") {
			findings.push(
				finding(ZED_SETTINGS_FILE, `${language} must use Biome as formatter.`),
			);
		}
		if (actions["source.fixAll.biome"] !== true) {
			findings.push(
				finding(
					ZED_SETTINGS_FILE,
					`${language} must run Biome fixAll on format.`,
				),
			);
		}
		if (actions["source.organizeImports.biome"] !== true) {
			findings.push(
				finding(
					ZED_SETTINGS_FILE,
					`${language} must run Biome organizeImports on format.`,
				),
			);
		}
		if (prettier.allowed !== false) {
			findings.push(
				finding(ZED_SETTINGS_FILE, `${language} must disable Prettier.`),
			);
		}
	}
}

function checkZedTasks(zedTasks: unknown, findings: Finding[]) {
	if (!Array.isArray(zedTasks)) {
		findings.push(finding(ZED_TASKS_FILE, "Zed tasks must be an array."));
		return;
	}

	const taskByLabel = new Map(
		zedTasks.map((task) => {
			const record = readRecord(task);
			return [String(record.label), record];
		}),
	);

	for (const label of EXPECTED_ZED_TASKS) {
		const task = taskByLabel.get(label);
		const args = Array.isArray(task?.args) ? task.args : [];
		if (
			task?.command !== "bun" ||
			task.cwd !== "$ZED_WORKTREE_ROOT" ||
			args[0] !== "run" ||
			args[1] !== label
		) {
			findings.push(
				finding(
					ZED_TASKS_FILE,
					`Zed task "${label}" must run "bun run ${label}" at the worktree root.`,
				),
			);
		}
	}
}

function checkAgentsInstructions(agents: string, findings: Finding[]) {
	const fixIndex = agents.indexOf("bun run fix");
	const checkIndex = agents.indexOf("bun run check");

	if (fixIndex < 0 || checkIndex < 0 || fixIndex > checkIndex) {
		findings.push(
			finding(
				AGENTS_FILE,
				"Agent instructions must require bun run fix before bun run check.",
			),
		);
	}
	if (!agents.includes("Do not start a dev service")) {
		findings.push(
			finding(
				AGENTS_FILE,
				"Agent instructions must preserve dev-service policy.",
			),
		);
	}
}

function hasOwn(record: JsonRecord, key: string) {
	return Object.hasOwn(record, key);
}

function readRecord(value: unknown): JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: {};
}
