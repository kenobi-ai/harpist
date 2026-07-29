# Harpist

Harpist records website traffic in Chrome and turns it into agent-usable API docs, replayable authenticated requests, and oRPC/OpenAPI artifacts.

## Install

Harpist is a Bun CLI.

```sh
bunx harpist help
```

Or install it globally:

```sh
npm install -g harpist
harpist help
```

## Common Commands

```sh
harpist bridge [--agent] [--idle-timeout <duration>]
harpist version
harpist purge
harpist profiles list [--output <path>] [--force]
harpist profiles latest [host] [--output <path>] [--force]
harpist recordings latest [host] [--full] [--output <path>] [--force]
harpist refine latest [host]
harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose] [--yes]
harpist auth list [host] [--json]
harpist auth use <host> <credentialId|--clear>
harpist auth check <host> [credentialId] [--all] [--json]
harpist auth login <host> [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]
harpist endpoints upsert <host> <endpoint.json|->
harpist endpoints remove <host> <templateKey>
harpist openapi get <host> [--output <path>] [--force]
harpist docs <host>
harpist handoff [host]
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local data in `~/.harpist-data`. Set `HARPIST_DATA_DIR` to use a different cache.

Agents should start expiring bridges with `harpist bridge --agent --idle-timeout 15m`. `/health` reports whether a bridge was started by an agent or a user.

`auth replay` executes the captured request with replay credentials applied and prints the response body by default. In a terminal it prompts for a site, operation, missing input, and confirmation for methods outside GET/HEAD/OPTIONS. The same methods require `--yes` non-interactively; review `--redacted-curl` with the user first. Redacted output removes auth, dynamic path values, query values, and body values. Use `--param`, `--query`, `--body`, or `--json` for scriptable input. Add `--verbose` for redacted request metadata and response metadata, or `--curl` to print the unredacted runnable command.

Large profile, recording, contract, and OpenAPI reads should use `--output <path>`. Harpist writes the complete payload directly to that file and refuses to overwrite an existing file unless `--force` is present.

`endpoints upsert` and `endpoints remove` are durable identity corrections. They survive later extension syncs and mark generated artifacts as drafts until refinement and docs review run again.

The extension keeps unsynced recordings locally and retries the loopback bridge in the background. Browser pages receive only the redacted docs contract; raw profile, replay, and contract routes are limited to the extension and local non-browser clients.

Every recording adds a credential set (session cookies, API keys, bearer tokens) to a per-host auth history. `auth list` shows the sets with expiry and validation status, `auth use` pins one as the replay default, and `auth check` validates them against a recorded GET endpoint. When credentials expire, `auth login` re-captures a session: with the Harpist extension installed (Chrome) it opens the login page and records the sign-in automatically, stopping itself once fresh credentials are observed; without it, it opens the login page and waits for you to sign in and add a recording. Replay responses feed back into the history: a 401/403 marks the used set invalid, a 2xx marks it valid. Extension command traffic is maintenance traffic — it never keeps an `--idle-timeout` bridge alive.
