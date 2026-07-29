const HARPIST_CLI_COMMANDS = [
	"harpist bridge [--agent] [--idle-timeout <duration>]",
	"harpist version",
	"harpist purge",
	"harpist profiles list [--output <path>] [--force]",
	"harpist profiles latest [host] [--output <path>] [--force]",
	"harpist profiles get <host> [--output <path>] [--force]",
	"harpist recordings latest [host] [--full] [--output <path>] [--force]",
	"harpist recordings get <host> <id> [--full] [--output <path>] [--force]",
	"harpist refine latest [host]",
	"harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose] [--yes]",
	"harpist auth list [host] [--json]",
	"harpist auth use [host] [credentialId|--clear]",
	"harpist auth check [host] [credentialId] [--all] [--json]",
	"harpist auth login [host] [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]",
	"harpist auth set-login-url [host] [url]",
	"harpist endpoints upsert <host> <endpoint.json|->",
	"harpist endpoints remove <host> <templateKey>",
	"harpist contract-profile get <host> [--output <path>] [--force]",
	"harpist contract get <host> [--output <path>] [--force]",
	"harpist openapi get <host> [--output <path>] [--force]",
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
