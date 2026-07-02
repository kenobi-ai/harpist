# Publishing

Harpist publishes one npm package: `harpist`. The package installs the `harpist` bin and requires Bun.

The normal publish path is GitHub Releases plus npm trusted publishing. Local `npm publish` is only for the first publish or emergencies.

## Normal Release

1. Make the code changes.
2. Bump `packages/cli/package.json`:

```sh
bun run version:patch
```

Use `version:minor`, `version:major`, or `version:prerelease` when appropriate.

3. Run the release check:

```sh
bun run publish:check
```

4. Commit and push:

```sh
git add .
git commit -m "Release vX.Y.Z"
git push
```

5. In GitHub, create a new release:

- tag: `vX.Y.Z`
- target: the commit you pushed
- prerelease: checked only for prereleases

Publishing the GitHub release runs `.github/workflows/publish.yml`. Normal releases publish to the `latest` npm dist-tag. GitHub prereleases publish to `next`.

The tag and package version must match exactly: `v0.1.2` for package version `0.1.2`. The publish workflow verifies this before publishing.

Rerunning a failed release job reruns the same release tag commit. If you push a fix after the release failed, create a new release from the fixed commit, or delete and recreate the failed release/tag so it points at the fixed commit.

## Manual Workflow Run

The publish workflow can also be run manually from `main`.

Use `dry_run: true` first. A manual non-dry-run publish uses the selected `npm_tag`, so choose `latest` for stable releases and `next` for prereleases.

## Version Helpers

- `bun run version:patch`: `0.1.2` -> `0.1.3`
- `bun run version:minor`: `0.1.2` -> `0.2.0`
- `bun run version:major`: `0.1.2` -> `1.0.0`
- `bun run version:prerelease`: `0.1.2` -> `0.1.3-next.0`

The helpers only edit `packages/cli/package.json`. They do not commit, tag, or publish.

## Package Check

`bun run publish:check` runs:

- TypeScript compile for every workspace
- Bun tests
- pokayoke checks
- Bun package dry run for `harpist`

Bun resolves `catalog:` dependencies while packing. The npm tarball should contain only:

- `README.md`
- `dist/cli.js`
- `package.json`

`dist/cli.js` is built automatically by the package `prepack` script.

## Trusted Publishing Setup

Trusted publishing is configured in npm for this repo. If it needs to be recreated, run:

```sh
bun run publish:setup
```

Use these npm trusted publisher settings:

- package: `harpist`
- provider: GitHub Actions
- organization or user: `kenobi-ai`
- repository: `harpist`
- workflow filename: `publish.yml`
- environment name: `npm`
- allowed action: `npm publish`

Create a GitHub environment named `npm` if you want an approval gate before publishing.

## Local Publish

Local publishing is not the normal release path. Use it only for the first publish of the package or if GitHub Actions is unavailable.

Stable local publish:

```sh
npm login
bun run publish:check
cd packages/cli
bun pm pack --destination /private/tmp/harpist-publish
npm publish /private/tmp/harpist-publish/harpist-X.Y.Z.tgz
```

Prerelease local publish:

```sh
npm login
bun run publish:check
cd packages/cli
bun pm pack --destination /private/tmp/harpist-publish
npm publish /private/tmp/harpist-publish/harpist-X.Y.Z.tgz --tag next
```
