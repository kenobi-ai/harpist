import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { type HarpistContract, harpistContract } from "./bridge-contract";
import { normaliseServerUrl } from "./profiles";

const resolveRpcUrl = (baseUrl: string) => `${normaliseServerUrl(baseUrl)}/rpc`;

export type HarpistBridgeClient = ContractRouterClient<HarpistContract>;

export const createHarpistBridgeClient = (
	baseUrl: string,
): HarpistBridgeClient => {
	const link = new RPCLink({
		url: () => resolveRpcUrl(baseUrl),
	});
	return createORPCClient(link) as HarpistBridgeClient;
};

export const bridgeContract = harpistContract;
