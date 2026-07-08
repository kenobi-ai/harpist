import {
	GoogleChromeLogoIcon,
	NumberCircleOneIcon,
	NumberCircleTwoIcon,
} from "@phosphor-icons/react";
import harpistIllustration from "./assets/logo-illustration.webp";
import SideRays from "./components/backgrounds/side-rays";
import {
	GlyphStrip,
	MedievalDefs,
	Ornament,
	ParchmentScrap,
	ScrollBand,
	WavyFrame,
} from "./components/medieval";
import { ExternalLink } from "./ExternalLink";
import { LandingFooter } from "./LandingFooter";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";
import { ShellCommand } from "./ShellCommand";

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

const checklistGlyphs = ["✥", "☞", "☙", "✣"];

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

const hairline = "border-ink/25";

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
		<main className="parchment min-h-screen bg-olive-100 font-sans text-ink antialiased">
			<MedievalDefs />
			<div aria-hidden className="h-1.5 bg-rubric" />

			<header
				className={`parchment sticky top-0 z-20 border-b ${hairline} bg-olive-300`}
			>
				<div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-xs">
					<a className="font-display text-2xl leading-none" href="/">
						harpist
					</a>
					<nav aria-label="Primary" className="flex items-center gap-4">
						<a className="hidden hover:text-rubric sm:inline" href="#how">
							how it works
						</a>
						<a className="hidden hover:text-rubric sm:inline" href="#specs">
							specs
						</a>
						<a className="hover:text-rubric" href="#install">
							☞ install
						</a>
						<a className="hidden hover:text-rubric md:inline" href="/privacy">
							privacy
						</a>
						<ExternalLink
							className="hover:text-rubric"
							href="https://github.com/kenobi-ai/harpist"
						>
							github ↗
						</ExternalLink>
					</nav>
				</div>
			</header>

			<section className="relative overflow-hidden">
				<div className="absolute inset-0 z-0 bg-linear-to-b from-stone-950 to-stone-800">
					{/*<SideRays
						speed={1.8}
						rayColor1="#9E0812"
						rayColor2="#ffaaaa"
						intensity={2}
						spread={2}
						origin="top-right"
						tilt={0}
						saturation={1.5}
						blend={0.75}
						falloff={1.6}
						opacity={1}
					/>*/}
				</div>
				<div className="relative z-10 mx-auto max-w-6xl px-5">
					<div className="flex items-center justify-between pt-6 text-xs">
						<p className="hidden font-marginalia italic text-ink/60 text-sm sm:block"></p>
						<ParchmentScrap className="-rotate-2 mr-4" soft>
							<span className="block px-3 py-1 font-display text-lg leading-none">
								✠ July beta ✠
							</span>
						</ParchmentScrap>
					</div>
					<div className="mt-8 mb-14 grid grid-cols-1 gap-10 sm:grid-cols-4 sm:gap-28 perspective-normal">
						<div className="flex flex-col justify-center gap-6 sm:col-span-2 text-amber-50">
							<p className="relative font-display text-5xl leading-none">
								<span className="text-red-400">H</span>arpist
							</p>
							<h1 className="w-full font-bold font-heading text-6xl leading-tight tracking-tight">
								<span className="text-amber-50">Automate</span>
								<span> </span>
								<span className="text-red-400">any website interaction</span>
							</h1>
							<div className="flex flex-col justify-start gap-6">
								<p>
									The two ingredients required to never manually run workflows
									again:
								</p>
								<div className="flex w-full flex-col items-start gap-4">
									<div className="flex flex-col items-start gap-2">
										<h3 className="inline-flex items-center gap-2 font-heading text-xl">
											<NumberCircleOneIcon
												className="size-6 text-red-400"
												weight="duotone"
											/>{" "}
											Browser extension
										</h3>
										<ExternalLink
											href="https://google.com"
											className="group relative ml-8 inline-flex cursor-pointer items-center"
										>
											<span
												aria-hidden
												className="wavy-frame-soft absolute inset-0 rounded-xl border-2 border-oxblood bg-red-800 transition group-hover:bg-red-700"
											/>
											<span className="relative z-10 inline-flex items-center gap-2 pr-5 py-3 pl-4 font-medium text-red-50 text-lg leading-5 font-heading">
												<GoogleChromeLogoIcon
													aria-hidden
													className="shrink-0 text-red-200"
													size={18}
													weight="duotone"
												/>
												<span>Install</span>
											</span>
										</ExternalLink>
									</div>
									<div className="flex flex-col items-start gap-2">
										<h3 className="inline-flex items-center gap-2 font-heading text-xl">
											<NumberCircleTwoIcon
												className="size-6 text-red-400"
												weight="duotone"
											/>{" "}
											Agent skill
										</h3>
										<ShellCommand
											command="npx skills add kenobi-ai/harpist"
											className="ml-8 w-full"
										/>
									</div>
								</div>
							</div>
						</div>
						<div className="relative flex transform-3d flex-col items-center pt-4 pb-2 sm:col-span-2 justify-center">
							<div
								aria-hidden
								className="parchment-scrap absolute inset-0 border border-red-800"
							/>
							<img
								alt="Illuminated-manuscript illustration of a harpist at her instrument"
								className="relative z-10 w-full max-w-[340px] mix-blend-multiply sm:max-w-[400px]"
								height="1024"
								src={harpistIllustration}
								width="1024"
							/>

							<p className="relative z-10 mt-4 pb-6 font-marginalia italic text-ink/60 text-sm">
								fig. i — a harpist, playing a HAR file
							</p>
						</div>
					</div>
				</div>
			</section>

			<section>
				<div className="mx-auto max-w-6xl px-5 pt-2">
					<Ornament className="text-ink/70" set="planetary" />
				</div>
				<div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
					<h1 className="max-w-4xl font-bold text-2xl uppercase leading-snug tracking-tight sm:text-4xl">
						Undocumented endpoints, session tokens, gregorian JSON chants and
						punishing payload schemas. Harpist is the first of its kind:{" "}
						<span className="text-rubric">
							the ultimate, and only, medieval API scribe.
						</span>
					</h1>
					<p className="drop-cap mt-8 max-w-xl text-sm leading-6">
						Use any website just like an API. record sessions with the chrome
						extension, replay them with the CLI — easy for agents and humans to
						use. now mount your goat and ship.
					</p>
					<div className="mt-10 flex flex-wrap gap-3">
						<a
							className="group relative inline-flex items-center"
							href="#install"
						>
							<span
								aria-hidden
								className="wavy-frame-soft absolute inset-0 rounded-xl border-2 border-oxblood bg-ink transition group-hover:bg-ink/85"
							/>
							<span className="relative z-10 inline-flex items-center gap-2 px-5 py-2.5 text-olive-50 text-xs">
								<span aria-hidden>☞</span> install cli
							</span>
						</a>
						<a className="group relative inline-flex items-center" href="#how">
							<span
								aria-hidden
								className="wavy-frame-soft absolute inset-0 rounded-xl border-2 border-oxblood/60 transition group-hover:border-oxblood"
							/>
							<span className="relative z-10 px-5 py-2.5 text-xs">
								how it works
							</span>
						</a>
					</div>
					<p className="mt-6 font-marginalia italic text-ink/60 text-sm">
						☞ nota bene: thy recordings never leave thy machine.
					</p>
				</div>
			</section>

			<ScrollBand />

			<section id="how">
				<div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
					<p className="font-marginalia italic text-sm">
						<span aria-hidden className="text-rubric">
							¶{" "}
						</span>
						modus operandi
					</p>
					<h2 className="mt-4 font-display text-4xl text-rubric sm:text-5xl">
						how it works
					</h2>
					<div className="mt-10 grid gap-8 sm:grid-cols-3">
						{steps.map((step) => (
							<WavyFrame key={step.title}>
								<div className="p-7">
									<p className="font-display text-6xl text-rubric leading-none">
										{step.numeral}
									</p>
									<h3 className="mt-4 font-bold text-sm uppercase tracking-wide">
										{step.title}
									</h3>
									<p className="mt-2 text-ink/80 text-sm leading-6">
										{step.description}
									</p>
								</div>
							</WavyFrame>
						))}
					</div>
					<GlyphStrip className="mt-14 text-rubric/70" set="stars" />
				</div>
			</section>

			<section id="specs">
				<div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
					<WavyFrame frameClassName="rounded-[3rem] border-[2.5px] border-oxblood bg-olive-50/70">
						<div className="grid gap-12 p-8 sm:grid-cols-2 sm:p-12">
							<div>
								<p className="font-marginalia italic text-sm">
									<span aria-hidden className="text-rubric">
										¶{" "}
									</span>
									feature checklist
								</p>
								<p className="mt-2 font-display text-3xl text-rubric leading-none">
									medieval illuminations
								</p>
								<ul className="mt-6 max-w-sm text-sm leading-7">
									{checklist.map((item, index) => (
										<li className="flex gap-2" key={item}>
											<span aria-hidden className="w-4 shrink-0 text-rubric">
												{checklistGlyphs[index % checklistGlyphs.length]}
											</span>
											<span>{item}</span>
										</li>
									))}
								</ul>
							</div>
							<div>
								<p className="font-marginalia italic text-sm">
									<span aria-hidden className="text-rubric">
										¶{" "}
									</span>
									specifications
								</p>
								<p className="mt-2 font-display text-3xl text-rubric leading-none">
									charakteristica technicum{" "}
									<span aria-hidden className="text-ink/40">
										❦
									</span>
								</p>
								<dl className={`mt-6 border-t ${hairline} border-dotted`}>
									{specifications.map(([label, value]) => (
										<div
											className={`grid grid-cols-[110px_1fr] gap-4 border-b ${hairline} border-dotted py-2.5 text-sm`}
											key={label}
										>
											<dt className="font-marginalia italic text-ink/60">
												{label}
											</dt>
											<dd>{value}</dd>
										</div>
									))}
								</dl>
							</div>
						</div>
					</WavyFrame>
				</div>
			</section>

			<ScrollBand />

			<section className="bg-stone-900 text-stone-50" id="install">
				<div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
					<p className="font-marginalia italic text-sm">
						<span aria-hidden className="text-amber-400">
							¶{" "}
						</span>
						install
					</p>
					<h2 className="mt-4 font-display text-4xl text-amber-300">
						installatio
					</h2>
					<p className="mt-4 max-w-2xl font-bold text-xl uppercase leading-snug tracking-tight sm:text-2xl">
						Three commands and you&rsquo;re away.
					</p>
					<p className="mt-3 max-w-lg text-sm text-stone-50/75 leading-6">
						start the bridge, refine your latest recording, open the docs.
						everything runs on your machine.
					</p>
					<div className="mt-8 flex max-w-2xl flex-col gap-2">
						{commands.map((command) => (
							<ShellCommand command={command} key={command} tone="dark" />
						))}
					</div>
					<div className="mt-8 flex flex-wrap gap-3">
						<ExternalLink
							className="group relative inline-flex items-center"
							href="https://github.com/kenobi-ai/harpist"
						>
							<span
								aria-hidden
								className="wavy-frame-soft absolute inset-0 rounded-xl bg-amber-400 transition group-hover:bg-amber-300"
							/>
							<span className="relative z-10 px-5 py-2.5 font-bold text-stone-900 text-xs">
								github ↗
							</span>
						</ExternalLink>
						<ExternalLink
							className="group relative inline-flex items-center"
							href="https://www.npmjs.com/package/harpist"
						>
							<span
								aria-hidden
								className="wavy-frame-soft absolute inset-0 rounded-xl border-2 border-stone-50/60 transition group-hover:border-stone-50"
							/>
							<span className="relative z-10 px-5 py-2.5 text-stone-50 text-xs">
								npm ↗
							</span>
						</ExternalLink>
					</div>
					<GlyphStrip className="mt-14 text-amber-300/50" set="ornament" />
				</div>
			</section>

			<LandingFooter />
		</main>
	);
}
