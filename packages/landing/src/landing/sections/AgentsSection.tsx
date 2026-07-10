import { RobotIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { GlyphStrip, WavyFrame } from "../../components/medieval";
import { ShellCommand } from "../../ShellCommand";
import {
	agentOutputs,
	agentPrompt,
	agentSteps,
	installSkillCommand,
	siteLinks,
} from "../content";
import { ManuscriptLink } from "../ManuscriptLink";

export function AgentsSection() {
	return (
		<section
			aria-labelledby="agents-title"
			className="scroll-mt-12 bg-stone-900 text-stone-50 py-12 -mb-8"
			id="agents"
		>
			<div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
				<div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
					<div>
						<p className="font-marginalia italic text-sm">
							<span aria-hidden className="text-amber-400">
								¶{" "}
							</span>
							iv. ars agentium
						</p>
						<h2
							className="mt-4 max-w-3xl font-display text-5xl text-amber-300 leading-[0.95] sm:text-6xl"
							id="agents-title"
						>
							How to use Harpist with agents
						</h2>
					</div>
					<p className="max-w-xl text-stone-50/75 leading-7 lg:justify-self-end">
						Install the skill once, make a recording, and describe the outcome
						you want. The skill gives the agent the full local workflow for
						refinement, authenticated replay, and documentation review.
					</p>
				</div>

				<div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
					<WavyFrame
						className="min-w-0"
						frameClassName="rounded-[2.5rem] border-amber-300/60 bg-stone-950/70"
					>
						<div className="p-7 sm:p-9">
							<div className="flex items-center gap-3 text-amber-300">
								<RobotIcon aria-hidden size={30} weight="duotone" />
								<p className="font-display text-3xl leading-none">
									give your agent the score
								</p>
							</div>
							<p className="mt-5 text-stone-50/70 text-sm leading-6">
								Add the portable skill to an agent that supports agent skills:
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
						<div className="flex items-center gap-3 text-amber-300">
							<TerminalWindowIcon aria-hidden size={28} weight="duotone" />
							<p className="font-display text-3xl leading-none">
								three movements
							</p>
						</div>
						<ol className="mt-5 border-stone-50/20 border-t border-dotted">
							{agentSteps.map((step) => (
								<li
									className="grid grid-cols-[3.5rem_1fr] gap-4 border-stone-50/20 border-b border-dotted py-5"
									key={step.title}
								>
									<span className="font-display text-4xl text-amber-300 leading-none">
										{step.numeral}
									</span>
									<div>
										<h3 className="font-heading text-2xl leading-none">
											{step.title}
										</h3>
										<p className="mt-2 text-stone-50/65 text-sm leading-6">
											{step.description}
										</p>
									</div>
								</li>
							))}
						</ol>
					</div>
				</div>

				<div className="mt-12 border-amber-300/40 border-y border-dotted py-6">
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
