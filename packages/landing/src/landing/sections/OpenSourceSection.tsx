import { GitForkIcon, GithubLogoIcon } from "@phosphor-icons/react";
import tavernIllustration from "../../assets/tavern-illustration.webp";
import { ScrollPanel, WavyFrame } from "../../components/medieval";
import { openSourceLedger, siteLinks } from "../content";
import { ManuscriptLink } from "../ManuscriptLink";

export function OpenSourceSection() {
	return (
		<section
			aria-labelledby="open-source-title"
			className="relative z-10 scroll-mt-12 pt-0 shadow-[0_12px_24px_-14px_rgba(43,33,23,0.45)]"
			id="open-source"
		>
			<div className="mx-auto max-w-6xl px-5 pb-16 lg:pb-0 lg:pt-0 sm:py-24">
				<div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
					<div className="lg:pt-16">
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
									Harpist is open source
								</h1>
							</div>
						</ScrollPanel>
						<div className="mt-12">
							<WavyFrame frameClassName="rounded-[3rem] border-oxblood bg-olive-50/75">
								<div className="p-8 sm:p-10 ">
									<div className="flex items-center gap-3 text-rubric">
										<GitForkIcon aria-hidden size={30} weight="duotone" />
										<div>
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
									<div className="mt-8 flex flex-wrap gap-3">
										<ManuscriptLink external href={siteLinks.github} tone="ink">
											<GithubLogoIcon aria-hidden size={18} weight="duotone" />
											browse the source ↗
										</ManuscriptLink>
										<ManuscriptLink
											external
											href={siteLinks.npm}
											tone="crimson"
										>
											view the package ↗
										</ManuscriptLink>
									</div>
								</div>
							</WavyFrame>
						</div>
					</div>
					<div className="min-w-0">
						<div className="flex items-start justify-end lg:w-[calc(100%+max(0rem,(100vw-72rem)/2)+1.25rem)]">
							<img
								alt="Tavern illustration"
								className="h-auto w-full object-contain"
								src={tavernIllustration}
							/>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
