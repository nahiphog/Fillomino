export type Board = { size: number; values: number[]; regions: number[] };

export function neighbors(cell: number, size: number): number[] {
  const result: number[] = [];
  if (cell >= size) result.push(cell - size);
  if (cell < size * (size - 1)) result.push(cell + size);
  if (cell % size > 0) result.push(cell - 1);
  if (cell % size < size - 1) result.push(cell + 1);
  return result;
}

// Random connected growth followed by merging equal-size touching regions.
// Each merge decreases the region count, so repair always terminates.
export function generateBoard(size: number, random: () => number = Math.random): Board {
  if (!Number.isInteger(size) || size < 3 || size > 15) throw new Error('Choose a whole number from 3 to 15.');
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  let best: Board | undefined;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 48; attempt++) {
    const regions = Array<number>(size * size).fill(-1);
    const groups = new Map<number, number[]>();
    let nextId = 0;
    while (regions.includes(-1)) {
      const free = regions.flatMap((id, cell) => id === -1 ? [cell] : []);
      const seed = pick(free);
      const cells = [seed];
      const id = nextId++;
      regions[seed] = id;
      const target = 1 + Math.floor(random() * Math.min(7, size + 1));
      while (cells.length < target) {
        const frontier = [...new Set(cells.flatMap(cell => neighbors(cell, size)).filter(cell => regions[cell] === -1))];
        if (!frontier.length) break;
        const cell = pick(frontier);
        regions[cell] = id;
        cells.push(cell);
      }
      groups.set(id, cells);
    }
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let cell = 0; cell < regions.length; cell++) {
        for (const other of neighbors(cell, size)) {
          const a = regions[cell], b = regions[other];
          if (a === b || groups.get(a)!.length !== groups.get(b)!.length) continue;
          const merged = groups.get(b)!;
          merged.forEach(index => { regions[index] = a; });
          groups.get(a)!.push(...merged);
          groups.delete(b);
          changed = true;
          break outer;
        }
      }
    }
    const values = regions.map(id => groups.get(id)!.length);
    const score = Math.max(...values) * 10 + values.reduce((sum, value) => sum + value, 0) / values.length;
    if (score < bestScore) { best = { size, values, regions }; bestScore = score; }
    if (Math.max(...values) <= 9 && groups.size >= size) break;
  }
  return best!;
}

// Independently validate the numbers, without trusting generator region IDs.
export function isValidBoard(board: Pick<Board, 'size' | 'values'>): boolean {
  const { size, values } = board;
  if (!Number.isInteger(size) || size < 1 || values.length !== size * size) return false;
  const visited = new Set<number>();
  for (let cell = 0; cell < values.length; cell++) {
    if (visited.has(cell)) continue;
    const value = values[cell];
    if (!Number.isInteger(value) || value < 1) return false;
    const stack = [cell];
    visited.add(cell);
    let count = 0;
    while (stack.length) {
      const current = stack.pop()!;
      count++;
      for (const next of neighbors(current, size)) {
        if (!visited.has(next) && values[next] === value) { visited.add(next); stack.push(next); }
      }
    }
    if (count !== value) return false;
  }
  return true;
}
