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
harpist auth replay <host> [templateKey|operationName] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose]
harpist openapi get <host>
harpist docs <host>
harpist handoff [host]
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local data in `~/.harpist-data`. Set `HARPIST_DATA_DIR` to use a different cache.

Agents should start expiring bridges with `harpist bridge --agent --idle-timeout 15m`. `/health` reports whether a bridge was started by an agent or a user.

`auth replay` executes the captured request with replay credentials applied and prints the response body by default. In a terminal it prompts for missing operation/input by default; use `--param`, `--query`, `--body`, or `--json` for scriptable input. Add `--verbose` to include request and response metadata, or `--curl` to print the runnable curl command instead.
