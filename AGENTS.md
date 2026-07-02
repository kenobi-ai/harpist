# Repository Instructions

- Before reporting code or config work as done, run `bun run fix` and then `bun run check`.
- If `bun run check` reports fixable Biome diagnostics, run `bun run fix` again before rerunning `bun run check`.
- Keep `biome.json` close to Biome defaults. Prefer small repo-specific switches over enumerating rules.
- Keep package dependencies on the root Bun catalog. External dependencies should use `catalog:`; internal workspace packages should use `workspace:*`.
- Do not start a dev service for this repo. If a running service is needed and none is already available, ask the user to start it.
