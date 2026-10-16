# Contributing to Repo Atlas

Thanks for helping make codebases easier to explore.

1. Fork the repository and create a focused branch.
2. Run `npm ci`, then `npm run dev`.
3. For scanner or graph-analysis changes, add a regression case in `tests/scanner.test.ts`.
4. For a user-facing behavior change, exercise it in the browser. Add an end-to-end regression when it protects a meaningful flow.
5. Run `npm run check`, `npm run format:check`, `npm run test:e2e`, and `npm run build`.
6. Open a pull request describing the problem, the resulting behavior, and how you checked it.

Install the browser once with `npx playwright install chromium` before running end-to-end tests. Use `npm run format` to format changes.

## Boundaries

- Keep source analysis on the user's device. Do not add telemetry or network calls that send source files or graphs elsewhere.
- Keep the graph format portable and validate imported JSON.
- Report resolution limitations instead of silently inventing edges.
- Do not commit real private codebases, `.env` files, or graph exports from private projects.

## Useful places

| Path                       | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `src/core/scanner.ts`      | AST extraction and module resolution            |
| `src/core/analysis.ts`     | Adjacency, circular groups, JSON validation     |
| `src/core/io.ts`           | Browser folder input, worker lifecycle, exports |
| `src/components/Graph.tsx` | D3 layout and interactive SVG                   |
| `src/App.tsx`              | Explorer state, inspector, filters, dialogs     |
| `scripts/scan.ts`          | Local CLI                                       |
| `examples/tiny-project`    | Intentionally small, cyclic example             |

TypeScript is intentionally constrained to the 5.9 compiler API. A major parser upgrade should document its API and syntax effects.
