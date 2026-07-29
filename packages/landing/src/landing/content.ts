export const siteLinks = {
	chrome:
		"https://chromewebstore.google.com/detail/harpist/gfdmoknmgjkkhkeoocffiogceamcegmb",
	github: "https://github.com/kenobi-ai/harpist",
	npm: "https://www.npmjs.com/package/harpist",
	skill:
		"https://github.com/kenobi-ai/harpist/blob/main/skills/harpist/SKILL.md",
} as const;

const clipFallbackSrc =
	"https://assets.harpist.kenobi.ai/harpist--screen-2-001-a.mp4";

export type WorkflowClip = {
	alt: string;
	caption: string;
	description: string;
	detail: string;
	fallbackSrc?: string;
	label: string;
	numeral: string;
	src: string;
	title: string;
};

export const workflowClips: WorkflowClip[] = [
	{
		alt: "Harpist browser extension recording a website workflow",
		caption: "fig. ii — the site, caught in the act",
		description:
			"Use a website as normal while the extension captures the network trail behind each click, building up a HAR file for refinement later.",
		detail: "The extension captures interactions via dev tools",
		label: "record",
		numeral: "I.",
		src: clipFallbackSrc,
		title: "Record yourself using a website",
	},
	{
		alt: "Harpist CLI refining a recording into endpoint details",
		caption: "fig. iii — the noise is sifted out",
		description:
			"HAR captures are noisy, which is a perfect fuzzy refinement task for an agent. Endpoints, methods, headers, payload shapes, and the auth are filtered-out via an agent SKILL.",
		detail: "Raw requests get turned into a contract",
		fallbackSrc: "https://assets.harpist.kenobi.ai/step_2_test.webp",
		label: "refine",
		numeral: "II.",
		src: "https://assets.harpist.kenobi.ai/harpist--screen-2-002-a.mp4",
		title: "Refine the useful calls",
	},
	{
		alt: "Harpist generated documentation open in the browser",
		caption: "fig. iv — the generated reference, ready to browse",
		description:
			"As part of the refinement task, an agent can use the Harpist SKILL and CLI to generate a full set of documented endpoints.",
		detail: "Recorded traffic becomes an API reference",
		label: "document",
		numeral: "III.",
		src: "https://assets.harpist.kenobi.ai/harpist--screen-2-003-a.mp4",
		title: "Real, useful documentation",
	},
	{
		alt: "Harpist CLI replaying a captured website operation",
		caption: "fig. v — the same score, played from the terminal",
		description:
			"Once an agent has refined and documented the various endpoints it found, the API contract is saved locally so that it can be accessed -- either interactively or agentically -- through the CLI.",
		detail: "one local interface for people and agents",
		label: "replay",
		numeral: "IV.",
		src: "https://assets.harpist.kenobi.ai/harpist--screen-2-004-a.mp4",
		title: "A CLI to reuse captured endpoints",
	},
];

export const agentSteps = [
	{
		description:
			"Add the Harpist skill so your agent knows how to find recordings, manage the local bridge, test auth, and review the result.",
		numeral: "I.",
		title: "Teach the agent",
	},
	{
		description:
			"Record the website path once in Chrome: sign in, click through the task, then stop the recording.",
		numeral: "II.",
		title: "Play the workflow",
	},
	{
		description:
			"Ask in plain English. The agent refines the latest recording, verifies replay, and writes the contract and docs.",
		numeral: "III.",
		title: "Give the instruction",
	},
] as const;

export const agentOutputs = [
	"contract-profile.json",
	"contract.ts",
	"openapi.json",
	"local docs",
] as const;

export const openSourceLedger = [
	["recorder", "Chrome extension"],
	["bridge", "local service + CLI"],
	["contracts", "oRPC + OpenAPI"],
	["agent prompt", "portable skill + plain text"],
] as const;

export const installSkillCommand = "npx skills add kenobi-ai/harpist";

export const agentPrompt =
	"Use Harpist to refine my latest recording for example.com, verify the authenticated requests, and generate agent-ready docs.";
