import type { Finding, Rule } from "pokayoke";
import {
	HARPIST_CLI_COMMANDS,
	renderHarpistCliCommandLines,
} from "../../packages/cli/src/surface";
import {
	authOperations,
	bridgeOperations,
	endpointOperations,
	handoffOperations,
	profileOperations,
	recordingOperations,
	syncOperations,
} from "../../packages/core/src/bridge-contract";

const RULE_ID = "repo/harpist-surface-parity";

type BridgeOperation = {
	readonly route: {
		readonly operationId: string;
	};
};

type BridgeOperationGroup = {
	readonly operations: Readonly<Record<string, BridgeOperation>>;
};

type ManagedBlock = {
	readonly content: string;
	readonly end: string;
	readonly file: string;
	readonly label: string;
	readonly source: string;
	readonly start: string;
};

const bridgeOperationGroups: readonly BridgeOperationGroup[] = [
	{ operations: bridgeOperations },
	{ operations: profileOperations },
	{ operations: recordingOperations },
	{ operations: endpointOperations },
	{ operations: authOperations },
	{ operations: handoffOperations },
	{ operations: syncOperations },
];

const fencedShell = (lines: readonly string[]) =>
	["```sh", ...lines, "```"].join("\n");

const renderBridgeMethodLines = () =>
	bridgeOperationGroups.map(({ operations }) =>
		Object.values(operations)
			.map((operation) => `\`${operation.route.operationId}\``)
			.join(", "),
	);

const renderBridgeMethodsBlock = () =>
	renderBridgeMethodLines()
		.map((line) => `- ${line}`)
		.join("\n");

export const managedSurfaceBlocks: readonly ManagedBlock[] = [
	{
		content: fencedShell(renderHarpistCliCommandLines("bun run ")),
		end: "<!-- harpist:cli-commands:end -->",
		file: "README.md",
		label: "README CLI commands",
		source: "packages/cli/src/surface.ts",
		start: "<!-- harpist:cli-commands:start -->",
	},
	{
		content: fencedShell(HARPIST_CLI_COMMANDS),
		end: "<!-- harpist:cli-commands:end -->",
		file: "skills/harpist/SKILL.md",
		label: "Harpist skill CLI commands",
		source: "packages/cli/src/surface.ts",
		start: "<!-- harpist:cli-commands:start -->",
	},
	{
		content: renderBridgeMethodsBlock(),
		end: "<!-- harpist:bridge-methods:end -->",
		file: "skills/harpist/SKILL.md",
		label: "Harpist skill bridge methods",
		source: "packages/core/src/bridge-contract.ts",
		start: "<!-- harpist:bridge-methods:start -->",
	},
];

export const managedBlockText = (block: ManagedBlock) =>
	`${block.start}\n${block.content}\n${block.end}`;

const extractManagedBlock = (source: string, block: ManagedBlock) => {
	const startIndex = source.indexOf(block.start);
	if (startIndex === -1) {
		return;
	}
	const endIndex = source.indexOf(block.end, startIndex + block.start.length);
	if (endIndex === -1) {
		return;
	}
	return source.slice(startIndex, endIndex + block.end.length);
};

const syncManagedBlock = (source: string, block: ManagedBlock) => {
	const startIndex = source.indexOf(block.start);
	if (startIndex === -1) {
		return source;
	}
	const endIndex = source.indexOf(block.end, startIndex + block.start.length);
	if (endIndex === -1) {
		return source;
	}
	return `${source.slice(0, startIndex)}${managedBlockText(block)}${source.slice(
		endIndex + block.end.length,
	)}`;
};

const findingForBlock = (block: ManagedBlock): Finding => ({
	advice: `Run bun run pokayoke check --fix to sync ${block.label}.`,
	file: block.file,
	message: `${block.label} are out of sync with ${block.source}.`,
	ruleId: RULE_ID,
	severity: "error",
});

const missingBlockFinding = (block: ManagedBlock): Finding => ({
	advice: `Add ${block.start} / ${block.end} markers around the generated block.`,
	file: block.file,
	message: `${block.label} managed markers are missing or incomplete.`,
	ruleId: RULE_ID,
	severity: "error",
});

export const harpistSurfaceParity: Rule = {
	meta: {
		docs: "Keep README and skill command/method surfaces synced with the CLI and bridge contract.",
		fixable: true,
		id: RULE_ID,
		kind: "project",
	},
	async run(context) {
		const findings: Finding[] = [];
		const nextFiles = new Map<string, string>();

		for (const block of managedSurfaceBlocks) {
			const source =
				nextFiles.get(block.file) ?? (await context.readFile(block.file));
			const actual = extractManagedBlock(source, block);
			const expected = managedBlockText(block);

			if (actual === undefined) {
				findings.push(missingBlockFinding(block));
				continue;
			}
			if (actual === expected) {
				continue;
			}
			if (context.fix) {
				nextFiles.set(block.file, syncManagedBlock(source, block));
				continue;
			}
			findings.push(findingForBlock(block));
		}

		if (context.fix) {
			for (const [file, source] of nextFiles) {
				await Bun.write(`${context.root}/${file}`, source);
			}
		}

		return { findings };
	},
};
