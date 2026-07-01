import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
	harpistSurfaceParity,
	managedBlockText,
	managedSurfaceBlocks,
} from "./harpist-surface-parity.rule";

const writeManagedFiles = async (root: string) => {
	const blocksByFile = new Map<
		string,
		(typeof managedSurfaceBlocks)[number][]
	>();

	for (const block of managedSurfaceBlocks) {
		blocksByFile.set(block.file, [...(blocksByFile.get(block.file) ?? []), block]);
	}

	for (const [file, blocks] of blocksByFile) {
		const path = `${root}/${file}`;
		await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
		await Bun.write(
			path,
			[`# ${file}`, "", ...blocks.map(managedBlockText)].join("\n\n") + "\n",
		);
	}
};

const createContext = (root: string, fix: boolean) => ({
	files: async () => [],
	fix,
	glob: async () => [],
	options: undefined,
	packageJson: async () => ({}),
	parseTypescript: async () => {
		throw new Error("parseTypescript is not used by this rule.");
	},
	readFile: async (file: string) => Bun.file(`${root}/${file}`).text(),
	report: () => {},
	root,
	workspaces: async () => [],
});

describe("repo/harpist-surface-parity", () => {
	test("passes when managed docs match their source surfaces", async () => {
		const root = await mkdtemp(`${tmpdir()}/pokayoke-surface-rule-`);
		await writeManagedFiles(root);

		const result = await harpistSurfaceParity.run(createContext(root, false));

		expect(result.findings).toHaveLength(0);
	});

	test("reports stale managed docs", async () => {
		const root = await mkdtemp(`${tmpdir()}/pokayoke-surface-rule-`);
		await writeManagedFiles(root);
		const readmePath = `${root}/README.md`;
		await Bun.write(
			readmePath,
			(await Bun.file(readmePath).text()).replace(
				"bun run harpist bridge",
				"bun run harpist old-bridge",
			),
		);

		const result = await harpistSurfaceParity.run(createContext(root, false));

		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toBe("README.md");
	});

	test("fixes stale managed docs", async () => {
		const root = await mkdtemp(`${tmpdir()}/pokayoke-surface-rule-`);
		await writeManagedFiles(root);
		const readmePath = `${root}/README.md`;
		await Bun.write(
			readmePath,
			(await Bun.file(readmePath).text()).replace(
				"bun run harpist bridge",
				"bun run harpist old-bridge",
			),
		);

		const result = await harpistSurfaceParity.run(createContext(root, true));
		const readme = await Bun.file(readmePath).text();

		expect(result.findings).toHaveLength(0);
		expect(readme).toContain("bun run harpist bridge");
		expect(readme).not.toContain("old-bridge");
	});
});
