// Baseline from commit b3dcd55016af39d42653d5313d015068e224200a.
// Only import path and optional instrumentation differ from the deployed solver.
import { neighbors, isValidBoard, validDimensions, type Board } from '../src/generator.ts';

export type SolveResult = { status: 'solved'; board: Board } | { status: 'impossible' | 'timeout' | 'invalid' };
export type SolutionCountResult =
  | { status: 'complete'; count: number; board?: Board }
  | { status: 'timeout' | 'invalid'; count: number };

/** Exact region-cover search. Blank cells may form regions with no clues. */
export function searchSolutions(rows: number, columns: number, clues: number[], timeLimitMs: number, limit: number, metrics = { nodes: 0, branches: 0, shapes: 0 }): SolutionCountResult {
  const count = rows * columns;
  if (!validDimensions(rows, columns) || clues.length !== count ||
      clues.some(value => !Number.isInteger(value) || value < 0 || value > count)) return { status: 'invalid', count: 0 };
  const deadline = performance.now() + timeLimitMs;
  const expired = Symbol('timeout');
  const checkTime = () => { if (performance.now() >= deadline) throw expired; };
  const adjacent = Array.from({ length: count }, (_, cell) => neighbors(cell, rows, columns));
  const values = Array<number>(count).fill(0);
  const regions = Array<number>(count).fill(-1);
  const solutions = new Set<string>();
  let firstBoard: Board | undefined;

  function allowed(cell: number, target: number): boolean {
    return values[cell] === 0 && (clues[cell] === 0 || clues[cell] === target) &&
      adjacent[cell].every(next => values[next] !== target);
  }
  function reachable(seed: number, target: number): Set<number> {
    const found = new Set<number>();
    if (!allowed(seed, target)) return found;
    const stack = [seed]; found.add(seed);
    while (stack.length) for (const next of adjacent[stack.pop()!]) {
      if (!found.has(next) && allowed(next, target)) { found.add(next); stack.push(next); }
    }
    return found;
  }
  function search(regionId: number): boolean {
    metrics.nodes++;
    checkTime();
    let seed = -1;
    let bestSlack = Infinity;
    for (let cell = 0; cell < count; cell++) {
      if (values[cell] || !clues[cell]) continue;
      const capacity = reachable(cell, clues[cell]).size;
      if (capacity < clues[cell]) return false;
      const slack = capacity - clues[cell];
      if (slack < bestSlack || (slack === bestSlack && clues[cell] < clues[seed])) { seed = cell; bestSlack = slack; }
    }
    if (seed < 0) seed = values.indexOf(0);
    if (seed < 0) {
      if (!isValidBoard({ rows, columns, values })) return false;
      // Count distinct completed number grids, never region IDs or search paths.
      solutions.add(values.join(','));
      firstBoard ??= { rows, columns, values: [...values], regions: [...regions] };
      return solutions.size >= limit;
    }
    const remaining = values.filter(value => value === 0).length;
    const targets = clues[seed] ? [clues[seed]] : Array.from({ length: remaining }, (_, i) => i + 1);
    for (const target of targets) {
      checkTime();
      const available = reachable(seed, target);
      if (available.size < target) continue;
      const seen = new Set<string>();
      function grow(cells: number[]): boolean {
        metrics.shapes++;
        checkTime();
        const key = cells.join(',');
        if (seen.has(key)) return false;
        seen.add(key);
        const members = new Set(cells);
        const frontier = [...new Set(cells.flatMap(cell => adjacent[cell]).filter(cell => !members.has(cell)))];
        if (cells.length === target) {
          // An equal clue immediately outside would have to share this region.
          if (frontier.some(cell => clues[cell] === target || values[cell] === target)) return false;
          cells.forEach(cell => { values[cell] = target; regions[cell] = regionId; });
          metrics.branches++;
          if (search(regionId + 1)) return true;
          cells.forEach(cell => { values[cell] = 0; regions[cell] = -1; });
          return false;
        }
        // Adjacent equal clues are mandatory members; grow them first.
        const forced = frontier.find(cell => clues[cell] === target && available.has(cell));
        const options = forced === undefined ? frontier.filter(cell => available.has(cell)) : [forced];
        for (const cell of options) if (grow([...cells, cell].sort((a, b) => a - b))) return true;
        return false;
      }
      if (grow([seed])) return true;
    }
    return false;
  }
  try {
    search(0);
    return { status: 'complete', count: solutions.size, board: firstBoard };
  } catch (error) {
    if (error === expired) return { status: 'timeout', count: solutions.size };
    throw error;
  }
}

/** Count up to two solutions. Only complete + count === 1 proves uniqueness. */
export function countSolutions(rows: number, columns: number, clues: number[], timeLimitMs = 10000): SolutionCountResult {
  return searchSolutions(rows, columns, clues, timeLimitMs, 2);
}

export function solveBoard(rows: number, columns: number, clues: number[], timeLimitMs = 10000): SolveResult {
  const result = searchSolutions(rows, columns, clues, timeLimitMs, 1);
  if (result.status !== 'complete') return { status: result.status };
  return result.board ? { status: 'solved', board: result.board } : { status: 'impossible' };
}
