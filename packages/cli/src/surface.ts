const HARPIST_CLI_COMMANDS = [
	"harpist bridge [--agent] [--idle-timeout <duration>]",
	"harpist version",
	"harpist purge",
	"harpist profiles list",
	"harpist profiles latest [host]",
	"harpist profiles get <host>",
	"harpist recordings latest [host]",
	"harpist recordings latest [host] --full",
	"harpist recordings get <host> <id> [--full]",
	"harpist refine latest [host]",
	"harpist auth replay <host> [templateKey|operationName] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl]",
	"harpist contract-profile get <host>",
	"harpist contract get <host>",
	"harpist openapi get <host>",
	"harpist docs <host>",
	"harpist docs apply <host> <docs.json|->",
	"harpist docs review <host>",
	"harpist handoff [host]",
] as const;

const HARPIST_CLI_ENVIRONMENT = [
	["HARPIST_PORT", "4277"],
	["HARPIST_HOST", "127.0.0.1"],
	["HARPIST_DATA_DIR", "~/.harpist-data"],
] as const;

export const renderHarpistCliCommandLines = (prefix = "") =>
	HARPIST_CLI_COMMANDS.map((command) => `${prefix}${command}`);

export const renderHarpistCliUsage = () =>
	[
		"Usage:",
		...renderHarpistCliCommandLines("  "),
		"",
		"Environment:",
		...HARPIST_CLI_ENVIRONMENT.map(
			([name, defaultValue]) => `  ${name.padEnd(18)}default ${defaultValue}`,
		),
		"",
		"Bridge:",
		"  --agent              mark the bridge as agent-started and default idle timeout to 15m",
		"  --idle-timeout       stop after no bridge HTTP traffic for a duration like 30s, 15m, or 1h",
	].join("\n");
