import { describe, expect, test } from "bun:test";
import { docsPage } from "../src/profile-docs";

describe("generated profile docs page", () => {
	test("wraps Scalar in the Harpist landing theme", () => {
		const page = docsPage("api.example.test");

		expect(page).toContain('class="harpist-docs-header"');
		expect(page).toContain('class="harpist-docs-rule"');
		expect(page).toContain("--harpist-color-rubric: #9e0812");
		expect(page).toContain(
			"--scalar-color-accent: var(--harpist-color-rubric)",
		);
		expect(page).toContain("withDefaultFonts:false");
		expect(page).toContain(
			'url:"/profiles/api.example.test/openapi.scalar.json"',
		);
	});

	test("escapes the visible host while keeping the OpenAPI URL script-safe", () => {
		const host = "api.example.test'</script><script>alert(1)</script>";
		const page = docsPage(host);

		expect(page).toContain(
			"api.example.test&#39;&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
		);
		expect(page).not.toContain("api.example.test'</script><script>");
		expect(page).toContain(
			`url:${JSON.stringify(
				`/profiles/${encodeURIComponent(host)}/openapi.scalar.json`,
			)}`,
		);
	});
});
