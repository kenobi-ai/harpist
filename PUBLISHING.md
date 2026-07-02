# Publishing

Harpist publishes one npm package: `harpist`. The package installs the `harpist` bin and requires Bun.

## First Publish

Npm trusted publishing setup requires the package to already exist on the registry.

1. Bump the package with `bun run version:patch`, `bun run version:minor`, `bun run version:major`, or `bun run version:prerelease`.
2. Run `bun run publish:check`.
3. Publish the first version locally with `npm publish --workspace harpist`.
4. Configure trusted publishing with `bun run publish:setup`.

Use these npm trusted publisher settings:

- package: `harpist`
- provider: GitHub Actions
- organization or user: `kenobi-ai`
- repository: `harpist`
- workflow filename: `publish.yml`
- environment name: `npm`
- allowed action: `npm publish`

Create a GitHub environment named `npm` if you want an approval gate before publishing.

## Release Flow

1. Bump the package with `bun run version:patch`, `bun run version:minor`, `bun run version:major`, or `bun run version:prerelease`.
2. Run `bun run publish:check`.
3. Commit the version change.
4. Create and publish a GitHub release tagged `vX.Y.Z`.

Publishing the GitHub release runs `.github/workflows/publish.yml`. Prereleases publish with the `next` dist-tag; normal releases publish with `latest`.

You can also run the workflow manually from `main`. Use `dry_run` first when you want the full CI path without publishing.
