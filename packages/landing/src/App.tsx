import { LandingPage } from "./landing/LandingPage";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

const currentPath = () => {
	if (typeof window === "undefined") {
		return "/";
	}
	return window.location.pathname.replace(/\/+$/, "") || "/";
};

export function App() {
	if (currentPath() === "/privacy") {
		return <PrivacyPolicyPage />;
	}

	return <LandingPage />;
}
