import { describe, expect, test } from "bun:test";
import {
	contractProfileFormat,
	contractProfileFormatFindings,
} from "./contract-profile-format.rule";

describe("repo/contract-profile-format", () => {
	test("passes when profile format constants align", async () => {
		const result = await contractProfileFormat.run({} as never);

		expect(result.findings).toHaveLength(0);
	});

	test("reports schema drift", () => {
		const findings = contractProfileFormatFindings({
			format: "harpist.contract-profile",
			jsonSchema: {
				$id: "https://harpist.dev/schemas/contract-profile.v0.json",
				properties: {
					format: { const: "old" },
					version: { const: 0 },
				},
			},
			schemaId: "https://harpist.dev/schemas/contract-profile.v1.json",
			version: 1,
		});

		expect(findings.map((item) => item.message)).toEqual([
			"Contract profile JSON Schema $id is stale.",
			"Contract profile JSON Schema format const is stale.",
			"Contract profile JSON Schema version const is stale.",
		]);
	});
});
