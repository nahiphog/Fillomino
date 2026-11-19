# Fillomino

A TypeScript website that generates uniquely solvable Fillomino puzzles with independently selectable rows and columns, each from 3 to 15 (for example, 3×8 or 12×5). Generation, clue entry, solving, and unique puzzle creation all support rectangles. Cells remain square. Includes region borders, optional region colors, and copying a grid as space-separated numbers, one line per row.

## Run locally

The GitHub Pages site is published at https://nahiphog.github.io/Fillomino/.
The `Deploy Fillomino to GitHub Pages` workflow tests and builds each push to
`main`, then deploys `dist/`. It can also be run manually from GitHub Actions.
The Pages build uses `npm run build -- --base=/Fillomino/` so assets and Web
Workers load correctly under the repository path. The normal local/Sites build
continues to use the root path.

```sh
npm install
npm run dev
```

`npm run build` type-checks the app and builds `dist/`. `npm test` checks 1,300 seeded boards across all supported sizes, the supplied example, and invalid inputs. Tests require Node.js 22.18+ or 24+.

The generator grows connected regions, then merges touching regions of equal size until the board is valid. It samples candidates to favor smaller, readable regions. A separate flood-fill validator checks each generated board. Generation is randomized, not uniformly sampled.

## Choose your own clue positions

Select **Custom build** under Puzzle mode, set rows and columns, and
click individual grid cells to highlight them (Tab and Space also work). Use
**Select all** or **Clear highlights** to adjust the selection. Changing either
dimension clears the layout. Click **Generate from highlights** to search for
a uniquely solvable puzzle with numbers in every highlighted cell and blanks
everywhere else. The exact layout takes precedence over rotational symmetry.

Custom build grows regions from highlighted cells, alternates with clue-aware
rectangular partitions, and refines failed candidates by merging neighboring
regions. Periodic independent restarts retain variety, including unclued regions.
A bounded cache skips clue patterns already proved ambiguous. Only a completed count of one is
accepted; timeouts are inconclusive. Custom build has no overall time or attempt
limit: it keeps searching until a verified unique puzzle is found or you click
Cancel. Most exact checks get 25ms; every twelfth candidate gets up to 500ms.
Timeouts remain inconclusive and are never cached as ambiguous or accepted as
unique. The candidate counter includes cached patterns that did not need another
check. Cancel preserves the layout. **Edit highlighted cells** restores your selection after
success, and Solve / Hide solution work as usual. This mode does not remove
highlighted clues or promise minimality.

This search can produce fewer, larger regions than ordinary generation. It favors
finding a valid puzzle quickly, not a difficulty rating. Run
`node --experimental-strip-types benchmarks/layout.ts` to compare it with the
previous Custom build algorithm. See [Custom build benchmarks](benchmarks/LAYOUT.md)
for measured results, fixtures, and limitations.

## Solve and hide a puzzle

After solving, **Solve** becomes **Hide solution**. Click it to restore the original
clues and blanks, with solution colors and region borders hidden. Click **Solve**
again to reveal a completion. Hiding preserves the puzzle's uniqueness status.

Choose the row and column counts and click **Enter clues** for a blank editable grid. Enter positive whole numbers (up to the number of cells), leaving unknown cells blank, then click **Solve**. Arrow keys move between cells. The completed board shows original clues in black (bold) and solver-filled numbers in blue. **Edit clues** restores only your original clues; **Clear clues** resets the editor. Changing either dimension starts a blank grid.

The solver propagates per-cell candidate values to a fixed point in a Web Worker, then uses minimum-domain search with reversible domain updates. Deductions include completed-region exclusion, oversized-component rejection, forced-merge prevention, reachable-space pruning, exact-fit expansion, and mandatory bottleneck cells. It preserves clues and allows regions with no clues. A short whole-region search attempt handles sparse cases where that search order is faster. It returns one valid completion and does not claim uniqueness. A 10-second search budget and Cancel button keep difficult or sparse puzzles from blocking the page. A timeout is reported separately from a proven contradiction; adding clues can help. Tests cover partial puzzles, conflicting clues, unclued regions, multi-digit clues, all supported dimensions through generated-board checks, and timeout handling.

## Create a uniquely solvable puzzle

Click **Generate** to generate a completed grid internally and dig clues automatically until no further removal is possible under the selected symmetry. **Create Puzzle** digs the displayed completed grid. If you are in the clue editor, Create Puzzle first generates a new solution at the selected dimensions. While digging, the grid first shows all clues, then removes each confirmed clue live. The Digging speed selector sets the delay between removals from two seconds to maximum speed and can be changed at any time. Pause freezes the displayed grid; Resume continues from the same point. An in-flight uniqueness check may finish while paused, but its result is held and no further step is requested until Resume. The counter updates as digging proceeds. Clues are read-only during digging; Cancel restores the previous grid. The resulting clue grid hides solution colors and region borders. Click **Solve** to reveal the completion, or copy the clues (blanks are `.`).

**Rotational symmetry** is enabled by default: opposite cells are removed together, so the clue/blank pattern is invariant under a 180-degree turn on both square and rectangular grids. Numbers and region shapes need not match. The center of an odd-by-odd grid is checked as a single cell. Turn the option off before generating to dig individual cells instead. Symmetric completion means no remaining opposite pair (or center clue) can be removed; it does not claim that every individual clue is necessary. The option is locked during digging.

Each tentative removal runs an exact search for up to two distinct completed number grids. A removal is accepted only if the search finishes with exactly one solution. Ambiguous removals are reverted and proved necessary. Timed-out checks are reverted and retried in randomized rounds with four times the previous check budget, starting at 250ms. Production digging has no overall deadline: completion means every remaining removal group is proved necessary. Removing other clues can only add solutions, so a removal group already proved necessary needs no retest. This produces a locally minimal puzzle under the selected symmetry, not necessarily the globally fewest clues or a particular difficulty. Large puzzles can take considerable time. Optional caller time limits return an explicitly unfinished result, never a minimality claim. Cancel keeps the previous grid unchanged. Editing a clue clears the unique-solution label.

Uniqueness tests compare both pure propagation search and the hybrid engine against an independent exhaustive enumeration of all 3×3 grids across 1,500 clue sets. Every compatible reference completion must survive propagation. Additional tests cover deduction rules, undo restoration, comparisons with the previous solver, larger rectangles, and a deterministic timeout after finding one solution. A timed-out region-search attempt never contributes counts to the fallback search.


Rectangular regression tests cover all 169 dimension combinations, row-edge adjacency, wide and tall solving, unique puzzle creation, and independent dimension validation.

## Solver benchmarks

Run `npm run benchmark` for a deterministic 25-fixture comparison against the previous solver preserved in `benchmarks/reference-solver.ts`. It tests both first-solution search and capped solution counting, with three repetitions and a 1,000ms budget per call. `BENCH_BUDGET_MS` and `BENCH_REPEATS` override those settings. The benchmark validates completions, checks count agreement where searches finish, and writes raw runs, exact fixtures, runtime details, timings, and branch counts to `benchmarks/results.json`. See [the benchmark report](benchmarks/README.md) for results and limitations.
