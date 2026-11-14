export type Dimensions = { rows: number; columns: number };
export type Board = Dimensions & { values: number[]; regions: number[] };

export function validDimensions(rows: number, columns: number): boolean {
  return [rows, columns].every(value => Number.isInteger(value) && value >= 3 && value <= 15);
}

export function neighbors(cell: number, rows: number, columns: number): number[] {
  const result: number[] = [];
  if (cell >= columns) result.push(cell - columns);
  if (cell < columns * (rows - 1)) result.push(cell + columns);
  if (cell % columns > 0) result.push(cell - 1);
  if (cell % columns < columns - 1) result.push(cell + 1);
  return result;
}

// Random connected growth followed by merging equal-size touching regions.
// Each merge decreases the region count, so repair always terminates.
export function generateBoard(rows: number, columns: number, random: () => number = Math.random): Board {
  if (!validDimensions(rows, columns)) throw new Error('Choose whole numbers from 3 to 15 for rows and columns.');
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  let best: Board | undefined;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 48; attempt++) {
    const regions = Array<number>(rows * columns).fill(-1);
    const groups = new Map<number, number[]>();
    let nextId = 0;
    while (regions.includes(-1)) {
      const free = regions.flatMap((id, cell) => id === -1 ? [cell] : []);
      const seed = pick(free);
      const cells = [seed];
      const id = nextId++;
      regions[seed] = id;
      const target = 1 + Math.floor(random() * Math.min(7, Math.min(rows, columns) + 1));
      while (cells.length < target) {
        const frontier = [...new Set(cells.flatMap(cell => neighbors(cell, rows, columns)).filter(cell => regions[cell] === -1))];
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
        for (const other of neighbors(cell, rows, columns)) {
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
    if (score < bestScore) { best = { rows, columns, values, regions }; bestScore = score; }
    if (Math.max(...values) <= 9 && groups.size >= Math.min(rows, columns)) break;
  }
  return best!;
}

// Independently validate the numbers, without trusting generator region IDs.
export function isValidBoard(board: Pick<Board, 'rows' | 'columns' | 'values'>): boolean {
  const { rows, columns, values } = board;
  if (!validDimensions(rows, columns) || values.length !== rows * columns) return false;
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
      for (const next of neighbors(current, rows, columns)) {
        if (!visited.has(next) && values[next] === value) { visited.add(next); stack.push(next); }
      }
    }
    if (count !== value) return false;
  }
  return true;
}
