import {
	runAuthCheckCommand,
	runAuthListCommand,
	runAuthSetLoginUrlCommand,
	runAuthUseCommand,
} from "./auth-commands";
import { runAuthLoginCommand } from "./auth-login-command";
import { runAuthReplayCommand } from "./auth-replay-command";
import type { BridgeStore } from "./store";

export const runAuthCommand = async (
	store: BridgeStore,
	args: string[],
	options: {
		bridgeUrl: string;
	},
) => {
	const subcommand = args[0] ?? "replay";
	if (subcommand === "replay") {
		await runAuthReplayCommand(store, args);
	} else if (subcommand === "list") {
		await runAuthListCommand(store, args.slice(1));
	} else if (subcommand === "use") {
		await runAuthUseCommand(store, args.slice(1));
	} else if (subcommand === "check") {
		await runAuthCheckCommand(store, args.slice(1));
	} else if (subcommand === "login") {
		await runAuthLoginCommand(store, args.slice(1), options);
	} else if (subcommand === "set-login-url") {
		await runAuthSetLoginUrlCommand(store, args.slice(1));
	} else {
		return false;
	}
	return true;
};
