import { GitForkIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { GlyphStrip, ScrollPanel, WavyFrame } from "../../components/medieval";
import { openSourceLedger, siteLinks } from "../content";
import { ManuscriptLink } from "../ManuscriptLink";

export function OpenSourceSection() {
	return (
		<section
			aria-labelledby="open-source-title"
			className="scroll-mt-12"
			id="open-source"
		>
			<div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
				<div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-20">
					<div>
						<p className="font-display text-3xl leading-none mb-8">
							<span className="text-red-700">v.</span> codex publicus
						</p>
						<ScrollPanel
							insetClassName="-mx-6 -my-3 sm:-inset-x-8 sm:-inset-y-9"
							panelClassName="bg-stone-100"
						>
							<div className="px-3 py-6">
								<h1
									className="w-full font-bold font-heading text-5xl text-amber-950 leading-tight tracking-tight sm:text-6xl"
									id="hero-title"
								>
									Harpist is open source.
								</h1>
							</div>
						</ScrollPanel>

						<p className="drop-cap mt-14 max-w-xl text-lg leading-8">
							Every moving part lives in public: the Chrome recorder, local
							bridge, CLI, contract pipeline, and the agent skill. Read the
							code, follow development, or bring a sharp issue.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<ManuscriptLink external href={siteLinks.github} tone="ink">
								<GithubLogoIcon aria-hidden size={18} weight="duotone" />
								browse the source ↗
							</ManuscriptLink>
							<ManuscriptLink external href={siteLinks.npm} tone="crimson">
								view the package ↗
							</ManuscriptLink>
						</div>
					</div>

					<WavyFrame frameClassName="rounded-[3rem] border-oxblood bg-olive-50/75">
						<div className="p-8 sm:p-10">
							<div className="flex items-center gap-3 text-rubric">
								<GitForkIcon aria-hidden size={30} weight="duotone" />
								<div>
									<p className="font-marginalia italic text-ink/60 text-sm">
										the whole instrument
									</p>
									<p className="font-display text-3xl leading-none">
										one public repository
									</p>
								</div>
							</div>
							<dl className="mt-7 border-ink/25 border-t border-dotted">
								{openSourceLedger.map(([label, value]) => (
									<div
										className="grid grid-cols-[7rem_1fr] gap-4 border-ink/25 border-b border-dotted py-3 text-sm"
										key={label}
									>
										<dt className="font-marginalia italic text-ink/55">
											{label}
										</dt>
										<dd>{value}</dd>
									</div>
								))}
							</dl>
							<p className="mt-7 border-oxblood border-l-2 bg-olive-200/60 px-4 py-3 font-marginalia italic text-ink/70 text-sm leading-6">
								☞ the source is public; recordings and credentials remain local.
							</p>
						</div>
					</WavyFrame>
				</div>

				<GlyphStrip className="mt-16 text-rubric/60" set="ornament" />
			</div>
		</section>
	);
}
