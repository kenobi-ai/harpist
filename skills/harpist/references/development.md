# Harpist Development Mode

Read this only when the user is working from the Harpist source checkout, editing Harpist itself, or explicitly asks to test unpublished local changes.

## Command Selection

- Use the published package for normal skill work: `bunx harpist <command>`.
- Use repo-local commands only from the Harpist repo root.
- Do not hunt for `packages/cli/dist/cli.js`, `packages/cli/src/cli.ts`, or a generated bin path. The repo scripts own local CLI execution.
- Run the bridge and CLI commands from the same repo root, or set `HARPIST_DATA_DIR`, so every command reads the same local cache.

## Local Commands

```sh
bun run bridge -- --agent --idle-timeout 15m
bun run harpist profiles list [--output <path>] [--force]
bun run harpist profiles latest [host] [--output <path>] [--force]
bun run harpist profiles get <host> [--output <path>] [--force]
bun run harpist recordings latest [host] [--full] [--output <path>] [--force]
bun run harpist recordings get <host> <id> [--full] [--output <path>] [--force]
bun run harpist refine latest [host]
bun run harpist auth replay [host] [templateKey|operationName] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose] [--yes]
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

## Bridge Rules

- Check `http://127.0.0.1:4277/health` before starting anything. Reuse a healthy bridge.
- When you start the bridge yourself, use agent mode with an idle timeout: `bun run bridge -- --agent --idle-timeout 15m`.
- Treat a healthy bridge with `startedBy: "user"` or no `startedBy` field as user-managed. Reuse it, but do not stop or restart it without asking.
- Do not start a bridge or extension dev service in a sandbox, CI runner, or container that cannot reach the user's browser extension state.
- If the user or repository says they manage dev services manually, ask them to start the bridge instead of starting another service or choosing another port.

## Source Changes

- Keep Harpist source provider-agnostic. Do not add website-specific hostnames, product names, path semantics, auth quirks, or docs copy to the extension, bridge, CLI, or generic refiner.
- Put provider-specific interpretation in profile data and artifacts through bridge writes.
- After changing Harpist source, run the repository's required checks before reporting the work done.
