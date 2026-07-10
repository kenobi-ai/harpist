import {
	GoogleChromeLogoIcon,
	NumberCircleOneIcon,
	NumberCircleTwoIcon,
} from "@phosphor-icons/react";
import harpistIllustration from "../../assets/logo-illustration.webp";
import parchmentBg from "../../assets/parchment-bg.webp";
import { ScrollPanel } from "../../components/medieval";
import { ShellCommand } from "../../ShellCommand";
import { installSkillCommand, siteLinks } from "../content";
import { ManuscriptLink } from "../ManuscriptLink";

export function HeroSection() {
	return (
		<section
			aria-labelledby="hero-title"
			className="relative overflow-hidden pb-14 pt-6 sm:pb-16"
		>
			<div aria-hidden className="absolute inset-0 z-0 mix-blend-luminosity">
				<div
					className="absolute inset-0 size-full opacity-20 saturate-50"
					style={{
						backgroundImage: `url(${parchmentBg})`,
						backgroundRepeat: "repeat",
						backgroundSize: "600px",
					}}
				/>
			</div>

			<div className="relative z-10 mx-auto max-w-6xl px-5">
				<div className="flex items-center justify-end pt-5 text-xs">
					<div className="border border-amber-950/50 bg-amber-400/50 shadow-xs">
						<span className="block px-3 py-1 font-display text-lg leading-none">
							✠ summer beta ✠
						</span>
					</div>
				</div>

				<div className="mb-10 mt-8 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:gap-20">
					<div className="flex flex-col justify-center gap-6 text-amber-950">
						<p className="font-display text-3xl leading-none">
							<span className="text-red-700">i.</span> exordium
						</p>
						<ScrollPanel
							insetClassName="-mx-6 -my-3 sm:-inset-x-8 sm:-inset-y-9"
							panelClassName="bg-amber-50"
						>
							<div className="px-3 py-6">
								<h1
									className="w-full font-bold font-heading text-5xl text-amber-950 leading-tight tracking-tight sm:text-6xl"
									id="hero-title"
								>
									Automate any website interaction
								</h1>
							</div>
						</ScrollPanel>

						<div className="mt-2 flex flex-col gap-7">
							<p className="max-w-xl text-lg leading-7 sm:text-xl">
								Stop running workflows manually by using these two ingredients
								to never run manual workflows again:
							</p>

							<div className="flex flex-col items-start gap-6">
								<div className="flex flex-col items-start gap-2">
									<h2 className="inline-flex items-center gap-2 font-heading text-2xl">
										<NumberCircleOneIcon
											aria-hidden
											className="size-8 text-red-800"
											weight="duotone"
										/>
										Add to your browser
									</h2>
									<ManuscriptLink
										className="ml-8"
										external
										href={siteLinks.chrome}
										size="lg"
										tone="crimson"
									>
										<GoogleChromeLogoIcon
											aria-hidden
											className="shrink-0 text-red-200"
											size={24}
											weight="duotone"
										/>
										Install extension
									</ManuscriptLink>
								</div>

								<div className="flex w-full flex-col items-start gap-2">
									<h2 className="inline-flex items-center gap-2 font-heading text-2xl">
										<NumberCircleTwoIcon
											aria-hidden
											className="size-8 text-red-800"
											weight="duotone"
										/>
										Connect your agent
									</h2>
									<div className="ml-8 w-[calc(100%_-_2rem)]">
										<ShellCommand command={installSkillCommand} />
									</div>
								</div>
							</div>
						</div>
					</div>

					<figure className="relative flex flex-col items-center justify-center pb-5 pt-4">
						<div
							aria-hidden
							className="parchment-scrap absolute inset-0 border border-red-800"
						/>
						<img
							alt="Illuminated-manuscript illustration of a harpist at her instrument"
							className="relative z-10 w-full max-w-[340px] mix-blend-multiply sm:max-w-[400px]"
							height="1024"
							src={harpistIllustration}
							width="1024"
						/>
						<figcaption className="relative z-10 mt-4 pb-2 font-marginalia italic text-ink/60 text-sm">
							fig. i — a harpist, playing a HAR file
						</figcaption>
					</figure>
				</div>
			</div>
		</section>
	);
}
