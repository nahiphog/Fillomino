# Fillomino

A TypeScript website that generates fully completed Fillomino grids with independently selectable rows and columns, each from 3 to 15 (for example, 3×8 or 12×5). Generation, clue entry, solving, and unique puzzle creation all support rectangles. Cells remain square. Includes region borders, optional region colors, and copying a grid as space-separated numbers, one line per row.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` type-checks the app and builds `dist/`. `npm test` checks 1,300 seeded boards across all supported sizes, the supplied example, and invalid inputs. Tests require Node.js 22.18+ or 24+.

The generator grows connected regions, then merges touching regions of equal size until the board is valid. It samples candidates to favor smaller, readable regions. A separate flood-fill validator checks each generated board. Generation is randomized, not uniformly sampled.

## Solve a puzzle

Choose the row and column counts and click **Enter clues** for a blank editable grid. Enter positive whole numbers (up to the number of cells), leaving unknown cells blank, then click **Solve**. Arrow keys move between cells. The completed board shows original clues in black (bold) and solver-filled numbers in blue. **Edit clues** restores only your original clues; **Clear clues** resets the editor. Changing either dimension starts a blank grid.

The solver propagates per-cell candidate values to a fixed point in a Web Worker, then uses minimum-domain search with reversible domain updates. Deductions include completed-region exclusion, oversized-component rejection, forced-merge prevention, reachable-space pruning, exact-fit expansion, and mandatory bottleneck cells. It preserves clues and allows regions with no clues. A short whole-region search attempt handles sparse cases where that search order is faster. It returns one valid completion and does not claim uniqueness. A 10-second search budget and Cancel button keep difficult or sparse puzzles from blocking the page. A timeout is reported separately from a proven contradiction; adding clues can help. Tests cover partial puzzles, conflicting clues, unclued regions, multi-digit clues, all supported dimensions through generated-board checks, and timeout handling.

## Create a uniquely solvable puzzle

Click **Generate**, then **Create Puzzle** to remove numbers from that completed grid. If you are in the clue editor, Create Puzzle first generates a new solution at the selected dimensions. The resulting clue grid hides solution colors and region borders. Click **Solve** to reveal the completion, or copy the clues (blanks are `.`).

Each tentative removal runs an exact search for up to two distinct completed number grids. A removal is accepted only if the search finishes with exactly one solution. Ambiguous removals and timed-out checks are reverted. The worker has a 12-second overall budget and a 250ms budget per check; a time limit may leave extra clues, but never weakens the uniqueness guarantee. This does not promise a minimum clue count or a particular difficulty. Cancel keeps the previous grid unchanged. Editing a clue clears the unique-solution label.

Uniqueness tests compare both pure propagation search and the hybrid engine against an independent exhaustive enumeration of all 3×3 grids across 1,500 clue sets. Every compatible reference completion must survive propagation. Additional tests cover deduction rules, undo restoration, comparisons with the previous solver, larger rectangles, and a deterministic timeout after finding one solution. A timed-out region-search attempt never contributes counts to the fallback search.


Rectangular regression tests cover all 169 dimension combinations, row-edge adjacency, wide and tall solving, unique puzzle creation, and independent dimension validation.

## Solver benchmarks

Run `npm run benchmark` for a deterministic 25-fixture comparison against the previous solver preserved in `benchmarks/reference-solver.ts`. It tests both first-solution search and capped solution counting, with three repetitions and a 1,000ms budget per call. `BENCH_BUDGET_MS` and `BENCH_REPEATS` override those settings. The benchmark validates completions, checks count agreement where searches finish, and writes raw runs, exact fixtures, runtime details, timings, and branch counts to `benchmarks/results.json`. See [the benchmark report](benchmarks/README.md) for results and limitations.
