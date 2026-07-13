import { useState } from "react";
import { WavyFrame } from "../components/medieval";
import type { WorkflowClip } from "./content";

const videoSrcPattern = /\.(?:mp4|ogg|webm)(?:$|[?#])/i;

export function WorkflowClipSection({
	clip,
	reverse,
}: {
	clip: WorkflowClip;
	reverse: boolean;
}) {
	const [mediaSrc, setMediaSrc] = useState(clip.src);
	const isVideo = videoSrcPattern.test(mediaSrc);
	const handleMediaError = () => {
		if (clip.fallbackSrc && clip.fallbackSrc !== mediaSrc) {
			setMediaSrc(clip.fallbackSrc);
		}
	};

	return (
		<article className="grid gap-8 border-ink/25 border-b border-dotted py-12 lg:grid-cols-2 lg:items-center lg:gap-14">
			<div className={reverse ? "lg:order-2 lg:text-right" : ""}>
				<p className="font-display text-3xl leading-none text-verdigris-dark">
					<span>{clip.label}</span>
				</p>
				<h3
					className={[
						"mt-2 max-w-xl font-bold font-heading text-3xl leading-tight tracking-tight sm:text-4xl",
						reverse ? "lg:ml-auto" : "",
					].join(" ")}
				>
					{clip.title}
				</h3>
				<p
					className={[
						"mt-5 max-w-lg text-ink/80 leading-7",
						reverse ? "lg:ml-auto" : "",
					].join(" ")}
				>
					{clip.description}
				</p>
				<p
					className={[
						"mt-6 inline-flex max-w-sm items-center gap-2 border-oxblood border-l-2 bg-olive-50/60 px-4 py-3 font-marginalia italic text-ink/70 text-lg",
						reverse ? "lg:border-r-2 lg:border-l-0" : "",
					].join(" ")}
				>
					<span aria-hidden className="text-rubric">
						☞
					</span>
					{clip.detail}
				</p>
			</div>

			<WavyFrame
				className={reverse ? "lg:order-1" : ""}
				frameClassName="rounded-[2rem] border-oxblood bg-stone-900"
			>
				<div className="p-3 sm:p-4">
					<div className="relative overflow-hidden rounded-[1.5rem] border-2 border-ink bg-stone-950">
						{isVideo ? (
							<video
								aria-label={clip.alt}
								autoPlay
								className="aspect-4/3 w-full bg-white object-contain"
								loop
								muted
								onError={handleMediaError}
								playsInline
								preload="metadata"
								src={mediaSrc}
							/>
						) : (
							<img
								alt={clip.alt}
								className="aspect-video w-full bg-stone-950 object-contain"
								loading="lazy"
								onError={handleMediaError}
								src={mediaSrc}
							/>
						)}
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 ring-1 ring-white/10 ring-inset"
						/>
					</div>
					<p className="mt-3 text-center font-marginalia italic text-olive-50/70 text-sm">
						{clip.caption}
					</p>
				</div>
			</WavyFrame>
		</article>
	);
}
