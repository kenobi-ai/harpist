import { ExternalLink } from "../ExternalLink";
import { siteLinks } from "./content";

export function LandingHeader() {
	return (
		<header className="parchment sticky top-0 z-30 border-oxblood/70 border-b bg-ink/95 text-olive-50 shadow-sm backdrop-blur-sm">
			<div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-5">
				<a
					className="font-display text-xl leading-none transition hover:text-amber-300 sm:text-2xl"
					href="/"
				>
					harpist
				</a>
				<nav
					aria-label="External resources"
					className="flex items-center gap-2 whitespace-nowrap text-[10px] sm:gap-5 sm:text-xs"
				>
					<ExternalLink
						className="inline-flex items-center gap-0.5 transition hover:text-amber-300"
						href={siteLinks.chrome}
					>
						chrome extension <span aria-hidden>↗</span>
					</ExternalLink>
					<ExternalLink
						className="inline-flex items-center gap-0.5 transition hover:text-amber-300"
						href={siteLinks.github}
					>
						github <span aria-hidden>↗</span>
					</ExternalLink>
					<ExternalLink
						className="inline-flex items-center gap-0.5 transition hover:text-amber-300"
						href={siteLinks.skill}
					>
						skill <span aria-hidden>↗</span>
					</ExternalLink>
				</nav>
			</div>
		</header>
	);
}
