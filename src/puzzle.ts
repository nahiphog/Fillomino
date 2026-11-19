import { isValidBoard, type Board } from './generator.ts';
import { countSolutions } from './solver.ts';

export type PuzzleProgress = { checked: number; total: number; removed: number; pending: number; round: number; checkBudgetMs: number; clues: number[] };
export type PuzzleResult = { clues: number[]; removed: number; checked: number; limited: boolean; minimal: boolean; pending: number };
export type PuzzleOptions = {
  random?: () => number;
  /** Remove 180-degree opposite cells together (center cells form a singleton). */
  rotationalSymmetry?: boolean;
  /** Optional caller budget. Production digging has no overall deadline. */
  timeLimitMs?: number;
  checkTimeLimitMs?: number;
  onProgress?: (progress: PuzzleProgress) => void;
  now?: () => number;
  check?: typeof countSolutions;
};

/** Dig until every remaining removal group is proved necessary. Minimality is
 * relative to the selected symmetry, not a globally minimum clue count. */
export function createPuzzle(board: Board, options: PuzzleOptions = {}): PuzzleResult {
  const steps = digPuzzle(board, options);
  let step = steps.next();
  while (!step.done) {
    options.onProgress?.(step.value);
    step = steps.next();
  }
  return step.value;
}

/** Each snapshot contains only confirmed removals, never a tentative check.
 * Yielding lets the worker pace visible removals without delaying other checks. */
export function* digPuzzle(board: Board, options: PuzzleOptions = {}): Generator<PuzzleProgress, PuzzleResult> {
  if (!isValidBoard(board)) throw new Error('A valid completed grid is required.');
  const { random = Math.random, rotationalSymmetry = true, timeLimitMs = Infinity, checkTimeLimitMs = 250,
    now = () => performance.now(), check = countSolutions } = options;
  const clues = [...board.values];
  const groups = clues.flatMap((_, cell) => {
    const opposite = clues.length - 1 - cell;
    if (!rotationalSymmetry) return [[cell]];
    if (cell > opposite) return [];
    return [cell === opposite ? [cell] : [cell, opposite]];
  });
  let pending = groups.map((_, index) => index);
  const deadline = now() + timeLimitMs;
  let removed = 0, checked = 0, round = 0, budget = checkTimeLimitMs;
  const progress = (): PuzzleProgress => ({ checked, total: clues.length, removed, pending: pending.length, round, checkBudgetMs: budget, clues: [...clues] });
  yield progress();
  if (!(budget > 0)) return { clues, removed, checked, limited: true, minimal: false, pending: pending.length };
  while (pending.length && now() < deadline) {
    round++;
    for (let i = pending.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pending[i], pending[j]] = [pending[j], pending[i]];
    }
    const order = [...pending];
    for (const group of order) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      yield progress();
      const cells = groups[group];
      const values = cells.map(cell => clues[cell]);
      const restore = () => cells.forEach((cell, i) => { clues[cell] = values[i]; });
      cells.forEach(cell => { clues[cell] = 0; });
      let result;
      try { result = check(board.rows, board.columns, clues, Math.min(budget, remaining)); }
      catch (error) { restore(); throw error; }
      checked++;
      if (result.status === 'complete' && result.count === 1) {
        removed += cells.length;
        pending = pending.filter(index => index !== group);
      } else {
        restore();
        if (result.status === 'complete' && result.count >= 2) {
          // Removing more clues cannot eliminate either of these solutions.
          // This group stays necessary for all subsequent accepted removals.
          pending = pending.filter(index => index !== group);
        } else if (result.status !== 'timeout') {
          // The original completed board always satisfies every subset of clues.
          throw new Error('A clue subset unexpectedly lost its known solution.');
        }
        // A timeout proves nothing. Keep this clue pending for the next round.
      }
      yield progress();
    }
    budget *= 4;
  }
  const minimal = pending.length === 0;
  return { clues, removed, checked, limited: !minimal, minimal, pending: pending.length };
}
