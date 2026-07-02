import type { Finding, Rule } from "pokayoke";
import {
	CONTRACT_PROFILE_FORMAT,
	CONTRACT_PROFILE_JSON_SCHEMA,
	CONTRACT_PROFILE_SCHEMA_ID,
	CONTRACT_PROFILE_VERSION,
} from "../../packages/core/src/site-contract-profile";

const RULE_ID = "repo/contract-profile-format";
const FILE = "packages/core/src/site-contract-profile-schema.ts";

type ContractProfileFormatSurface = {
	format: string;
	jsonSchema: {
		$id?: unknown;
		properties?: {
			format?: { const?: unknown };
			version?: { const?: unknown };
		};
	};
	schemaId: string;
	version: number;
};

const finding = (message: string): Finding => ({
	advice:
		"Keep CONTRACT_PROFILE_* constants and CONTRACT_PROFILE_JSON_SCHEMA in sync.",
	file: FILE,
	message,
	ruleId: RULE_ID,
	severity: "error",
});

export const contractProfileFormatFindings = (
	surface: ContractProfileFormatSurface = {
		format: CONTRACT_PROFILE_FORMAT,
		jsonSchema: CONTRACT_PROFILE_JSON_SCHEMA,
		schemaId: CONTRACT_PROFILE_SCHEMA_ID,
		version: CONTRACT_PROFILE_VERSION,
	},
) => {
	const findings: Finding[] = [];
	if (surface.jsonSchema.$id !== surface.schemaId) {
		findings.push(finding("Contract profile JSON Schema $id is stale."));
	}
	if (surface.jsonSchema.properties?.format?.const !== surface.format) {
		findings.push(
			finding("Contract profile JSON Schema format const is stale."),
		);
	}
	if (surface.jsonSchema.properties?.version?.const !== surface.version) {
		findings.push(
			finding("Contract profile JSON Schema version const is stale."),
		);
	}
	if (!surface.schemaId.includes(`v${surface.version}.json`)) {
		findings.push(
			finding("Contract profile schema id does not include its version."),
		);
	}
	return findings;
};

export const contractProfileFormat: Rule = {
	meta: {
		docs: "Keep the Harpist contract profile schema id, format string, and version constants aligned.",
		id: RULE_ID,
		kind: "project",
	},
	async run() {
		return {
			findings: contractProfileFormatFindings(),
		};
	},
};
