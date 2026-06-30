# Harpist

Harpist records website traffic in a Chrome extension and lets agents refine those recordings into oRPC/OpenAPI contracts through a local bridge.

## Shape

- Extension: records HAR data, stores a local outbox, and shows profile summaries.
- Bridge/CLI: owns the canonical local cache while active and exposes oRPC/OpenAPI/docs.
- Skill: starts or reuses the bridge, waits for extension sync, then mutates profiles through the bridge.

The extension works without the bridge. When the bridge is active, the extension syncs recordings up and mirrors canonical profile data back down.

Recordings capture an auth bundle by default. If a session credential was not captured, the profile reports `Recapture auth`; make one fresh recording while signed in, then run refinement again.

## Commands

```sh
bun dev
bun run bridge
bun run harpist profiles list
bun run harpist recordings latest <host>
bun run harpist refine latest <host>
bun run harpist auth replay <host> [templateKey|operationName]
bun run harpist contract get <host>
bun run harpist openapi get <host>
```

Use `--full` with `recordings latest` or `recordings get` only when an agent needs the raw HAR.

The bridge listens on `127.0.0.1:4277` by default. Override with `HARPIST_HOST`, `HARPIST_PORT`, and `HARPIST_DATA_DIR`.
