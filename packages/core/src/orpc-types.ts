import type { ContractProcedure } from "@orpc/contract";
import type { z } from "zod";

type ResourceOperationRoute = {
	readonly description?: string;
	readonly method: "DELETE" | "GET" | "PATCH" | "POST";
	readonly operationId: string;
	readonly path: `/${string}`;
	readonly summary: string;
	readonly tags: readonly string[];
};

export type ResourceOperationDefinition<
	Input extends z.ZodType = z.ZodType,
	Output extends z.ZodType = z.ZodType,
> = {
	readonly input: Input;
	readonly output: Output;
	readonly route: ResourceOperationRoute;
};

type EmptyErrorMap = Record<never, never>;
type EmptyMeta = Record<never, never>;

export type ORPCOperation<Operation extends ResourceOperationDefinition> =
	ContractProcedure<
		Operation["input"],
		Operation["output"],
		EmptyErrorMap,
		EmptyMeta
	>;

export type ORPCResourceContract<
	Operations extends Record<string, ResourceOperationDefinition>,
> = {
	readonly [Name in keyof Operations]: ORPCOperation<Operations[Name]>;
};

export type Mutable<T> = {
	-readonly [Name in keyof T]: T[Name];
};
