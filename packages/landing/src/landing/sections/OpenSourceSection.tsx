import { GitForkIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
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
			<div className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:py-24 lg:pb-0 lg:pt-0">
				<div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
					<div className="lg:pt-16">
						<p className="mb-3 font-display text-3xl leading-none sm:mb-8">
							<span className="text-red-700">vi.</span> codex publicus
						</p>
						<ScrollPanel
							insetClassName="-mx-6 -my-3 sm:-inset-x-8 sm:-inset-y-9"
							panelClassName="bg-stone-100"
						>
							<div className="px-3 py-3 sm:py-6">
								<h2
									className="w-full font-bold font-heading text-4xl text-amber-950 leading-tight tracking-tight sm:text-6xl"
									id="open-source-title"
								>
									Harpist is open source
								</h2>
							</div>
						</ScrollPanel>
						<div className="mt-6 sm:mt-12">
							<WavyFrame frameClassName="rounded-[3rem] border-oxblood bg-olive-50/75">
								<div className="p-6 sm:p-10">
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
												className="grid grid-cols-[5.5rem_1fr] gap-3 border-ink/25 border-b border-dotted py-3 text-sm sm:grid-cols-[7rem_1fr] sm:gap-4"
												key={label}
											>
												<dt className="font-marginalia italic text-ink/55">
													{label}
												</dt>
												<dd>{value}</dd>
											</div>
										))}
									</dl>
									<div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
										<ManuscriptLink external href={siteLinks.github} tone="ink">
											<GithubLogoIcon aria-hidden size={18} weight="duotone" />
											browse the source ↗
										</ManuscriptLink>
										<ManuscriptLink
											external
											href={siteLinks.npm}
											tone="crimson"
										>
											<PackageIcon aria-hidden size={18} weight="duotone" />
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
