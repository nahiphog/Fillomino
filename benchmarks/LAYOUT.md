# Custom build benchmark

The improved search found verified unique puzzles in **18/27 runs**, compared
with **3/27** for the prior random-board search, with a 2,000ms budget per run.
Total search time, including capped failures, was 27.0s versus 48.3s.

| Highlight layout | Previous successes / 3 | Improved successes / 3 | Improved median time |
|---|---:|---:|---:|
| 6×6, 60% sampled density | 3 | 3 | 20ms |
| 6×6, 30% | 0 | 3 | 512ms |
| 6×6, 15% | 0 | 3 | 220ms |
| 10×10, 40% | 0 | 0 | budget exhausted |
| 10×10, 20% | 0 | 1 | budget exhausted |
| 15×15, 30% | 0 | 0 | budget exhausted |
| 4×9, 25% | 0 | 3 | 81ms |
| 9×4, 25% | 0 | 2 | 550ms |
| 6×6, top row highlighted | 0 | 3 | 269ms |

## Method and limitations

Both searches use the same solution counter and fixed highlighted-cell masks.
Each repetition uses a different deterministic generation seed; engine order
alternates across repetitions. Timings include candidate generation and exact
checking, but exclude an additional independent count of each returned puzzle.
Every success was validated for Fillomino rules, exact clue positions, and one
solution. Raw timings, masks, seeds (defined in the script), runtime version,
region counts, and largest values are in [layout-results.json](layout-results.json).

This is a small local benchmark, not a general speed guarantee. The generated
grids differ: improved successes have 2–4 regions, while baseline successes have
7–9. Merging makes puzzles easier to constrain and may yield much larger numbers
and easier puzzles. No difficulty equivalence is claimed. Large masks still
frequently exceed the benchmark budget. Production search has no overall limit;
the user can cancel it. Checkered generation is not part of these fixtures.

The baseline implementation is preserved in `reference-layout.ts`. The exact
counter and ordinary generator are shared, unchanged for ordinary generation.

Reproduce with Node 24:

```powershell
$env:LAYOUT_BUDGET_MS='2000'
$env:LAYOUT_REPEATS='3'
node --experimental-strip-types benchmarks/layout.ts
```

The script defaults to 1,000ms and one repetition for a quicker check. Running it
replaces the results JSON. Budget-exhausted runs are censored observations, not
proof that no matching puzzle exists.
