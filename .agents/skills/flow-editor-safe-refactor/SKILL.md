---
name: flow-editor-safe-refactor
description: Safely refactor Bench flow editor and panel behavior without breaking graph state or React hooks constraints. Use when modifying flow editor, step panel, node/edge transforms, or execution UX.
---
# Flow Editor Safe Refactor

Applies to files around flow editor and step/execution panels.

## Guardrails

- Preserve node/edge conversion integrity (`flowToNodesEdges`, `nodesEdgesToFlow`).
- Keep layout recalculation deterministic when nodes/edges change.
- Prefer explicit types; avoid `any`.
- Avoid render-time ref reads/writes and effect anti-patterns flagged by lint.
- Keep step editing state isolated (use keyed remounts when appropriate).

## Verification

- Open flow editor and verify:
  - add/delete/connect steps
  - layout toggle TB/LR
  - rename/save flow
  - run flow + execution panel
- Run: `cd ui && pnpm lint && pnpm build`
- If API touched: `cd api && go test ./...`

## Common Risk Areas

- React hooks dependency drift.
- stale closures in callbacks.
- execution panel tab switching behavior.
- input params flow run dialog regressions.
