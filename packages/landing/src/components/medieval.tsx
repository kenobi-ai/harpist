import type { ReactNode } from "react";

const glyphSets = {
	ornament: ["❦", "✠", "❧", "⁋", "✢"],
	planetary: ["☉", "☿", "♀", "♂", "♃", "♄", "☽"],
	stars: ["✶", "☾", "✧", "✦", "✴"],
} as const;

type GlyphSet = keyof typeof glyphSets;

/**
 * Mounts the SVG displacement filters that give .parchment-scrap its torn,
 * deckled edges. Render once per page, anywhere in the document.
 */
export function MedievalDefs() {
	return (
		<svg aria-hidden="true" className="absolute size-0 overflow-hidden">
			<filter id="parchment-tear" x="-6%" y="-6%" width="112%" height="112%">
				<feTurbulence
					baseFrequency="0.03"
					numOctaves="5"
					result="noise"
					seed="9"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="14"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
				<feDropShadow
					dx="1.5"
					dy="3"
					floodColor="#2b2117"
					floodOpacity="0.25"
					stdDeviation="3"
				/>
			</filter>
			<filter id="wavy-frame" x="-4%" y="-8%" width="108%" height="116%">
				<feTurbulence
					baseFrequency="0.025"
					numOctaves="3"
					result="noise"
					seed="5"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="8"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter id="wavy-frame-soft" x="-6%" y="-14%" width="112%" height="128%">
				<feTurbulence
					baseFrequency="0.06"
					numOctaves="2"
					result="noise"
					seed="2"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="5"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter id="wavy-band" x="-2%" y="-14%" width="104%" height="128%">
				<feTurbulence
					baseFrequency="0.004 0.03"
					numOctaves="2"
					result="noise"
					seed="8"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="14"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
			</filter>
			<filter
				id="parchment-tear-soft"
				x="-10%"
				y="-14%"
				width="120%"
				height="128%"
			>
				<feTurbulence
					baseFrequency="0.09"
					numOctaves="4"
					result="noise"
					seed="4"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="7"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
				<feDropShadow
					dx="1"
					dy="2"
					floodColor="#2b2117"
					floodOpacity="0.22"
					stdDeviation="1.5"
				/>
			</filter>
		</svg>
	);
}

/** Hand-drawn squiggle rule. Tint it with a text-* utility. */
export function WavyRule({ className = "" }: { className?: string }) {
	return <div aria-hidden className={`wavy-rule ${className}`} />;
}

/** A row of marginalia glyphs, e.g. planetary symbols between sections. */
export function GlyphStrip({
	className = "",
	set = "planetary",
}: {
	className?: string;
	set?: GlyphSet;
}) {
	return (
		<p
			aria-hidden
			className={`flex select-none items-center justify-center gap-5 text-sm sm:gap-8 ${className}`}
		>
			{glyphSets[set].map((glyph) => (
				<span key={glyph}>{glyph}</span>
			))}
		</p>
	);
}

/** Glyph strip flanked by wavy rules — a full-width section ornament. */
export function Ornament({
	className = "",
	set = "planetary",
}: {
	className?: string;
	set?: GlyphSet;
}) {
	return (
		<div aria-hidden className={`flex items-center gap-6 ${className}`}>
			<WavyRule className="min-w-0 flex-1" />
			<GlyphStrip className="shrink-0" set={set} />
			<WavyRule className="min-w-0 flex-1" />
		</div>
	);
}

/**
 * A panel with a hand-drawn wobbly outline, EP-1320 style. Style the frame
 * layer (fill, border, radius) via frameClassName; content sits on top,
 * unwarped.
 */
export function WavyFrame({
	children,
	className = "",
	frameClassName = "rounded-[2.5rem] border-[2.5px] border-oxblood bg-olive-200",
}: {
	children: ReactNode;
	className?: string;
	frameClassName?: string;
}) {
	return (
		<div className={`relative ${className}`}>
			<div
				aria-hidden
				className={`wavy-frame absolute inset-0 ${frameClassName}`}
			/>
			<div className="relative z-10">{children}</div>
		</div>
	);
}

/** Full-width rubricated divider band with a running-scroll wave motif. */
export function ScrollBand({ className = "" }: { className?: string }) {
	return (
		<div aria-hidden className={`overflow-hidden ${className}`}>
			<div className="scroll-band -mx-6" />
		</div>
	);
}

/** A torn scrap of parchment behind whatever you place inside it. */
export function ParchmentScrap({
	children,
	className = "",
	soft = false,
}: {
	children: ReactNode;
	className?: string;
	soft?: boolean;
}) {
	return (
		<div className={`relative ${className}`}>
			<div
				aria-hidden
				className={`parchment-scrap absolute -inset-x-3 -inset-y-2 ${
					soft ? "parchment-scrap-soft" : ""
				}`}
			/>
			<div className="relative z-10">{children}</div>
		</div>
	);
}
