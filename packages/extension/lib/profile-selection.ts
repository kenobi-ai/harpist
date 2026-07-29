import {
	latestProfileNeedingRefinement,
	type ProfilesStore,
	type SiteProfile,
} from "@harpist/core/profiles";

export const selectPopupProfile = ({
	activeHost,
	documentationHost,
	profiles,
}: {
	activeHost?: string | null;
	documentationHost?: string | null;
	profiles: ProfilesStore;
}): SiteProfile | undefined => {
	const documentationProfile = documentationHost
		? profiles[documentationHost]
		: undefined;
	const activeProfile = activeHost ? profiles[activeHost] : undefined;

	return (
		documentationProfile ??
		activeProfile ??
		latestProfileNeedingRefinement(profiles)
	);
};
