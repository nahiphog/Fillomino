import { isValidBoard, validDimensions, type Board } from './generator.ts';
import { Constraints, newMetrics, type SolverMetrics } from './constraints.ts';
import { searchSolutions as regionSearch } from './region-search.ts';

export type SolveResult = { status: 'solved'; board: Board } | { status: 'impossible' | 'timeout' | 'invalid' };
export type SolutionCountResult =
  | { status: 'complete'; count: number; board?: Board }
  | { status: 'timeout' | 'invalid'; count: number };
export type SearchOptions = { timeLimitMs?: number; limit?: 1 | 2; now?: () => number; regionProbeMs?: number };

/** Propagate to a fixed point, then branch on the smallest remaining cell domain. */
export function analyzeSolutions(rows: number, columns: number, clues: number[], options: SearchOptions = {}): {
  result: SolutionCountResult; metrics: SolverMetrics;
} {
  const metrics = newMetrics(), now = options.now ?? (() => performance.now()), started = now();
  const finish = (result: SolutionCountResult) => { metrics.elapsedMs = now() - started; return { result, metrics }; };
  const count = rows * columns;
  if (!validDimensions(rows, columns) || clues.length !== count ||
      clues.some(value => !Number.isInteger(value) || value < 0 || value > count)) return finish({ status: 'invalid', count: 0 });
  const deadline = started + (options.timeLimitMs ?? 10000), expired = Symbol('timeout');
  const checkTime = () => { if (now() >= deadline) throw expired; };
  const state = new Constraints(rows, columns, clues, metrics, checkTime);
  let found = 0, firstBoard: Board | undefined;

  function search(): boolean {
    checkTime(); metrics.nodes++;
    if (!state.propagate()) { metrics.contradictions++; return false; }
    const cell = state.chooseCell();
    if (cell < 0) {
      const values = Array.from(state.fixed);
      if (!isValidBoard({ rows, columns, values }) || clues.some((clue, i) => clue && values[i] !== clue)) {
        metrics.contradictions++; return false;
      }
      const regions = Array<number>(count).fill(-1);
      let id = 0;
      for (let start = 0; start < count; start++) {
        if (regions[start] >= 0) continue;
        const stack = [start]; regions[start] = id;
        while (stack.length) for (const next of state.adjacent[stack.pop()!]) {
          if (regions[next] < 0 && values[next] === values[start]) { regions[next] = id; stack.push(next); }
        }
        id++;
      }
      firstBoard ??= { rows, columns, values, regions };
      // Each branch fixes a cell to a different value: the leaves are disjoint.
      found++;
      return found >= (options.limit ?? 2);
    }
    const nearby = new Set(state.adjacent[cell].map(next => state.fixed[next]));
    const candidates = state.candidates(cell).sort((a, b) => Number(nearby.has(b)) - Number(nearby.has(a)) || a - b);
    const mark = state.trail.length;
    for (const value of candidates) {
      checkTime(); metrics.branches++;
      if (state.assign(cell, value, 'branch') && search()) return true;
      state.undo(mark);
    }
    return false;
  }

  try {
    checkTime();
    if (!state.propagate()) { metrics.contradictions++; return finish({ status: 'complete', count: 0 }); }
    // Benchmarks show that broad, sparse domains sometimes favor whole-region search.
    // Give it a small budget AFTER propagation; a timeout contributes no solution counts.
    const unresolved = Array.from(state.lengths).filter(length => length > 1).length;
    const sparse = clues.filter(Boolean).length <= count / 4;
    const probeMs = Math.min(options.regionProbeMs ?? (sparse ? 200 : 50), Math.max(0, (deadline - now()) / 3));
    if (unresolved > count * .3 && probeMs > 0) {
      const probeMetrics = { nodes: 0, branches: 0, shapes: 0 };
      // Preserve the complementary original clue-order heuristic. These original
      // constraints have exactly the same solutions as the sound propagated ones.
      const probe = regionSearch(rows, columns, clues, probeMs, options.limit ?? 2,
        probeMetrics, undefined, now);
      metrics.regionBranches += probeMetrics.branches; metrics.regionShapes += probeMetrics.shapes;
      metrics.branches += probeMetrics.branches; metrics.nodes += probeMetrics.nodes;
      if (probe.status === 'complete') return finish(probe);
    }
    search(); return finish({ status: 'complete', count: found, board: firstBoard });
  }
  catch (error) {
    if (error === expired) return finish({ status: 'timeout', count: found });
    throw error;
  }
}

/** A timeout, even after finding one solution, never establishes uniqueness. */
export function countSolutions(rows: number, columns: number, clues: number[], timeLimitMs = 10000): SolutionCountResult {
  return analyzeSolutions(rows, columns, clues, { timeLimitMs, limit: 2 }).result;
}
export function solveBoard(rows: number, columns: number, clues: number[], timeLimitMs = 10000): SolveResult {
  const result = analyzeSolutions(rows, columns, clues, { timeLimitMs, limit: 1 }).result;
  if (result.status !== 'complete') return { status: result.status };
  return result.board ? { status: 'solved', board: result.board } : { status: 'impossible' };
}
