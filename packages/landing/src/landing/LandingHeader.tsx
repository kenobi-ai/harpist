import { StarIcon } from "@phosphor-icons/react";
import { ExternalLink } from "../ExternalLink";
import { siteLinks } from "./content";

export function LandingHeader() {
	return (
		<header className="parchment sticky top-0 z-30 border-oxblood/70 border-b bg-ink/95 text-olive-50 shadow-sm backdrop-blur-sm">
			<div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-5">
				<div className="flex shrink-0 items-center gap-2.5">
					<a
						className="font-display text-xl leading-none transition hover:text-amber-300 sm:text-2xl"
						href="/"
					>
						harpist
					</a>
					<span className="relative top-px whitespace-nowrap text-[9px] text-olive-50/50 sm:text-xs">
						Open Source (MIT)
					</span>
				</div>
				<nav
					aria-label="External resources"
					className="relative top-px flex items-center gap-2 whitespace-nowrap text-[10px] sm:gap-5 sm:text-xs"
				>
					<ExternalLink
						className="inline-flex items-center gap-0.5 transition hover:text-amber-300"
						href={siteLinks.chrome}
					>
						chrome extension <span aria-hidden>↗</span>
					</ExternalLink>
					<ExternalLink
						className="inline-flex items-center gap-0.5 transition hover:text-amber-300"
						href={siteLinks.skill}
					>
						skill <span aria-hidden>↗</span>
					</ExternalLink>
					<ExternalLink
						className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-300 px-2.5 py-1.5 font-medium text-ink transition hover:border-amber-200 hover:bg-amber-200 sm:px-3"
						href={siteLinks.github}
					>
						<StarIcon aria-hidden size={15} weight="fill" />
						star on github
					</ExternalLink>
				</nav>
			</div>
		</header>
	);
}
