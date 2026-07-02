# Harpist

Harpist records website traffic in Chrome and turns it into agent-usable API docs, replayable auth curl commands, and oRPC/OpenAPI artifacts.

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
harpist bridge
harpist version
harpist purge
harpist profiles list
harpist profiles latest [host]
harpist recordings latest [host]
harpist refine latest [host]
harpist auth replay <host> [templateKey|operationName]
harpist openapi get <host>
harpist docs <host>
harpist handoff [host]
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local data in `~/.harpist-data`. Set `HARPIST_DATA_DIR` to use a different cache.
