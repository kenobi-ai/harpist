<p align="center">
  <img src="packages/extension/assets/logo_illustration.png" alt="Harpist" width="256" />
</p>

# Harpist

Harpist records website traffic in Chrome and turns it into agent-usable API docs, replayable auth curl commands, and oRPC/OpenAPI artifacts.

## Run

```sh
bun install
bun dev
bun run bridge
```

The bridge runs at `http://127.0.0.1:4277` by default and stores local user data in `.harpist-data` from the directory where the CLI is run.

## Workspace

- `packages/extension`: WXT browser extension
- `packages/cli`: Harpist CLI and local bridge service
- `packages/core`: shared contracts, profiles, and HAR utilities

## Workflow

1. Open the website in the Harpist dev browser.
2. Click **Add recording** in the extension.
3. Use the website normally, then stop recording.
4. Ask an agent with the Harpist skill to refine that host.
5. Open the generated docs:

```sh
bun run harpist docs <host>
```

## Useful CLI

```sh
bun run harpist profiles list
bun run harpist recordings latest <host>
bun run harpist refine latest <host>
bun run harpist docs review <host>
bun run harpist auth replay <host> <operationName-or-templateKey>
```

`auth replay` prints a runnable curl command with captured browser credentials applied.
