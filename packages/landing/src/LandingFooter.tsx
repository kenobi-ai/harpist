import { GlyphStrip } from "./components/medieval";
import { ExternalLink } from "./ExternalLink";

export function LandingFooter() {
	return (
		<footer className="bg-olive-200/80 py-8 sm:py-10">
			<div className="mx-auto max-w-6xl px-5">
				<GlyphStrip className="text-rubric/60" set="ornament" />
			</div>
			<div className="mx-auto mt-7 flex max-w-6xl flex-col items-center justify-center gap-5 px-5 text-center text-xs sm:flex-row sm:flex-wrap sm:justify-between sm:gap-3 sm:text-left">
				<p>
					built by{" "}
					<ExternalLink
						className="underline decoration-wavy hover:text-rubric"
						href="//kenobi.ai"
					>
						kenobi.ai
					</ExternalLink>
				</p>
				<p className="max-w-full border-red-800 border-y bg-red-900/20 px-3 py-0.5 text-center font-display text-base text-red-900 leading-tight sm:text-lg sm:leading-none">
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
