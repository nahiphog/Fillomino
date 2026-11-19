import { neighbors, validDimensions, type Board } from './generator.ts';

/** Grow regions from the user's clue positions instead of discarding most of
 * the information in an unrelated completed grid. Every region has a clue. */
export function generateLayoutBoard(rows: number, columns: number, mask: boolean[], random: () => number = Math.random, rectangular = false): Board {
  const count = rows * columns;
  if (!validDimensions(rows, columns) || mask.length !== count || !mask.some(Boolean)) throw new Error('Invalid clue layout');
  const adjacent = Array.from({ length: count }, (_, i) => neighbors(i, rows, columns));
  const regions = Array<number>(count).fill(-1);
  const groups: number[][] = [];
  const seeds = mask.flatMap((selected, i) => selected ? [i] : []);
  if (rectangular) {
    const split = (top: number, left: number, bottom: number, right: number, clues: number[]) => {
      const cuts: { horizontal: boolean; at: number; a: number[]; b: number[] }[] = [];
      for (let at = top + 1; at < bottom; at++) {
        const a = clues.filter(cell => Math.floor(cell / columns) < at), b = clues.filter(cell => Math.floor(cell / columns) >= at);
        if (a.length && b.length) cuts.push({ horizontal: true, at, a, b });
      }
      for (let at = left + 1; at < right; at++) {
        const a = clues.filter(cell => cell % columns < at), b = clues.filter(cell => cell % columns >= at);
        if (a.length && b.length) cuts.push({ horizontal: false, at, a, b });
      }
      if (cuts.length) {
        const cut = cuts[Math.floor(random() * cuts.length)];
        if (cut.horizontal) { split(top,left,cut.at,right,cut.a); split(cut.at,left,bottom,right,cut.b); }
        else { split(top,left,bottom,cut.at,cut.a); split(top,cut.at,bottom,right,cut.b); }
      } else {
        const id = groups.length, cells: number[] = [];
        for (let row = top; row < bottom; row++) for (let column = left; column < right; column++) {
          const cell = row * columns + column; regions[cell] = id; cells.push(cell);
        }
        groups.push(cells);
      }
    };
    split(0,0,rows,columns,seeds);
  } else for (const cell of seeds) { regions[cell] = groups.length; groups.push([cell]); }
  const edges: [number, number][] = [];
  for (const cell of seeds) for (const next of adjacent[cell]) if (regions[next] < 0) edges.push([cell, next]);
  while (edges.length) {
    const index = Math.floor(random() * edges.length);
    const [from, cell] = edges[index];
    edges[index] = edges[edges.length - 1]; edges.pop();
    if (regions[cell] >= 0) continue;
    const id = regions[from];
    regions[cell] = id; groups[id].push(cell);
    for (const next of adjacent[cell]) if (regions[next] < 0) edges.push([cell, next]);
  }
  // Coalesce adjacent equal sizes until all Fillomino boundaries are valid.
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let cell = 0; cell < count; cell++) for (const next of adjacent[cell]) {
      const a = regions[cell], b = regions[next];
      if (a === b || groups[a].length !== groups[b].length) continue;
      for (const member of groups[b]) { regions[member] = a; groups[a].push(member); }
      groups[b] = []; changed = true; break outer;
    }
  }
  return { rows, columns, regions, values: regions.map(id => groups[id].length) };
}

/** Refine a failed candidate by joining two neighboring regions, then repairing
 * equal-size contacts. Never fall back to one giant region for ordinary layouts. */
export function mergeLayoutRegions(board: Board, random: () => number = Math.random): Board | undefined {
  const groups = new Map<number, number[]>();
  board.regions.forEach((id, cell) => { const cells = groups.get(id) ?? []; cells.push(cell); groups.set(id, cells); });
  if (groups.size <= 2) return undefined;
  const boundaries: [number, number][] = [];
  const seen = new Set<string>();
  const adjacent = board.values.map((_, cell) => neighbors(cell, board.rows, board.columns));
  for (let cell = 0; cell < board.values.length; cell++) for (const next of adjacent[cell]) {
    const a = board.regions[cell], b = board.regions[next];
    if (a === b) continue;
    const key = [a, b].sort((x, y) => x - y).join(',');
    if (!seen.has(key)) { seen.add(key); boundaries.push([a, b]); }
  }
  if (!boundaries.length) return undefined;
  const regions = [...board.regions];
  const merge = (a: number, b: number) => {
    const cells = groups.get(b)!;
    cells.forEach(cell => { regions[cell] = a; });
    groups.get(a)!.push(...cells); groups.delete(b);
  };
  const [a, b] = boundaries[Math.floor(random() * boundaries.length)]; merge(a, b);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let cell = 0; cell < regions.length; cell++) for (const next of adjacent[cell]) {
      const a = regions[cell], b = regions[next];
      if (a !== b && groups.get(a)!.length === groups.get(b)!.length) { merge(a, b); changed = true; break outer; }
    }
  }
  if (groups.size < 2) return undefined;
  return { rows: board.rows, columns: board.columns, regions, values: regions.map(id => groups.get(id)!.length) };
}
