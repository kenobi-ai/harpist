import { ExternalLink } from "../ExternalLink";
import { siteLinks } from "./content";

export function LandingHeader() {
	return (
		<header className="parchment sticky top-0 z-30 border-oxblood/70 border-b bg-ink/95 text-olive-50 shadow-sm backdrop-blur-sm">
			<div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 text-xs">
				<a
					className="font-display text-2xl leading-none transition hover:text-amber-300"
					href="/"
				>
					harpist
				</a>
				<nav aria-label="Primary" className="flex items-center gap-4 sm:gap-5">
					<a
						className="hidden transition hover:text-amber-300 sm:inline"
						href="#how"
					>
						how it works
					</a>
					<a
						className="hidden transition hover:text-amber-300 md:inline"
						href="#docs"
					>
						docs
					</a>
					<a className="transition hover:text-amber-300" href="#agents">
						☞ agents
					</a>
					<a
						className="hidden transition hover:text-amber-300 lg:inline"
						href="#open-source"
					>
						open source
					</a>
					<a
						className="hidden transition hover:text-amber-300 xl:inline"
						href="/privacy"
					>
						privacy
					</a>
					<ExternalLink
						className="transition hover:text-amber-300"
						href={siteLinks.github}
					>
						github ↗
					</ExternalLink>
				</nav>
			</div>
		</header>
	);
}
