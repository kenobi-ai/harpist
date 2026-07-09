import type { ReactNode } from "react";

const glyphSets = {
	ornament: ["❦", "✣", "☙", "⁋", "✥"],
	planetary: ["☉", "☾", "☿", "♁", "♀", "♃", "♄"],
	stars: ["✦", "✧", "✷", "✹", "✺"],
} as const;

type GlyphSet = keyof typeof glyphSets;

const scrollWaveSegmentWidth = 128;
const scrollWaveSegmentCount = 48;
const scrollWaveWidth = scrollWaveSegmentWidth * scrollWaveSegmentCount;
const scrollWavePath = `M 0 28 ${Array.from(
	{ length: scrollWaveSegmentCount },
	(_, index) => {
		const x = index * scrollWaveSegmentWidth;
		return [
			`C ${x + 18} 18 ${x + 43} 18 ${x + 64} 28`,
			`C ${x + 85} 38 ${x + 110} 38 ${x + 128} 28`,
		].join(" ");
	},
).join(" ")}`;
const scrollCurlPath = Array.from(
	{ length: scrollWaveSegmentCount },
	(_, index) => {
		const x = index * scrollWaveSegmentWidth + 58;
		return [
			`M ${x} 28`,
			`C ${x + 18} 39 ${x + 44} 34 ${x + 42} 20`,
			`C ${x + 40} 8 ${x + 19} 9 ${x + 19} 23`,
			`C ${x + 19} 34 ${x + 36} 33 ${x + 33} 23`,
		].join(" ");
	},
).join(" ");

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
			<filter
				id="parchment-tear-broad"
				x="-14%"
				y="-18%"
				width="128%"
				height="136%"
			>
				<feTurbulence
					baseFrequency="0.012 0.026"
					numOctaves="3"
					result="noise"
					seed="13"
					type="fractalNoise"
				/>
				<feDisplacementMap
					in="SourceGraphic"
					in2="noise"
					scale="22"
					xChannelSelector="R"
					yChannelSelector="G"
				/>
				<feDropShadow
					dx="2"
					dy="4"
					floodColor="#2b2117"
					floodOpacity="0.26"
					stdDeviation="4"
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
	frameClassName = "",
}: {
	children: ReactNode;
	className?: string;
	frameClassName?: string;
}) {
	return (
		<div className={`relative ${className}`}>
			<div
				aria-hidden
				className={`wavy-frame absolute inset-0 rounded-[2.5rem] border-[2.5px] border-oxblood bg-olive-200 ${frameClassName}`}
			/>
			<div className="relative z-10">{children}</div>
		</div>
	);
}

/**
 * A stretched-scroll backing panel — wavy band with rolled corner curls,
 * shaped by the --scroll-panel-mask in styles.css. Style the vellum via
 * panelClassName (bg-* fill); content sits on top, unwarped. The panel
 * bleeds past the content so the curls clear it — tune with insetClassName.
 */
export function ScrollPanel({
	children,
	className = "",
	insetClassName = "-inset-x-6 -inset-y-7",
	panelClassName = "bg-olive-200",
}: {
	children: ReactNode;
	className?: string;
	insetClassName?: string;
	panelClassName?: string;
}) {
	return (
		<div className={`relative ${className}`}>
			<div
				aria-hidden
				className={`absolute drop-shadow-[2px_4px_4px_rgba(43,33,23,0.3)] ${insetClassName}`}
			>
				<div className={`scroll-panel size-full ${panelClassName}`} />
			</div>
			<div className="relative z-10">{children}</div>
		</div>
	);
}

/** Full-width rubricated divider band with a running-scroll wave motif. */
export function ScrollBand({ className = "" }: { className?: string }) {
	return (
		<div aria-hidden className={`overflow-hidden py-2 -mb-4 ${className}`}>
			<div className="scroll-band -mx-6">
				<svg
					aria-hidden
					className="pointer-events-none absolute top-1/2 left-1/2 h-12 -translate-x-1/2 -translate-y-1/2 overflow-visible"
					style={{ width: scrollWaveWidth }}
					viewBox={`0 0 ${scrollWaveWidth} 48`}
				>
					<title>Running scroll wave</title>
					<path
						d={scrollWavePath}
						fill="none"
						stroke="var(--color-verdigris-dark)"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
					/>
					<path
						d={scrollCurlPath}
						fill="none"
						stroke="var(--color-verdigris-dark)"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="4"
					/>
				</svg>
			</div>
		</div>
	);
}
