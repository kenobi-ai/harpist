import type { PopupState } from "@harpist/core/profiles";

const pageSummary = (
	page:
		| PopupState["activeDocumentation"]
		| PopupState["activePage"]
		| PopupState["activeRecording"],
) =>
	page
		? {
				host: page.host,
				title: page.title,
			}
		: null;

export const buildDebugSnapshot = (state: PopupState | null) => {
	if (!state) {
		return null;
	}
	return {
		activeDocumentation: pageSummary(state.activeDocumentation),
		activePage: pageSummary(state.activePage),
		activeRecording: state.activeRecording
			? {
					host: state.activeRecording.host,
					startedAt: state.activeRecording.startedAt,
					tabId: state.activeRecording.tabId,
					title: state.activeRecording.title,
				}
			: null,
		bridge: state.bridge,
		capture: state.capture,
		diagnostics: state.diagnostics.map(({ at, level, message, operation }) => ({
			at,
			level,
			message,
			operation,
		})),
		profiles: Object.fromEntries(
			Object.entries(state.profiles).map(([host, profile]) => [
				host,
				{
					authType: profile.auth.type,
					credentialed: profile.auth.credentialed === true,
					derivedEndpointCount: profile.derivedEndpointCount,
					lastRecordingId: profile.lastRecordingId,
					latestAuthStatus: profile.latestAuth?.status,
					recordingCount: profile.recordingCount,
					status: profile.status,
					updatedAt: profile.updatedAt,
				},
			]),
		),
		settings: state.settings,
	};
};
