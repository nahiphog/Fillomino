# Fillomino

A TypeScript website that generates fully completed Fillomino grids from 3×3 to 15×15. Includes region borders, optional region colors, and copying a grid as space-separated numbers.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` type-checks the app and builds `dist/`. `npm test` checks 1,300 seeded boards across all supported sizes, the supplied example, and invalid inputs. Tests require Node.js 22.18+ or 24+.

The generator grows connected regions, then merges touching regions of equal size until the board is valid. It samples candidates to favor smaller, readable regions. A separate flood-fill validator checks each generated board. Generation is randomized, not uniformly sampled.

## Solve a puzzle

Choose a size and click **Enter clues** for a blank editable grid. Enter positive whole numbers (up to the number of cells), leaving unknown cells blank, then click **Solve**. Arrow keys move between cells. The completed board marks original clues in bold and underlines them. **Edit clues** restores only your original clues; **Clear clues** resets the editor. Changing size starts a blank grid.

The solver performs exact connected-region backtracking in a Web Worker, preserving clues and allowing regions with no clues. It returns one valid completion and does not claim uniqueness. A 10-second search budget and Cancel button keep difficult or sparse puzzles from blocking the page. A timeout is reported separately from a proven contradiction; adding clues can help. Tests cover partial puzzles, conflicting clues, unclued regions, multi-digit clues, all supported dimensions through generated-board checks, and timeout handling.

Automatic clue removal and uniqueness checking are future features.
