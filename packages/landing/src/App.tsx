import {
	ArrowRightIcon,
	CheckCircleIcon,
	FeatherIcon,
	FunnelIcon,
	GithubLogoIcon,
	PackageIcon,
	RecordIcon,
} from "@phosphor-icons/react";
import harpistSprite from "./assets/logo-illustration.webp";
import { ExternalLink } from "./ExternalLink";
import { LandingFooter } from "./LandingFooter";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

const workflow = [
	{
		description:
			"Hit record in the extension and use the site like you normally would. Harpist captures every request as you go.",
		icon: RecordIcon,
		numeral: "I.",
		title: "Record",
	},
	{
		description:
			"The CLI sifts the recording — which endpoints matter, how auth works, what the payloads look like.",
		icon: FunnelIcon,
		numeral: "II.",
		title: "Refine",
	},
	{
		description:
			"Then it writes everything down: oRPC and OpenAPI contracts, plus docs an agent can read and replay.",
		icon: FeatherIcon,
		numeral: "III.",
		title: "Scribe",
	},
];

const outputs = [
	"oRPC + OpenAPI contracts",
	"Docs agents can read",
	"Authenticated replay",
	"Plain files you can commit",
];

const instrumentBanks = [
	["traffic", "recorded"],
	["auth", "captured"],
	["schemas", "inferred"],
	["docs", "written"],
];

const specifications = [
	["capture", "chrome extension"],
	["bridge", "local worker"],
	["output", "orpc + openapi"],
	["handoff", "agent-ready text"],
];

const commands = [
	"bunx harpist bridge --agent",
	"bunx harpist refine latest example.com",
	"bunx harpist docs example.com",
];

const currentPath = () => {
	if (typeof window === "undefined") {
		return "/";
	}
	return window.location.pathname.replace(/\/+$/, "") || "/";
};

export function App() {
	if (currentPath() === "/privacy") {
		return <PrivacyPolicyPage />;
	}
	return <LandingPage />;
}

function LandingPage() {
	return (
		<main className="min-h-screen bg-parchment font-sans text-ink">
			<div aria-hidden className="h-1.5 bg-rubric" />

			<section className="ruled border-ink border-b-2">
				<div className="mx-auto grid min-h-[92svh] max-w-7xl grid-rows-[auto_1fr_auto] px-4 py-4 sm:px-7 lg:px-9">
					<header className="flex items-center justify-between gap-3 border-ink border-y-2 bg-vellum px-3 py-2 text-xs uppercase sm:grid sm:grid-cols-[1fr_auto_1fr]">
						<a
							aria-label="Harpist home"
							className="inline-flex items-center gap-2 font-bold tracking-widest"
							href="/"
						>
							<span className="grid size-8 place-items-center border-2 border-ink bg-gold font-display text-2xl leading-none tracking-normal">
								H
							</span>
							<span>Harpist</span>
						</a>
						<p className="hidden justify-self-center font-display text-2xl normal-case sm:block"></p>
						<nav
							aria-label="Primary"
							className="flex items-center gap-2 justify-self-start sm:justify-self-end"
						>
							<a
								className="hidden border-2 border-transparent px-2 py-1 font-bold hover:border-ink sm:inline-flex"
								href="#workflow"
							>
								Workflow
							</a>
							<a
								className="hidden border-2 border-transparent px-2 py-1 font-bold hover:border-ink sm:inline-flex"
								href="#install"
							>
								Install
							</a>
							<a
								className="hidden border-2 border-transparent px-2 py-1 font-bold hover:border-ink md:inline-flex"
								href="/privacy"
							>
								Privacy
							</a>
							<ExternalLink
								className="inline-flex min-h-9 items-center justify-center border-2 border-ink bg-ink px-3 font-bold text-cream transition hover:-translate-y-0.5"
								href="https://github.com/kenobi-ai/harpist"
							>
								GitHub
							</ExternalLink>
						</nav>
					</header>

					<div className="grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-10">
						<div className="max-w-3xl">
							<p className="max-w-max border-2 border-ink bg-gold px-2 py-1 font-bold text-xs uppercase tracking-widest">
								July Beta Release
							</p>
							<h1 className="mt-6 font-display text-8xl leading-[0.8] sm:text-9xl lg:text-[11rem]">
								<span className="text-rubric">H</span>arpist
							</h1>
							<p className="mt-7 max-w-2xl text-2xl text-ink/85 leading-9 sm:text-3xl sm:leading-11">
								Use any website just like an API with Harpist. Record sessions
								with our Chrome extension, and replay them with our CLI. Easy
								for agents and humans to use.
							</p>
							<div className="mt-9 flex flex-wrap gap-3">
								<a
									className="inline-flex min-h-12 items-center justify-center gap-2 border-2 border-ink bg-ink px-4 font-bold text-cream text-sm uppercase tracking-wider shadow-[4px_4px_0_var(--color-rubric)] transition hover:-translate-y-0.5"
									href="#install"
								>
									<span>Install the CLI</span>
									<ArrowRightIcon aria-hidden size={18} weight="bold" />
								</a>
								<a
									className="inline-flex min-h-12 items-center justify-center border-2 border-ink bg-vellum px-4 font-bold text-ink text-sm uppercase tracking-wider transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--color-ink)]"
									href="#workflow"
								>
									<span>How it works</span>
								</a>
							</div>
						</div>

						<div className="mx-auto grid w-full max-w-[420px] gap-3">
							<figure className="border-2 border-ink bg-vellum p-2 shadow-[10px_10px_0_var(--color-ink)]">
								<div className="border border-rubric/70 p-4">
									<img
										alt="Illuminated-manuscript illustration of a harpist at her instrument"
										className="mx-auto aspect-square w-full max-w-[300px] object-contain"
										height="512"
										src={harpistSprite}
										width="512"
									/>
								</div>
								<figcaption className="border-rubric/70 border-t px-2 pt-2 pb-1 text-center text-ink/70 text-sm italic">
									fig. i — a harpist, playing a HAR file
								</figcaption>
							</figure>
							<div className="grid grid-cols-4 border-2 border-ink bg-ink text-center text-cream text-xs uppercase">
								{instrumentBanks.map(([label, value]) => (
									<div
										className="border-cream/30 border-r p-2 last:border-r-0"
										key={label}
									>
										<p className="font-bold">{label}</p>
										<p className="mt-1 text-gold">{value}</p>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="grid gap-2 border-ink border-t-2 pt-3 pb-5 sm:grid-cols-2 lg:grid-cols-4">
						{outputs.map((output) => (
							<div
								className="flex items-center gap-2 border-2 border-ink bg-vellum px-3 py-2 text-sm uppercase"
								key={output}
							>
								<CheckCircleIcon
									aria-hidden
									className="shrink-0 text-lapis"
									size={17}
									weight="fill"
								/>
								<span>{output}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section
				className="border-ink border-b-2 bg-lapis text-cream"
				id="workflow"
			>
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-7 lg:grid-cols-[320px_1fr] lg:px-9">
					<div>
						<p className="border-cream border-y-2 py-2 font-bold text-xs uppercase tracking-widest">
							<span aria-hidden className="text-gold">
								¶{" "}
							</span>
							How it works
						</p>
						<h2 className="mt-5 font-display text-6xl leading-none">
							From clicks to contracts.
						</h2>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{workflow.map((step) => {
							const Icon = step.icon;
							return (
								<article
									className="border-2 border-ink bg-vellum p-5 text-ink shadow-[6px_6px_0_var(--color-ink)]"
									key={step.title}
								>
									<div className="flex items-start justify-between">
										<span className="font-display text-6xl text-rubric leading-none">
											{step.numeral}
										</span>
										<Icon
											aria-hidden
											className="mt-1 text-lapis"
											size={26}
											weight="bold"
										/>
									</div>
									<h3 className="mt-4 font-bold text-lg uppercase tracking-wider">
										{step.title}
									</h3>
									<p className="mt-2 text-ink/80 leading-7">
										{step.description}
									</p>
								</article>
							);
						})}
					</div>
				</div>
			</section>

			<section
				className="border-ink border-b-2 bg-parchment"
				id="specifications"
			>
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-7 lg:grid-cols-[1fr_560px] lg:px-9">
					<div>
						<p className="border-ink border-y-2 py-2 font-bold text-xs uppercase tracking-widest">
							<span aria-hidden className="text-rubric">
								¶{" "}
							</span>
							Specifications
						</p>
						<h2 className="mt-5 font-display text-6xl text-rubric leading-none">
							A small machine with no secrets.
						</h2>
						<p className="mt-5 max-w-xl text-ink/85 text-xl leading-8">
							Three parts: the extension records, a local bridge hands
							recordings to the CLI, and the CLI turns them into contracts.
							Everything comes out as plain text — read it, diff it, commit it.
						</p>
					</div>
					<div className="self-center border-2 border-ink bg-vellum">
						{specifications.map(([label, value]) => (
							<div
								className="grid grid-cols-[130px_1fr] border-ink border-b-2 last:border-b-0"
								key={label}
							>
								<p className="border-ink border-r-2 bg-ink px-3 py-3 font-bold text-cream text-xs uppercase tracking-widest">
									{label}
								</p>
								<p className="px-3 py-3 font-bold uppercase">{value}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="bg-ink text-cream" id="install">
				<div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-7 lg:grid-cols-[1fr_520px] lg:px-9">
					<div>
						<p className="border-gold border-y-2 py-2 font-bold text-gold text-xs uppercase tracking-widest">
							<span aria-hidden>¶ </span>
							Install
						</p>
						<h2 className="mt-5 max-w-xl font-display text-6xl leading-none">
							Three commands and you&rsquo;re away.
						</h2>
						<p className="mt-5 max-w-xl text-cream/75 text-xl leading-8">
							Start the bridge, refine your latest recording, open the docs.
							Everything runs on your machine.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<ExternalLink
								className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-gold bg-gold px-4 font-bold text-ink text-sm uppercase tracking-wider transition hover:-translate-y-0.5"
								href="https://github.com/kenobi-ai/harpist"
							>
								<GithubLogoIcon aria-hidden size={18} weight="bold" />
								<span>GitHub</span>
							</ExternalLink>
							<ExternalLink
								className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-cream px-4 font-bold text-cream text-sm uppercase tracking-wider transition hover:-translate-y-0.5"
								href="https://www.npmjs.com/package/harpist"
							>
								<PackageIcon aria-hidden size={18} weight="bold" />
								<span>npm</span>
							</ExternalLink>
						</div>
					</div>
					<div className="min-w-0 self-center border-2 border-cream/80 bg-[#241f19] p-4">
						{commands.map((command) => (
							<pre
								className="overflow-x-auto border-cream/20 border-b py-4 font-mono text-gold text-sm last:border-b-0"
								key={command}
							>
								<code>
									<span className="select-none text-cream/40">$ </span>
									{command}
								</code>
							</pre>
						))}
					</div>
				</div>
			</section>

			<LandingFooter />
		</main>
	);
}
