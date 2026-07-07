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
harpist profiles list
harpist profiles latest [host]
harpist recordings latest [host]
harpist refine latest [host]
harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose]
harpist auth list [host] [--json]
harpist auth use <host> <credentialId|--clear>
harpist auth check <host> [credentialId] [--all] [--json]
harpist auth login <host> [--url <url>] [--no-open] [--no-wait] [--timeout <duration>]
harpist openapi get <host>
harpist docs <host>
harpist handoff [host]
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local data in `~/.harpist-data`. Set `HARPIST_DATA_DIR` to use a different cache.

Agents should start expiring bridges with `harpist bridge --agent --idle-timeout 15m`. `/health` reports whether a bridge was started by an agent or a user.

`auth replay` executes the captured request with replay credentials applied and prints the response body by default. In a terminal it prompts for a site, operation, and missing input when omitted; use `--param`, `--query`, `--body`, or `--json` for scriptable input. Add `--verbose` to include request and response metadata, or `--curl` to print the runnable curl command instead.

Every recording adds a credential set (session cookies, API keys, bearer tokens) to a per-host auth history. `auth list` shows the sets with expiry and validation status, `auth use` pins one as the replay default, and `auth check` validates them against a recorded GET endpoint. When credentials expire, `auth login` re-captures a session: with the Harpist extension installed (Chrome) it opens the login page and records the sign-in automatically, stopping itself once fresh credentials are observed; without it, it opens the login page and waits for you to sign in and add a recording. Replay responses feed back into the history: a 401/403 marks the used set invalid, a 2xx marks it valid. Extension command traffic is maintenance traffic — it never keeps an `--idle-timeout` bridge alive.
