import { MedievalDefs, ScrollBand } from "../components/medieval";
import { LandingFooter } from "../LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { AgentsSection } from "./sections/AgentsSection";
import { DocumentationSection } from "./sections/DocumentationSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { OpenSourceSection } from "./sections/OpenSourceSection";
import { UseCasesSection } from "./sections/UseCasesSection";

export function LandingPage() {
	return (
		<main className="parchment min-h-screen bg-olive-100 font-sans text-ink antialiased">
			<MedievalDefs />
			<div aria-hidden className="h-1.5 bg-rubric" />
			<LandingHeader />
			<HeroSection />

			<div className="relative h-24 sm:h-28">
				<ScrollBand className="absolute inset-x-0 -top-8" />
			</div>

			<HowItWorksSection />
			<DocumentationSection />
			<ScrollBand />
			<AgentsSection />
			<ScrollBand />
			<UseCasesSection />
			<ScrollBand />
			<OpenSourceSection />
			<LandingFooter />
		</main>
	);
}
