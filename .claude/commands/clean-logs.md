Find and remove all `console.log(...)` statements from every TypeScript source file in the project (under `apps/` and `libs/`).

Rules:

- Remove the entire line if `console.log` is the only statement on it
- Do not touch `console.warn`, `console.error`, or `console.debug` — only `console.log`
- Do not modify files inside `node_modules/`, `dist/`, or `*.spec.ts` test files
- After removing, show a summary: how many files changed and how many lines removed
