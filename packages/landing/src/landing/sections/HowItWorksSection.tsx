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

			<div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 pb-16 pt-12 sm:gap-10 sm:py-20 lg:grid-cols-3 lg:items-center lg:gap-16">
				<img
					alt="Illuminated-manuscript illustration of a monk writing at a desk"
					className="order-2 w-full max-w-[240px] -scale-x-100 justify-self-center mix-blend-multiply sm:max-w-[340px] lg:order-none lg:justify-self-start"
					height="1024"
					src={monkIllustration}
					width="1024"
				/>
				<div className="order-1 text-left lg:order-none lg:col-span-2 lg:text-right">
					<p className="font-display text-3xl leading-none">
						<span className="text-red-700">ii.</span> veni, vidi, vici
					</p>
					<h2
						className="mt-3 max-w-4xl text-pretty font-bold font-heading text-3xl leading-tight tracking-tight sm:text-5xl sm:text-balance lg:ml-auto"
						id="how-title"
					>
						The three steps to{" "}
						<span className="text-rubric">automatory enlightenment...</span>
					</h2>
					<p className="mt-6 max-w-xl text-left leading-7 sm:mt-8 lg:ml-auto">
						<span className="drop-cap">U</span>se any website just like an API.
						Record sessions with the chrome extension, extrapolate and replay
						them with the CLI. Easy for agents to manage, and even easier for
						humans to set up automated workflows with.
					</p>
					<div className="mt-8 flex flex-wrap justify-start gap-3 sm:mt-9 lg:justify-end">
						<ManuscriptLink href="#agents" tone="ink">
							<span aria-hidden>☞</span> install cli
						</ManuscriptLink>
						<ManuscriptLink href="#workflow" tone="crimson">
							how it works
						</ManuscriptLink>
					</div>
					<p className="mt-6 text-left font-marginalia italic text-ink/60 text-sm lg:text-right">
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
