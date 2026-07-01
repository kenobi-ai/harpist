import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { noRootSourceFiles } from "./no-root-source-files.rule";

describe("repo/no-root-source-files", () => {
  test("reports source files at the repository root", async () => {
    const root = await mkdtemp(`${tmpdir()}/pokayoke-local-rule-`);

    await mkdir(`${root}/src`, { recursive: true });
    await Bun.write(`${root}/src/index.ts`, "export const value = 1;\n");

    const result = await noRootSourceFiles.run({
      files: async () => [],
      fix: false,
      glob: async () => ["src/index.ts"],
      options: undefined,
      packageJson: async () => ({}),
      parseTypescript: async () => {
        throw new Error("parseTypescript is not used by this rule.");
      },
      readFile: async () => "",
      report: () => {},
      root,
      workspaces: async () => [],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.file).toBe("src/index.ts");
  });
});
