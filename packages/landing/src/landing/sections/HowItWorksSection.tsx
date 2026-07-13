import monkIllustration from "../../assets/monk-illustration.webp";
import { Ornament } from "../../components/medieval";
import { workflowClips } from "../content";
import { ManuscriptLink } from "../ManuscriptLink";
import { WorkflowClipSection } from "../WorkflowClipSection";

export function HowItWorksSection() {
	return (
		<section aria-labelledby="how-title" className="scroll-mt-12" id="how">
			<div className="mx-auto max-w-6xl px-5 pt-2">
				<Ornament className="text-ink/70" set="planetary" />
			</div>

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-16 pt-12 sm:py-20 lg:grid-cols-3 lg:items-center lg:gap-16">
				<img
					alt="Illuminated-manuscript illustration of a monk writing at a desk"
					className="w-full max-w-[300px] -scale-x-100 justify-self-center mix-blend-multiply sm:max-w-[340px] lg:justify-self-start"
					height="1024"
					src={monkIllustration}
					width="1024"
				/>
				<div className="text-right lg:col-span-2">
					<p className="font-display text-3xl leading-none">
						<span className="text-red-700">ii.</span> veni, vidi, vici
					</p>
					<h2
						className="ml-auto mt-3 max-w-4xl font-bold font-heading text-4xl leading-tight tracking-tight sm:text-5xl"
						id="how-title"
					>
						The three steps to{" "}
						<span className="text-rubric">automatory enlightenment...</span>
					</h2>
					<p className="ml-auto mt-8 max-w-xl text-left leading-7">
						<span className="drop-cap">U</span>se any website just like an API.
						Record sessions with the chrome extension, extrapolate and replay
						them with the CLI. Easy for agents to manage, and even easier for
						humans to set up automated workflows with.
					</p>
					<div className="mt-9 flex flex-wrap justify-end gap-3">
						<ManuscriptLink href="#agents" tone="ink">
							<span aria-hidden>☞</span> install cli
						</ManuscriptLink>
						<ManuscriptLink href="#workflow" tone="crimson">
							how it works
						</ManuscriptLink>
					</div>
					<p className="mt-6 font-marginalia italic text-ink/60 text-sm">
						☞ nota bene: thy recordings never leave thy machine.
					</p>
				</div>
			</div>

			<div
				className="mx-auto max-w-6xl scroll-mt-12 px-5 pb-16 sm:pb-24"
				id="workflow"
			>
				<div className="border-ink/25 border-t border-dotted">
					{workflowClips.map((clip, index) => (
						<WorkflowClipSection
							clip={clip}
							key={clip.title}
							reverse={index % 2 === 1}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
