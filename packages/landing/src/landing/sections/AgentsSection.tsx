import { RobotIcon } from "@phosphor-icons/react";
import angelIllustration from "../../assets/angel-illustration.webp";
import { GlyphStrip, WavyFrame } from "../../components/medieval";
import { ShellCommand } from "../../ShellCommand";
import {
	agentOutputs,
	agentPrompt,
	installSkillCommand,
	siteLinks,
} from "../content";
import { ManuscriptLink } from "../ManuscriptLink";

export function AgentsSection() {
	return (
		<section
			aria-labelledby="agents-title"
			className="-mb-8 scroll-mt-12 bg-stone-900 py-6 text-stone-50 sm:py-12"
			id="agents"
		>
			<div className="mx-auto max-w-6xl px-5 py-12 sm:py-24">
				<div className="grid gap-8 lg:grid-cols-2 lg:items-end">
					<div>
						<p className="mb-3 font-display text-3xl leading-none sm:mb-8">
							<span className="text-amber-300">iv.</span> intelligentia
							artificialis
						</p>
						<h2
							className="mt-4 max-w-3xl font-heading text-4xl text-amber-300 leading-[0.95] sm:text-6xl"
							id="agents-title"
						>
							Seamless integration with any AI agent
						</h2>
					</div>
					<p className="max-w-xl text-stone-50/75 leading-7 lg:justify-self-end">
						<span className="drop-cap">I</span>nstall the skill, make a
						recording with the browser extension, and describe the workflow you
						want to run. The skill gives your agent data for refinement,
						authenticated replay, and documentation review.
					</p>
				</div>

				<div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
					<WavyFrame
						className="min-w-0"
						frameClassName="rounded-[2.5rem] border-amber-300/60 bg-stone-950/70"
					>
						<div className="p-6 sm:p-9">
							<div className="flex items-start gap-3 text-amber-300 sm:items-center">
								<RobotIcon
									aria-hidden
									className="shrink-0 sm:shrink"
									size={30}
									weight="duotone"
								/>
								<p className="font-display text-3xl leading-none">
									Your agent does the legwork for you
								</p>
							</div>
							<p className="mt-5 text-stone-50/70 text-sm leading-6">
								Add the SKILL to your agent:
							</p>
							<ShellCommand
								className="mt-4"
								command={installSkillCommand}
								fontSize="sm"
								tone="dark"
							/>
							<div className="mt-8 border-amber-300/70 border-l-2 bg-stone-900/80 p-5">
								<p className="font-marginalia italic text-amber-300 text-sm">
									then ask:
								</p>
								<blockquote className="mt-2 font-heading text-xl leading-7">
									&ldquo;{agentPrompt}&rdquo;
								</blockquote>
							</div>
						</div>
					</WavyFrame>

					<div className="min-w-0">
						<div className="flex w-full items-center justify-center lg:mb-12">
							<img
								alt="Angel illustration"
								className="w-[180px] sm:w-[220px]"
								src={angelIllustration}
							/>
						</div>
					</div>
				</div>

				<div className="mt-10 border-amber-300/40 border-y border-dotted py-6 sm:mt-12">
					<div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-marginalia italic text-amber-300 text-sm">
								the handoff
							</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{agentOutputs.map((output) => (
									<code
										className="border border-stone-50/15 bg-stone-950/70 px-2.5 py-1 text-stone-50/75 text-xs"
										key={output}
									>
										{output}
									</code>
								))}
							</div>
						</div>
						<ManuscriptLink external href={siteLinks.skill} tone="gold">
							read the skill ↗
						</ManuscriptLink>
					</div>
				</div>

				<GlyphStrip className="mt-14 text-amber-300/45" set="stars" />
			</div>
		</section>
	);
}
