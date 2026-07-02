import { oc } from "@orpc/contract";
import type {
	Mutable,
	ORPCOperation,
	ORPCResourceContract,
	ResourceOperationDefinition,
} from "./orpc-types";

export const defineResourceOperations = <
	const Operations extends Record<string, ResourceOperationDefinition>,
>(
	operations: Operations,
) => operations;

const createOrpcOperation = <
	const Operation extends ResourceOperationDefinition,
>(
	operation: Operation,
): ORPCOperation<Operation> =>
	oc.route(operation.route).input(operation.input).output(operation.output);

const assignOrpcOperation = <
	const Operations extends Record<string, ResourceOperationDefinition>,
	const Name extends keyof Operations,
>(
	contract: Mutable<ORPCResourceContract<Operations>>,
	operations: Operations,
	name: Name,
) => {
	contract[name] = createOrpcOperation(operations[name]);
};

export const createORPCResourceContract = <
	const Operations extends Record<string, ResourceOperationDefinition>,
>(
	operations: Operations,
): ORPCResourceContract<Operations> => {
	const contract = {} as Mutable<ORPCResourceContract<Operations>>;

	for (const name of Object.keys(operations)) {
		assignOrpcOperation(contract, operations, name);
	}

	return contract;
};
