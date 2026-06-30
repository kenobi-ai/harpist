---
name: harpist
description: Use when a user asks an agent to inspect, refine, or generate an API/oRPC/OpenAPI contract from website recordings captured by the Harpist Chrome extension. Covers starting the local Harpist bridge, syncing extension recordings, selecting the right host/profile, reading HAR recordings, and writing profile/auth/endpoint/artifact updates back through the bridge.
---

# Harpist

Harpist turns website traffic recorded by the Chrome extension into agent-usable API contracts and replayable requests. The extension records and mirrors data locally; the bridge/CLI owns the canonical local cache while this skill is running.

## Core Model

- Treat recordings as additive. A new recording should improve or refresh a profile, not erase useful endpoints from earlier recordings.
- Treat generated docs/contracts as cumulative best guesses for the profile.
- Treat captured auth as first-class replay material. The normal way to test an endpoint is `auth.replay` or `harpist auth replay`, which returns a runnable curl command with captured browser credentials already applied.
- Treat the latest recording as the freshest source of credentials. If current credentials are missing or expired, ask the user to click Add recording while signed in, then refine again.
- Do not ask the user to manually copy cookies out of DevTools unless Harpist has failed to capture replay material.
- Keep Harpist source provider-agnostic. Do not add website-specific hostnames, product names, path semantics, auth quirks, or copy to the extension, bridge, CLI, or generic refiner.
- Put provider-specific understanding in the profile you write through the bridge: endpoint annotations, generated OpenAPI/oRPC artifacts, profile notes, and docs descriptions.
- Keep the order strict: run the generic refine first, then perform the skill documentation pass. Running `refine latest` after the docs pass will overwrite polished descriptions with neutral drafts, so run the docs pass again if you refine again.

## Documentation Standard

- Take visible care with generated docs. Do not ship placeholder prose such as "included because it has an API-shaped host or path" as user-facing endpoint documentation.
- Give every included endpoint a specific purpose statement inferred from path, method, host, request body, response shape, auth/access metadata, and surrounding workflow.
- Keep descriptions short, concrete, and operational: what the endpoint does, whose/account state it touches, and whether replay uses captured browser credentials or a captured request body.
- Keep docs navigation quiet. Avoid long operation-id chips, repetitive badges, and internal classification labels unless they directly help a user choose or replay an endpoint.
- Preserve technical metadata under `x-harpist`, tags, operation IDs, and artifacts for agents, but do not let those internals dominate the human docs.
- Before handing back refined docs, inspect at least a representative sample of the rendered OpenAPI/Scalar output and fix repeated descriptions, ugly labels, stale endpoints, and misleading auth/replay claims.
- The skill is responsible for the documentation pass. The built-in refiner may produce neutral drafts; you must improve them through bridge writes before calling the docs refined.
- When a site needs bespoke interpretation, write that interpretation into the profile/artifacts for that host. Never patch generic Harpist code with that site's details.
- Every documented operation should have a distinct summary, a distinct useful description, and replay material available through `auth.replay`, `harpist auth replay`, or the Scalar Harpist auth curl example.

## Workflow

1. Start or reuse the bridge.
   - Prefer `bun run bridge` from the Harpist repo during development.
   - Prefer `harpist bridge` once the CLI is installed.
   - Wait for `http://127.0.0.1:4277/health` to return OK.

2. Ask the user to open the Harpist popup if the latest extension recording has not appeared yet.
   - The extension syncs its recording outbox to the bridge when it detects an active bridge or when the user clicks Handoff.
   - Do not assume the bridge can read Chrome extension storage directly.

3. Choose the target profile.
   - Default to the active tab host when the user names or implies a website.
   - Otherwise use the most recent profile: `harpist profiles latest`.
   - If multiple hosts are plausible, ask the user which host to refine.

4. Run the built-in first-pass refinement unless the user explicitly asks for inspection only.
   - In the Harpist repo, use `bun run harpist refine latest <host>`.
   - Once installed globally, use `harpist refine latest <host>`.
   - If no host is specified, use the same command without the host.
   - This command writes endpoint inclusion annotations, auth bundle status, neutral draft oRPC/OpenAPI artifacts, and marks the latest recording processed.
   - Keep useful endpoints from previous recordings unless there is strong evidence they are noise, static assets, telemetry, or third-party vendor traffic.
   - Exclude endpoints whose only sampled responses are HTML access/error pages, even if the URL path looks API-shaped.
   - If the profile reports `Recapture auth`, ask the user to click Add recording on the target site while signed in, then run refinement again.
   - Treat this output as a draft. Do not stop here unless the user explicitly asked only for a generic sweep.

5. Inspect the latest recording and profile when deeper work is needed.
   - CLI: `harpist profiles get <host>` and `harpist recordings latest <host>`.
   - oRPC: `profiles.get`, `recordings.latest`, `recordings.get`, `handoff.get`.

6. Refine the profile further through bridge writes.
   - Use `auth.replay` for curl/replay material. It should be the default way to test an endpoint.
   - Prefer replaying by `templateKey` or `operationName`; do not reconstruct auth headers by hand.
   - If replay warns that the captured sample was a 4xx/5xx HTML error page, exclude or downgrade that endpoint instead of presenting it as a healthy API.
   - If replay fails with no sample, keep the endpoint documented but ask for a recording of that workflow.
   - Rewrite endpoint summaries/descriptions into human documentation with `endpoints.annotate` and/or `profiles.setArtifacts`.
   - Prefer the CLI apply/review loop when shell access is available:
     - Write a temporary JSON payload with `host`, optional `agentNotes`, optional `lastBridgeMessage`, and an `endpoints` array.
     - Each endpoint item must identify the endpoint with `templateKey` when possible, then provide `summary`, `description`, and useful `tags`.
     - Apply it with `harpist docs apply <host> <docs.json>` or `harpist docs apply <host> -`.
     - Review it with `harpist docs review <host>` and fix every issue before reporting success.
   - The docs JSON is allowed to contain provider-specific interpretation. Harpist source code is not.
   - Use `profiles.setAuth` only for higher-level authentication analysis notes.
   - Use `endpoints.annotate`, `endpoints.upsert`, and `endpoints.remove` for endpoint decisions.
   - Use `profiles.setArtifacts` to write generated oRPC/OpenAPI/CLI artifacts.
   - Use `recordings.markProcessed` when a recording has been fully handled.

7. Review before handoff.
   - Run `harpist docs review <host>`.
   - The review must be `ok: true` before you call the docs refined.
   - If summaries or descriptions repeat, rewrite them.
   - If placeholder text remains, rewrite it.
   - If replay material is missing, either use the older sampled recording, keep the endpoint documented with a clear caveat, or ask for a new recording of that workflow.
   - If useful endpoints appear to be missing after a pass, inspect previous recordings/profile endpoints before removing them; recordings are additive.

8. Return concise user-facing output.
   - Say which host was refined.
   - Summarize endpoint/auth/artifact changes.
   - Mention the docs URL when an OpenAPI artifact exists: `http://127.0.0.1:4277/profiles/<host>/docs`.
   - Mention `harpist auth replay <host> <operationName-or-templateKey>` when the user wants a terminal command.
   - Do not call docs "done" if the descriptions are repeated, vague, or visually noisy.

## Useful Commands

```sh
harpist bridge
harpist profiles list
harpist profiles latest
harpist profiles get <host>
harpist recordings latest <host>
harpist recordings get <host> <recording-id>
harpist refine latest <host>
harpist auth replay <host> [templateKey|operationName]
harpist contract get <host>
harpist openapi get <host>
harpist docs <host>
harpist docs apply <host> <docs.json|->
harpist docs review <host>
harpist handoff <host>
```

## Contract Surface

Use these bridge methods for agent work:

- `bridge.health`
- `sync.pushExtensionSnapshot`
- `sync.pullExtensionState`
- `handoff.get`
- `auth.replay`
- `profiles.list`, `profiles.latest`, `profiles.get`, `profiles.update`, `profiles.setAuth`, `profiles.setArtifacts`
- `recordings.list`, `recordings.latest`, `recordings.get`, `recordings.markProcessed`
- `endpoints.upsert`, `endpoints.annotate`, `endpoints.remove`

The bridge is the canonical cache while active. The extension remains the recording UI and local outbox.
