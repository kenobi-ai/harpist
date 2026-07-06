import { ExternalLink } from "./ExternalLink";

export function LandingFooter() {
	return (
		<footer className="border-ink border-t-2 bg-parchment">
			<div className="mx-auto grid items-center gap-2 px-4 py-4 text-center text-xs uppercase tracking-widest sm:grid-cols-3 sm:px-7 sm:text-left lg:px-9">
				<p>Harpist — built by Kenobi</p>
				<p className="font-display text-2xl normal-case tracking-normal sm:text-center">
					❦ Made in Londres ❦
				</p>
				<div className="flex justify-center gap-4 font-bold sm:justify-end">
					<a className="hover:text-rubric" href="/privacy">
						Privacy
					</a>
					<ExternalLink
						className="hover:text-rubric"
						href="https://github.com/kenobi-ai/harpist"
					>
						GitHub ↗
					</ExternalLink>
				</div>
			</div>
		</footer>
	);
}
