<p align="center">
  <img src="packages/landing/src/assets/logo-illustration.webp" alt="Harpist" width="256" />
</p>

# Harpist

Harpist records website traffic in Chrome and turns it into agent-usable API docs, replayable authenticated requests, and oRPC/OpenAPI artifacts.

## Run

```sh
bun install
bun dev
bun run bridge
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local user data in `~/.harpist-data`. Set `HARPIST_DATA_DIR` to use a different cache.

Agents that need to start their own bridge should use an expiring bridge:

```sh
bunx harpist bridge --agent --idle-timeout 15m
```

Agent bridges report `startedBy: "agent"` from `/health` and exit after the idle timeout passes with no bridge HTTP traffic.

## Install CLI

```sh
bunx harpist help
```

Or install the package globally:

```sh
npm install -g harpist
harpist help
```

## Workspace

- `packages/extension`: WXT browser extension
- `packages/cli`: Harpist CLI and local bridge service
- `packages/core`: shared contracts, profiles, and HAR utilities

## Publishing

Maintainer release flow lives in [PUBLISHING.md](PUBLISHING.md). The npm package is `harpist`, and the installed bin is also `harpist`.

## Workflow

1. Open the website in the Harpist dev browser.
2. Click **Add recording** in the extension.
3. Use the website normally, then stop recording.
4. Ask an agent with the Harpist skill to refine that host.
5. Open the generated docs:

```sh
bun run harpist docs <host>
```

## Contract Profiles

Harpist writes a versioned `contract-profile.json` first. It is the portable source of truth for a host: service metadata, auth runtime notes, operations, JSON Schema request/response shapes, replay selectors, and Harpist provenance. The generated `contract.ts`, `openapi.json`, and docs bundle are derived artifacts.

## Useful CLI

<!-- harpist:cli-commands:start -->
```sh
bun run harpist bridge [--agent] [--idle-timeout <duration>]
bun run harpist version
bun run harpist purge
bun run harpist profiles list
bun run harpist profiles latest [host]
bun run harpist profiles get <host>
bun run harpist recordings latest [host]
bun run harpist recordings latest [host] --full
bun run harpist recordings get <host> <id> [--full]
bun run harpist refine latest [host]
bun run harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose]
bun run harpist auth list [host] [--json]
bun run harpist auth use [host] [credentialId|--clear]
bun run harpist auth check [host] [credentialId] [--all] [--json]
bun run harpist auth login [host] [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]
bun run harpist auth set-login-url [host] [url]
bun run harpist contract-profile get <host>
bun run harpist contract get <host>
bun run harpist openapi get <host>
bun run harpist docs <host>
bun run harpist docs apply <host> <docs.json|->
bun run harpist docs review <host>
bun run harpist handoff [host]
```
<!-- harpist:cli-commands:end -->

`auth replay` executes the captured request with replay credentials applied and prints the response body by default. In a terminal it prompts for a site, operation, and missing input when omitted; use `--param`, `--query`, `--body`, or `--json` for scriptable input. Add `--verbose` to include request and response metadata, or `--curl` to print the runnable curl command instead.
