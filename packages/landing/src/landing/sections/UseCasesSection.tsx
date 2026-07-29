import {
	BinocularsIcon,
	HouseLineIcon,
	KanbanIcon,
} from "@phosphor-icons/react";
import { ShovelIcon } from "@phosphor-icons/react/dist/ssr";
import { GlyphStrip, WavyFrame } from "../../components/medieval";

const useCases = [
	{
		description:
			"Automate the things in your life that take manual effort, such as property websites and hard-to-use monthly chores.",
		icon: HouseLineIcon,
		label: "make admin easier",
		title: "Personal automation",
	},
	{
		description:
			"Perform tasks on your favorite apps that don't have public or external APIs that you need.",
		icon: KanbanIcon,
		label: "productivity on autopilot",
		title: "Workplace workflows",
	},
	{
		description:
			"Perform complete, one-off captures of a website from your own computer, in order to extract the data you need for a task.",
		icon: ShovelIcon,
		label: "easy, structured extraction",
		title: "Scraping",
	},
	{
		description:
			"Learn how any website really works, then turn its observed requests and responses into a browseable reference.",
		icon: BinocularsIcon,
		label: "discovery",
		title: "Understanding",
	},
] as const;

type UseCase = (typeof useCases)[number];

function UseCaseCard({ description, icon: Icon, label, title }: UseCase) {
	return (
		<WavyFrame
			className="h-full"
			frameClassName="rounded-[2rem] border-ink/35 bg-olive-50/70"
		>
			<article className="flex h-full gap-5 p-6 sm:p-8">
				<div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-verdigris-dark bg-verdigris text-olive-50 shadow-sm">
					<Icon aria-hidden size={30} weight="duotone" />
				</div>
				<div>
					<p className="font-marginalia italic text-rubric text-sm">{label}</p>
					<h3 className="mt-1 font-heading text-2xl leading-tight">{title}</h3>
					<p className="mt-3 text-ink/70 text-sm leading-6">{description}</p>
				</div>
			</article>
		</WavyFrame>
	);
}

export function UseCasesSection() {
	return (
		<section
			aria-labelledby="use-cases-title"
			className="scroll-mt-12"
			id="use-cases"
		>
			<div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
				<div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
					<div>
						<p className="font-display text-3xl leading-none">
							<span className="text-red-700">v.</span> exempla
						</p>
						<h2
							className="mt-3 max-w-3xl font-bold font-heading text-4xl leading-tight tracking-tight sm:text-5xl"
							id="use-cases-title"
						>
							Use Harpist <span className="text-rubric">for anything.</span>
						</h2>
					</div>
				</div>

				<div className="mt-12 grid gap-6 sm:grid-cols-2">
					{useCases.map((useCase) => (
						<UseCaseCard key={useCase.title} {...useCase} />
					))}
				</div>

				<GlyphStrip className="mt-14 text-ink/45" set="ornament" />
			</div>
		</section>
	);
}
