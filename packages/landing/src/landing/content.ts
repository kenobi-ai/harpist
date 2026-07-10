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
			"use the website normally while the extension captures the network trail behind each click, form submit, and authenticated request.",
		detail: "raw interaction becomes a replayable HAR",
		label: "record",
		numeral: "I.",
		src: clipFallbackSrc,
		title: "Record the real workflow",
	},
	{
		alt: "Harpist CLI refining a recording into endpoint details",
		caption: "fig. iii — the noise is sifted out",
		description:
			"the cli pulls signal out of the recording: endpoints, methods, headers, payload shapes, and the auth path an agent needs.",
		detail: "requests settle into a contract",
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
			"open the generated docs to browse every useful operation, observed parameter, response schema, and replay command in one place.",
		detail: "real traffic becomes a navigable API reference",
		label: "document",
		numeral: "III.",
		src: "https://assets.harpist.kenobi.ai/harpist--screen-2-003-a.mp4",
		title: "View the docs",
	},
	{
		alt: "Harpist CLI replaying a captured website operation",
		caption: "fig. v — the same score, played from the terminal",
		description:
			"agents and humans use the same cli to inspect profiles, replay authenticated calls, and bring generated contracts into a project.",
		detail: "one local interface for people and agents",
		label: "replay",
		numeral: "IV.",
		src: "https://assets.harpist.kenobi.ai/harpist--screen-2-004-a.mp4",
		title: "Use the CLI",
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
	["agent handoff", "portable skill + plain text"],
] as const;

export const installSkillCommand = "npx skills add kenobi-ai/harpist";

export const agentPrompt =
	"Use Harpist to refine my latest recording for example.com, verify the authenticated requests, and generate agent-ready docs.";
