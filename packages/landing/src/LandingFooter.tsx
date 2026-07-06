import { ExternalLink } from "./ExternalLink";

export function LandingFooter() {
	return (
		<footer>
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs">
				<p>
					built by{" "}
					<ExternalLink
						className="underline decoration-wavy hover:text-red-800"
						href="//kenobi.ai"
					>
						kenobi.ai
					</ExternalLink>
				</p>
				<p className="font-display text-lg bg-red-900/20 text-red-900 leading-none px-3 py-0.5 border-y border-red-800">
					❦ made in londres · anno domini MMXXVI ❦
				</p>
				<div className="flex gap-4">
					<a className="hover:text-red-800" href="/privacy">
						privacy
					</a>
					<ExternalLink
						className="hover:text-red-800"
						href="https://github.com/kenobi-ai/harpist"
					>
						github ↗
					</ExternalLink>
				</div>
			</div>
		</footer>
	);
}
