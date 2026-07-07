import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type AuthLedger,
	type CredentialSet,
	type CredentialValidation,
	syncLedgerWithProfile,
} from "../../core/src/credentials";
import type { SiteProfile } from "../../core/src/profiles";

export const slug = (value: string) =>
	encodeURIComponent(value).replace(/%/g, "_").replace(/\./g, "-");

const isMissing = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: string }).code === "ENOENT";

export const credentialSetById = (
	ledger: AuthLedger,
	credentialId: string,
): CredentialSet => {
	const set = ledger.sets.find((item) => item.id === credentialId);
	if (!set) {
		throw new Error(
			`Unknown credential '${credentialId}' for '${ledger.host}'. Run \`harpist auth list ${ledger.host}\`.`,
		);
	}
	return set;
};

export const createAuthLedgerStore = (dataDir: string) => {
	const ledgerFile = (host: string) =>
		join(dataDir, "auth", `${slug(host)}.json`);

	const readLedger = async (host: string): Promise<AuthLedger | null> => {
		try {
			return JSON.parse(await readFile(ledgerFile(host), "utf8")) as AuthLedger;
		} catch (error) {
			if (isMissing(error)) {
				return null;
			}
			throw error;
		}
	};

	const writeLedger = async (ledger: AuthLedger) => {
		const file = ledgerFile(ledger.host);
		await mkdir(dirname(file), {
			mode: 0o700,
			recursive: true,
		});
		await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		await chmod(file, 0o600);
		return ledger;
	};

	const getLedger = async (profile: SiteProfile) => {
		const existing = await readLedger(profile.host);
		const { changed, ledger } = syncLedgerWithProfile(existing, profile);
		if (changed) {
			await writeLedger(ledger);
		}
		return ledger;
	};

	const patchLedger = async (
		profile: SiteProfile,
		patch: (ledger: AuthLedger) => AuthLedger,
	) =>
		writeLedger({
			...patch(await getLedger(profile)),
			updatedAt: new Date().toISOString(),
		});

	return {
		getLedger,
		recordValidation: (
			profile: SiteProfile,
			credentialId: string,
			validation: CredentialValidation,
		) =>
			patchLedger(profile, (ledger) => {
				credentialSetById(ledger, credentialId);
				return {
					...ledger,
					sets: ledger.sets.map((set) =>
						set.id === credentialId
							? {
									...set,
									validation,
								}
							: set,
					),
				};
			}),
		setActiveCredential: (profile: SiteProfile, credentialId: string | null) =>
			patchLedger(profile, (ledger) => {
				if (credentialId === null) {
					const { activeCredentialId: _cleared, ...rest } = ledger;
					return rest;
				}
				credentialSetById(ledger, credentialId);
				return {
					...ledger,
					activeCredentialId: credentialId,
				};
			}),
		setLoginUrl: (profile: SiteProfile, loginUrl: string) =>
			patchLedger(profile, (ledger) => ({
				...ledger,
				loginUrl,
			})),
	};
};
