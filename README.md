# Fillomino

A TypeScript website that generates fully completed Fillomino grids from 3×3 to 15×15. Includes region borders, optional region colors, and copying a grid as space-separated numbers.

## Run locally

```sh
npm install
npm run dev
```

`npm run build` type-checks the app and builds `dist/`. `npm test` checks 1,300 seeded boards across all supported sizes, the supplied example, and invalid inputs. Tests require Node.js 22.18+ or 24+.

The generator grows connected regions, then merges touching regions of equal size until the board is valid. It samples candidates to favor smaller, readable regions. A separate flood-fill validator checks each generated board. Generation is randomized, not uniformly sampled.

This first version generates completed solutions. Clue removal, uniqueness checking, and solving user-entered puzzles are future features; generated boards are not presented as unsolved puzzles.
