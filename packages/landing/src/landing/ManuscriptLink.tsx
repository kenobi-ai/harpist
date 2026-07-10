import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ExternalLink } from "../ExternalLink";

type ManuscriptLinkTone = "crimson" | "gold" | "ink" | "light-outline";
type ManuscriptLinkSize = "lg" | "sm";

const toneStyles: Record<
	ManuscriptLinkTone,
	{
		content: string;
		frame: string;
	}
> = {
	crimson: {
		content: "text-red-50",
		frame:
			"border-2 border-oxblood bg-red-800 group-hover:bg-red-700 group-focus-visible:bg-red-700",
	},
	gold: {
		content: "font-bold text-stone-950",
		frame:
			"border-2 border-amber-200/50 bg-amber-400 group-hover:bg-amber-300 group-focus-visible:bg-amber-300",
	},
	ink: {
		content: "text-olive-50",
		frame:
			"border-2 border-oxblood bg-ink group-hover:bg-ink/85 group-focus-visible:bg-ink/85",
	},
	"light-outline": {
		content: "text-stone-50",
		frame:
			"border-2 border-stone-50/50 bg-stone-950/25 group-hover:border-amber-300 group-focus-visible:border-amber-300",
	},
};

const sizeStyles: Record<ManuscriptLinkSize, string> = {
	lg: "px-5 py-3 font-heading text-xl leading-5",
	sm: "px-5 py-2.5 text-sm",
};

type ManuscriptLinkProps = Omit<
	ComponentPropsWithoutRef<"a">,
	"children" | "rel" | "target"
> & {
	children: ReactNode;
	external?: boolean;
	size?: ManuscriptLinkSize;
	tone?: ManuscriptLinkTone;
};

export function ManuscriptLink({
	children,
	className = "",
	external = false,
	size = "sm",
	tone = "ink",
	...props
}: ManuscriptLinkProps) {
	const theme = toneStyles[tone];
	const wrapperClassName = [
		"group relative inline-flex items-center focus-visible:outline-none",
		className,
	]
		.filter(Boolean)
		.join(" ");
	const content = (
		<>
			<span
				aria-hidden
				className={[
					"wavy-frame-soft absolute inset-0 rounded-xl transition",
					theme.frame,
				].join(" ")}
			/>
			<span
				className={[
					"relative z-10 inline-flex items-center gap-2",
					sizeStyles[size],
					theme.content,
				].join(" ")}
			>
				{children}
			</span>
		</>
	);

	if (external) {
		return (
			<ExternalLink className={wrapperClassName} {...props}>
				{content}
			</ExternalLink>
		);
	}

	return (
		<a className={wrapperClassName} {...props}>
			{content}
		</a>
	);
}
