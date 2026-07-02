const HARPIST_CLI_COMMANDS = [
	"harpist bridge",
	"harpist version",
	"harpist profiles list",
	"harpist profiles latest [host]",
	"harpist profiles get <host>",
	"harpist recordings latest [host]",
	"harpist recordings latest [host] --full",
	"harpist recordings get <host> <id> [--full]",
	"harpist refine latest [host]",
	"harpist auth replay <host> [templateKey|operationName]",
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
	["HARPIST_DATA_DIR", "<caller-cwd>/.harpist-data"],
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
	].join("\n");
