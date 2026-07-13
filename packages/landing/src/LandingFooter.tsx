import { GlyphStrip } from "./components/medieval";
import { ExternalLink } from "./ExternalLink";

export function LandingFooter() {
	return (
		<footer className="bg-olive-200/80 py-8 sm:py-10">
			<div className="mx-auto max-w-6xl px-5">
				<GlyphStrip className="text-rubric/60" set="ornament" />
			</div>
			<div className="mx-auto mt-7 flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-xs">
				<p>
					built by{" "}
					<ExternalLink
						className="underline decoration-wavy hover:text-rubric"
						href="//kenobi.ai"
					>
						kenobi.ai
					</ExternalLink>
				</p>
				<p className="font-display text-lg bg-red-900/20 text-red-900 leading-none px-3 py-0.5 border-y border-red-800">
					❦ made in londres · anno domini MMXXVI ❦
				</p>
				<div className="flex gap-4">
					<a className="hover:text-rubric" href="/privacy">
						privacy
					</a>
					<ExternalLink
						className="hover:text-rubric"
						href="https://github.com/kenobi-ai/harpist"
					>
						github ↗
					</ExternalLink>
				</div>
			</div>
		</footer>
	);
}
