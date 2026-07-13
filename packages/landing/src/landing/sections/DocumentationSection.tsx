import generatedDocsScreenshot from "../../assets/generated-docs.webp";
import { Ornament, WavyFrame } from "../../components/medieval";

const documentationFeatures = [
	{
		description:
			"Operations are grouped by feature, with summaries that explain what each captured call does.",
		numeral: "I.",
		title: "Browse by group",
	},
	{
		description:
			"Path and query parameters sit beside request and response schemas inferred from the recording.",
		numeral: "II.",
		title: "Full, annotated request shapes",
	},
	{
		description:
			"Each operation includes a Harpist replay command that applies the latest captured browser auth locally.",
		numeral: "III.",
		title: "Direct replay",
	},
] as const;

export function DocumentationSection() {
	return (
		<section aria-labelledby="docs-title" className="scroll-mt-12" id="docs">
			<div className="mx-auto max-w-6xl px-5 pb-20 pt-4 sm:pb-24 sm:pt-8">
				<Ornament className="text-ink/70" set="stars" />

				<div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
					<div>
						<p className="font-display text-3xl leading-none">
							<span className="text-red-700">iii.</span> scriptorium
						</p>
						<h2
							className="mt-3 max-w-3xl font-bold font-heading text-4xl leading-tight tracking-tight sm:text-5xl"
							id="docs-title"
						>
							Generated documentation,{" "}
							<span className="text-rubric">ready to use.</span>
						</h2>
					</div>
					<p className="max-w-xl text-ink/75 leading-7 lg:justify-self-end">
						<span className="drop-cap">H</span>arpist turns the captured traffic
						into a browsable API reference: grouped operations, observed inputs,
						response schemas, and the local replay command beside every call.
					</p>
				</div>

				<WavyFrame
					className="mt-12"
					frameClassName="rounded-[2.25rem] border-oxblood bg-stone-900"
				>
					<figure className="p-3 sm:p-4">
						<div className="relative overflow-hidden rounded-[1.6rem] border-2 border-ink bg-olive-50">
							<img
								alt="Generated Harpist API documentation showing grouped operations, recorded parameters, a replay command, and a response schema"
								className="block h-auto w-full"
								height="1384"
								loading="lazy"
								src={generatedDocsScreenshot}
								width="2400"
							/>
							<div
								aria-hidden
								className="pointer-events-none absolute inset-0 ring-1 ring-white/15 ring-inset"
							/>
						</div>
						<figcaption className="mt-3 text-center font-marginalia italic text-olive-50/70 text-sm">
							fig. vi — generated docs for a recorded website
						</figcaption>
					</figure>
				</WavyFrame>

				<div className="mt-12 grid border-ink/25 border-y border-dotted sm:grid-cols-3">
					{documentationFeatures.map((feature) => (
						<article
							className="border-ink/25 border-b border-dotted py-6 last:border-b-0 sm:border-r sm:border-b-0 sm:px-7 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
							key={feature.title}
						>
							<p className="font-display text-3xl text-rubric leading-none">
								{feature.numeral}
							</p>
							<h3 className="mt-3 font-heading text-2xl leading-tight sm:leading-none">
								{feature.title}
							</h3>
							<p className="mt-3 text-ink/70 text-sm leading-6">
								{feature.description}
							</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
