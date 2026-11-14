import { neighbors, isValidBoard, type Board } from './generator.ts';

export type SolveResult = { status: 'solved'; board: Board } | { status: 'impossible' | 'timeout' | 'invalid' };

/** Exact region-cover search. Blank cells may form regions with no clues. */
export function solveBoard(size: number, clues: number[], timeLimitMs = 10000): SolveResult {
  const count = size * size;
  if (!Number.isInteger(size) || size < 3 || size > 15 || clues.length !== count ||
      clues.some(value => !Number.isInteger(value) || value < 0 || value > count)) return { status: 'invalid' };
  const deadline = performance.now() + timeLimitMs;
  const expired = Symbol('timeout');
  const checkTime = () => { if (performance.now() >= deadline) throw expired; };
  const adjacent = Array.from({ length: count }, (_, cell) => neighbors(cell, size));
  const values = Array<number>(count).fill(0);
  const regions = Array<number>(count).fill(-1);

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
    if (seed < 0) return isValidBoard({ size, values });
    const remaining = values.filter(value => value === 0).length;
    const targets = clues[seed] ? [clues[seed]] : Array.from({ length: remaining }, (_, i) => i + 1);
    for (const target of targets) {
      checkTime();
      const available = reachable(seed, target);
      if (available.size < target) continue;
      const seen = new Set<string>();
      function grow(cells: number[]): boolean {
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
    return search(0) ? { status: 'solved', board: { size, values, regions } } : { status: 'impossible' };
  } catch (error) {
    if (error === expired) return { status: 'timeout' };
    throw error;
  }
}
