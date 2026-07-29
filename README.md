<p align="center">
  <img src="packages/landing/src/assets/logo-illustration.webp" alt="Harpist" width="256" />
</p>

# Harpist

<p align="center">
  <a href="https://www.skills.sh/kenobi-ai/harpist/harpist"><img alt="Harpist agent skill" src="https://img.shields.io/badge/agent%20skill-skills.sh-111827" /></a>
  <a href="https://www.npmjs.com/package/harpist"><img alt="harpist on npm" src="https://img.shields.io/npm/v/harpist?logo=npm&amp;label=npm" /></a>
  <a href="https://chromewebstore.google.com/detail/harpist/gfdmoknmgjkkhkeoocffiogceamcegmb"><img alt="Harpist on the Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/gfdmoknmgjkkhkeoocffiogceamcegmb?logo=googlechrome&amp;label=Chrome%20Web%20Store" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue" /></a>
</p>

Harpist records website traffic in Chrome and turns it into agent-usable API documentation, replayable authenticated requests, and oRPC/OpenAPI artifacts. The recorder, bridge, generated contracts, and credentials stay on your machine.

- [Install the Chrome extension](https://chromewebstore.google.com/detail/harpist/gfdmoknmgjkkhkeoocffiogceamcegmb)
- [Install or read the agent skill](https://www.skills.sh/kenobi-ai/harpist/harpist)
- [Run the CLI from npm](https://www.npmjs.com/package/harpist)
- [Visit the project site](https://harpist.site)

## Quick start

Harpist requires Chrome and [Bun](https://bun.sh) 1.3 or newer. Install the extension, then add the skill to your agent:

```sh
npx skills add kenobi-ai/harpist
```

Start the local bridge in a terminal:

```sh
bunx harpist bridge
```

The bridge listens on `http://127.0.0.1:4277`. Leave it running while you record and refine a workflow.

1. Open the site you want to document.
2. Click **Add recording** in the Harpist extension.
3. Use the site normally, then click **Finish recording** or Chrome's debugging **Cancel** button. Harpist records the starting tab and any tabs it opens; unrelated tabs are ignored.
4. Click **Copy agent prompt** and paste it into an agent with the Harpist skill. The recording is already saved; bridge sync runs separately and retries in the background.

For example:

> Use Harpist to refine my latest recording for example.com, verify the authenticated requests, and generate agent-ready docs.

You can also run the first pass yourself:

```sh
bunx harpist refine latest example.com
bunx harpist docs example.com
```

The second command prints the local documentation URL. To install the CLI globally instead, run `npm install -g harpist`; the installed executable still requires Bun.

Agents that start their own bridge should use an expiring process:

```sh
bunx harpist bridge --agent --idle-timeout 15m
```

## How it works

```text
Chrome extension -> local bridge and cache -> contract profile -> oRPC, OpenAPI, docs, and replay
                         ^                                         |
                         +------------- CLI + agent skill ---------+
```

The extension captures the network trail behind a browser workflow and syncs it to the loopback bridge. Harpist writes a versioned `contract-profile.json` as the portable source of truth for each host. `contract.ts`, `openapi.json`, and the local documentation site are derived from that profile.

Recordings are additive: later recordings refresh credentials and extend the known API without discarding useful endpoints from earlier sessions.

## Develop from source

### Set up the workspace

You need Git, Chrome or Chromium, and Bun 1.3 or newer.

```sh
git clone https://github.com/kenobi-ai/harpist.git
cd harpist
bun install
```

The repository is a Bun workspace:

- `packages/extension` — WXT browser extension
- `packages/cli` — CLI and local bridge
- `packages/core` — shared contracts, profiles, and HAR utilities
- `packages/landing` — public project site
- `skills/harpist` — published agent skill and development reference

### Browser extension

Run the extension in WXT's Chrome development profile with live rebuilds:

```sh
bun run dev
```

Build a production extension:

```sh
bun run build
```

The unpacked build is written to `packages/extension/dist/chrome-mv3`. To use it in your regular Chrome profile:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/extension/dist/chrome-mv3`.

Create a Chrome Web Store archive with:

```sh
bun run zip
```

The versioned archive is written to `packages/extension/dist`. Firefox development, build, and archive variants are available as `bun run dev:firefox`, `bun run build:firefox`, and `bun run zip:firefox`.

### CLI and bridge

Build the distributable CLI and run the source checkout:

```sh
bun run build:cli
bun run harpist help
bun run bridge
```

The build is written to `packages/cli/dist/cli.js`. Do not run a second bridge on another port when one is already active; the extension and CLI should share the same bridge and data directory.

For an isolated development cache:

```sh
HARPIST_DATA_DIR="$PWD/.harpist-data" bun run bridge
```

### Agent skill

The skill is plain Markdown plus references and has no build step. Install the checked-out version into a supported agent from the repository root:

```sh
npx skills add . --skill harpist
```

Add `--global` for a user-level installation. The source entry point is [`skills/harpist/SKILL.md`](skills/harpist/SKILL.md).

### Landing site

Run, build, or preview the public site independently:

```sh
bun run --filter @harpist/landing dev
bun run --filter @harpist/landing build
bun run --filter @harpist/landing preview
```

Deployment uses the Cloudflare configuration in `packages/landing/wrangler.jsonc` and requires access to the configured account:

```sh
bun run --filter @harpist/landing deploy
```

### Validate changes

```sh
bun run fix
bun run check
```

`check` runs Biome, TypeScript, the Bun test suites, Knip, and the repository policy checks.

## Local data and configuration

Harpist stores recordings, request and response bodies, and captured authentication material locally. The default cache is `~/.harpist-data`; treat it as sensitive and do not commit it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HARPIST_HOST` | `127.0.0.1` | Bridge bind address |
| `HARPIST_PORT` | `4277` | Bridge port |
| `HARPIST_DATA_DIR` | `~/.harpist-data` | Profiles, recordings, credentials, and generated artifacts |

### Security model

Harpist deliberately has powerful capabilities, so security scanners may classify the skill or CLI as high risk:

- the CLI can download through `bunx`, starts a loopback network service, and reads browser-captured recordings;
- recordings can contain cookies, bearer tokens, API keys, request bodies, and response data;
- `auth login` can open or observe browser tabs; and
- `auth replay` can send captured authentication to a live API.

The bridge binds to `127.0.0.1` by default. Browser pages cannot read its raw profile, replay, or contract APIs; the docs view receives a redacted contract. Local profile, recording, refinement, contract, and docs commands do not call the recorded site's API. Review a replay with `--redacted-curl` first: it removes auth, dynamic path values, query values, and body values. Methods outside GET/HEAD/OPTIONS ask for confirmation interactively and are refused non-interactively unless `--yes` is supplied after user approval. Avoid unredacted `--curl` output because it can expose credentials and captured request data.

## Useful CLI commands

The commands below run the source checkout. Replace `bun run harpist` with `bunx harpist` when using the published package.

<!-- harpist:cli-commands:start -->
```sh
bun run harpist bridge [--agent] [--idle-timeout <duration>]
bun run harpist version
bun run harpist purge
bun run harpist profiles list [--output <path>] [--force]
bun run harpist profiles latest [host] [--output <path>] [--force]
bun run harpist profiles get <host> [--output <path>] [--force]
bun run harpist recordings latest [host] [--full] [--output <path>] [--force]
bun run harpist recordings get <host> <id> [--full] [--output <path>] [--force]
bun run harpist refine latest [host]
bun run harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose] [--yes]
bun run harpist auth list [host] [--json]
bun run harpist auth use [host] [credentialId|--clear]
bun run harpist auth check [host] [credentialId] [--all] [--json]
bun run harpist auth login [host] [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]
bun run harpist auth set-login-url [host] [url]
bun run harpist endpoints upsert <host> <endpoint.json|->
bun run harpist endpoints remove <host> <templateKey>
bun run harpist contract-profile get <host> [--output <path>] [--force]
bun run harpist contract get <host> [--output <path>] [--force]
bun run harpist openapi get <host> [--output <path>] [--force]
bun run harpist docs <host>
bun run harpist docs apply <host> <docs.json|->
bun run harpist docs review <host>
bun run harpist handoff [host]
```
<!-- harpist:cli-commands:end -->

`auth replay` executes a recorded operation with captured browser credentials. In a terminal it prompts for the site, operation, missing input, and confirmation before a mutating request. Use `--param`, `--query`, `--body`, or `--json` for scripted input. Prefer `--redacted-curl` for review; add `--verbose` for request and response metadata.

Large profile, recording, contract, and OpenAPI reads support `--output <path>`. File output avoids shell or agent output limits, and existing files are protected unless `--force` is passed.

## Publishing

Maintainer release instructions live in [PUBLISHING.md](PUBLISHING.md). The npm package and installed executable are both named `harpist`.

## License

[MIT](LICENSE)
