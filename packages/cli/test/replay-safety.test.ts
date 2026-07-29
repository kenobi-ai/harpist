import { describe, expect, test } from "bun:test";
import { methodRequiresConfirmation } from "../src/replay-safety";

describe("replay safety", () => {
	test("requires confirmation for every method outside the read allowlist", () => {
		expect(methodRequiresConfirmation("GET")).toBe(false);
		expect(methodRequiresConfirmation("HEAD")).toBe(false);
		expect(methodRequiresConfirmation("OPTIONS")).toBe(false);
		expect(methodRequiresConfirmation("POST")).toBe(true);
		expect(methodRequiresConfirmation("PROPFIND")).toBe(true);
	});
});
