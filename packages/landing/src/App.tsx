import {
	ArrowRightIcon,
	BracketsCurlyIcon,
	CheckCircleIcon,
	CommandIcon,
	FileCodeIcon,
	GlobeIcon,
	PlugsConnectedIcon,
	RecordIcon,
} from "@phosphor-icons/react";
import harpistSprite from "../../extension/public/sprites/harpist-12.webp";

const workflow = [
	{
		description: "Open the site in Chrome and start a Harpist recording.",
		icon: RecordIcon,
		title: "Record",
	},
	{
		description:
			"Use the site once while Harpist captures real browser traffic.",
		icon: PlugsConnectedIcon,
		title: "Observe",
	},
	{
		description: "Generate replayable auth, oRPC contracts, and OpenAPI docs.",
		icon: FileCodeIcon,
		title: "Ship",
	},
];

const outputs = [
	"Agent-usable API docs",
	"Replayable authenticated requests",
	"oRPC and OpenAPI artifacts",
	"Portable contract profiles",
];

const commands = [
	"bunx harpist bridge --agent",
	"bunx harpist refine latest example.com",
	"bunx harpist docs example.com",
];

export function App() {
	return (
		<main className="min-h-screen bg-[#f6f0e4] text-[#151414]">
			<section className="relative overflow-hidden border-[#151414] border-b">
				<div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(21,20,20,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(21,20,20,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
				<div className="relative mx-auto grid min-h-[92svh] max-w-7xl grid-rows-[auto_1fr_auto] px-5 py-5 sm:px-8 lg:px-10">
					<header className="flex items-center justify-between gap-4">
						<a
							aria-label="Harpist home"
							className="inline-flex items-center gap-3 font-semibold text-sm"
							href="/"
						>
							<span className="grid size-9 place-items-center rounded-md border border-[#151414] bg-[#f7cf3c] shadow-[3px_3px_0_#151414]">
								<CommandIcon aria-hidden size={18} weight="bold" />
							</span>
							<span>Harpist</span>
						</a>
						<nav aria-label="Primary" className="flex items-center gap-2">
							<a className="nav-link" href="#workflow">
								Workflow
							</a>
							<a className="nav-link" href="#install">
								Install
							</a>
							<a
								className="button button-dark"
								href="https://github.com/kenobi-ai/harpist"
							>
								GitHub
							</a>
						</nav>
					</header>

					<div className="grid items-center gap-10 py-14 lg:grid-cols-[1fr_420px] lg:py-10">
						<div className="max-w-3xl">
							<p className="kicker">
								Chrome traffic into agent-ready contracts
							</p>
							<h1 className="mt-4 max-w-4xl font-semibold text-6xl leading-[0.95] tracking-normal sm:text-7xl lg:text-8xl">
								Harpist
							</h1>
							<p className="mt-7 max-w-2xl text-[#383430] text-xl leading-8">
								Record a website once. Hand your agent the API docs,
								authenticated replays, and contracts it needs to work without
								guessing.
							</p>
							<div className="mt-9 flex flex-wrap gap-3">
								<a className="button button-dark button-large" href="#install">
									<span>Install CLI</span>
									<ArrowRightIcon aria-hidden size={18} weight="bold" />
								</a>
								<a
									className="button button-light button-large"
									href="#workflow"
								>
									<span>See workflow</span>
								</a>
							</div>
						</div>

						<div className="relative mx-auto w-full max-w-[420px]">
							<div className="absolute inset-x-6 bottom-4 h-28 rounded-[50%] bg-[#151414]/15 blur-2xl" />
							<div className="relative rounded-md border border-[#151414] bg-[#0a7057] p-5 shadow-[8px_8px_0_#151414]">
								<div className="rounded-md bg-[#f6f0e4] p-6">
									<img
										alt="Harpist browser extension mascot"
										className="mx-auto aspect-square w-full max-w-[290px] object-contain"
										height="512"
										src={harpistSprite}
										width="512"
									/>
								</div>
								<div className="mt-4 grid grid-cols-2 gap-3 text-white">
									<div>
										<p className="text-3xl">3</p>
										<p className="text-white/75 text-xs uppercase">Artifacts</p>
									</div>
									<div>
										<p className="text-3xl">1</p>
										<p className="text-white/75 text-xs uppercase">Recording</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="grid gap-3 pb-7 sm:grid-cols-2 lg:grid-cols-4">
						{outputs.map((output) => (
							<div
								className="flex items-center gap-2 rounded-md border border-[#151414]/20 bg-white/70 px-3 py-2 text-sm"
								key={output}
							>
								<CheckCircleIcon
									aria-hidden
									className="shrink-0 text-[#0a7057]"
									size={17}
									weight="fill"
								/>
								<span>{output}</span>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="border-[#151414] border-b bg-[#fdfaf2]" id="workflow">
				<div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[320px_1fr] lg:px-10">
					<div>
						<p className="kicker">Workflow</p>
						<h2 className="mt-3 font-semibold text-3xl tracking-normal">
							Capture reality. Generate the contract.
						</h2>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{workflow.map((step) => {
							const Icon = step.icon;
							return (
								<article
									className="rounded-md border border-[#151414] bg-white p-5 shadow-[4px_4px_0_#151414]"
									key={step.title}
								>
									<Icon
										aria-hidden
										className="text-[#0a7057]"
										size={28}
										weight="bold"
									/>
									<h3 className="mt-5 font-semibold text-xl">{step.title}</h3>
									<p className="mt-3 text-[#4b4640] leading-7">
										{step.description}
									</p>
								</article>
							);
						})}
					</div>
				</div>
			</section>

			<section className="bg-[#151414] text-white" id="install">
				<div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_520px] lg:px-10">
					<div>
						<p className="kicker text-[#f7cf3c]">Install</p>
						<h2 className="mt-3 max-w-xl font-semibold text-4xl tracking-normal">
							Start from the CLI. Keep the artifacts local.
						</h2>
						<p className="mt-5 max-w-xl text-white/70 leading-8">
							Harpist records through the browser extension, then writes a
							portable contract profile your agent can refine, review, and
							replay.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<a
								className="button button-yellow"
								href="https://github.com/kenobi-ai/harpist"
							>
								<GlobeIcon aria-hidden size={18} weight="bold" />
								<span>GitHub</span>
							</a>
							<a className="button button-outline" href="/api/health">
								<BracketsCurlyIcon aria-hidden size={18} weight="bold" />
								<span>Worker health</span>
							</a>
						</div>
					</div>
					<div className="rounded-md border border-white/18 bg-[#22201d] p-4">
						{commands.map((command) => (
							<pre className="command-line" key={command}>
								<code>{command}</code>
							</pre>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
