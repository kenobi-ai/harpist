import harpistIllustration from "./assets/logo-illustration.webp";
import { ExternalLink } from "./ExternalLink";
import { LandingFooter } from "./LandingFooter";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

const steps = [
	{
		description:
			"hit record in the extension and use the site like you normally would. harpist captures every request as you go.",
		numeral: "I.",
		title: "record",
	},
	{
		description:
			"the cli sifts the recording — which endpoints matter, how auth works, what the payloads look like.",
		numeral: "II.",
		title: "refine",
	},
	{
		description:
			"then it writes everything down: orpc and openapi contracts, plus docs an agent can read and replay.",
		numeral: "III.",
		title: "scribe",
	},
];

const checklist = [
	"orpc + openapi contracts",
	"docs agents can read",
	"authenticated replay",
	"schemas inferred from real payloads",
	"session auth captured, not configured",
	"local bridge — nothing leaves your machine",
	"plain text files you can commit",
	"har in, codex out",
];

const specifications = [
	["capture", "chrome extension"],
	["bridge", "local worker"],
	["output", "orpc + openapi"],
	["handoff", "agent-ready text"],
	["runtime", "bun or node"],
	["price", "€0"],
];

const commands = [
	"bunx harpist bridge --agent",
	"bunx harpist refine latest example.com",
	"bunx harpist docs example.com",
];

const hairline = "border-stone-900/25";

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
		<main className="min-h-screen bg-stone-300 font-sans text-stone-900 antialiased">
			<div aria-hidden className="h-1.5 bg-red-800" />

			<header className={`sticky top-0 z-10 border-b ${hairline} bg-stone-300`}>
				<div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-xs">
					<a className="font-display text-2xl leading-none" href="/">
						harpist
					</a>
					<nav aria-label="Primary" className="flex items-center gap-4">
						<a className="hidden hover:text-red-800 sm:inline" href="#how">
							how it works
						</a>
						<a className="hidden hover:text-red-800 sm:inline" href="#specs">
							specs
						</a>
						<a className="hover:text-red-800" href="#install">
							install
						</a>
						<a className="hidden hover:text-red-800 md:inline" href="/privacy">
							privacy
						</a>
						<ExternalLink
							className="hover:text-red-800"
							href="https://github.com/kenobi-ai/harpist"
						>
							github ↗
						</ExternalLink>
					</nav>
				</div>
			</header>

			<section className={`border-b ${hairline}`}>
				<div className="mx-auto max-w-6xl px-5">
					<div className="flex items-center justify-between pt-4 text-xs">
						<p>
							<span className="font-bold">HRP–440</span> harpist
						</p>
						<p className="flex items-center gap-2">
							<span className="border border-stone-900 bg-amber-400 px-1.5 py-0.5 font-bold text-[10px] uppercase tracking-wider">
								july beta
							</span>
							€0
						</p>
					</div>
					<div className="relative mt-6 mb-14 flex flex-col items-center pt-4 pb-2 sm:mt-8">
						<span
							aria-hidden
							className="absolute top-0 left-0 size-5 border-red-800 border-t border-l"
						/>
						<span
							aria-hidden
							className="absolute top-0 right-0 size-5 border-red-800 border-t border-r"
						/>
						<span
							aria-hidden
							className="absolute bottom-0 left-0 size-5 border-red-800 border-b border-l"
						/>
						<span
							aria-hidden
							className="absolute right-0 bottom-0 size-5 border-red-800 border-r border-b"
						/>
						<img
							alt="Illuminated-manuscript illustration of a harpist at her instrument"
							className="w-full max-w-[340px] sm:max-w-[400px]"
							height="1024"
							src={harpistIllustration}
							width="1024"
						/>
						<p className="mt-8 font-display text-6xl leading-none sm:text-7xl">
							harpist
						</p>
						<p className="mt-4 pb-6 text-stone-900/60 text-xs italic">
							fig. i — a harpist, playing a HAR file
						</p>
					</div>
				</div>
			</section>

			<section>
				<div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
					<h1 className="max-w-4xl font-bold text-2xl uppercase leading-snug tracking-tight sm:text-4xl">
						Undocumented endpoints, session tokens, gregorian JSON chants and
						punishing payload schemas. Harpist is the first of its kind:{" "}
						<span className="text-red-800">
							the ultimate, and only, medieval API scribe.
						</span>
					</h1>
					<p className="mt-8 max-w-xl text-sm leading-6">
						use any website just like an API. record sessions with the chrome
						extension, replay them with the CLI — easy for agents and humans
						to use. now mount your goat and ship.
					</p>
					<div className="mt-10 flex flex-wrap gap-3">
						<a
							className="inline-flex items-center border border-stone-900 bg-stone-900 px-4 py-2 text-stone-50 text-xs transition hover:bg-stone-900/85"
							href="#install"
						>
							install cli
						</a>
						<a
							className={`inline-flex items-center border ${hairline} px-4 py-2 text-xs transition hover:border-stone-900`}
							href="#how"
						>
							how it works
						</a>
					</div>
				</div>
			</section>

			<section className="bg-sky-900 text-stone-50" id="how">
				<div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
					<p className="text-xs">
						<span aria-hidden className="text-amber-400">
							¶{" "}
						</span>
						how it works
					</p>
					<div className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-6">
						{steps.map((step) => (
							<div
								className="border-stone-50/30 border-t pt-5"
								key={step.title}
							>
								<p className="font-display text-5xl text-amber-300 leading-none">
									{step.numeral}
								</p>
								<h2 className="mt-4 font-bold text-sm">{step.title}</h2>
								<p className="mt-2 max-w-xs text-sm text-stone-50/80 leading-6">
									{step.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="specs">
				<div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:grid-cols-2 sm:py-16">
					<div>
						<p className="text-xs">
							<span aria-hidden className="text-red-800">
								¶{" "}
							</span>
							feature checklist
						</p>
						<ul className="mt-6 max-w-sm text-sm leading-7">
							{checklist.map((item) => (
								<li className="flex gap-2" key={item}>
									<span aria-hidden className="text-red-800">
										–
									</span>
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>
					<div>
						<p className="font-display text-3xl text-red-800 leading-none">
							charakteristica technicum
						</p>
						<dl className={`mt-6 border-t ${hairline}`}>
							{specifications.map(([label, value]) => (
								<div
									className={`grid grid-cols-[110px_1fr] gap-4 border-b ${hairline} py-2.5 text-sm`}
									key={label}
								>
									<dt className="text-stone-900/60">{label}</dt>
									<dd>{value}</dd>
								</div>
							))}
						</dl>
					</div>
				</div>
			</section>

			<section className="bg-stone-900 text-stone-50" id="install">
				<div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
					<p className="text-xs">
						<span aria-hidden className="text-amber-400">
							¶{" "}
						</span>
						install
					</p>
					<h2 className="mt-6 max-w-2xl font-bold text-xl uppercase leading-snug tracking-tight sm:text-2xl">
						Three commands and you&rsquo;re away.
					</h2>
					<p className="mt-3 max-w-lg text-sm text-stone-50/75 leading-6">
						start the bridge, refine your latest recording, open the docs.
						everything runs on your machine.
					</p>
					<div className="mt-8 max-w-2xl border border-stone-50/20 bg-stone-950 p-5">
						{commands.map((command) => (
							<pre
								className="overflow-x-auto py-1.5 font-mono text-amber-300 text-xs sm:text-sm"
								key={command}
							>
								<code>
									<span className="select-none text-stone-50/40">$ </span>
									{command}
								</code>
							</pre>
						))}
					</div>
					<div className="mt-8 flex flex-wrap gap-3">
						<ExternalLink
							className="inline-flex items-center border border-amber-400 bg-amber-400 px-4 py-2 font-bold text-stone-900 text-xs transition hover:bg-amber-300"
							href="https://github.com/kenobi-ai/harpist"
						>
							github ↗
						</ExternalLink>
						<ExternalLink
							className="inline-flex items-center border border-stone-50/60 px-4 py-2 text-stone-50 text-xs transition hover:border-stone-50"
							href="https://www.npmjs.com/package/harpist"
						>
							npm ↗
						</ExternalLink>
					</div>
				</div>
			</section>

			<LandingFooter />
		</main>
	);
}
