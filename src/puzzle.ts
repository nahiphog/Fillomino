import { isValidBoard, type Board } from './generator.ts';
import { countSolutions } from './solver.ts';

export type PuzzleProgress = { checked: number; total: number; removed: number; pending: number; round: number; checkBudgetMs: number; clues: number[] };
export type PuzzleResult = { clues: number[]; removed: number; checked: number; limited: boolean; minimal: boolean; pending: number };
export type PuzzleOptions = {
  random?: () => number;
  /** Optional caller budget. Production digging has no overall deadline. */
  timeLimitMs?: number;
  checkTimeLimitMs?: number;
  onProgress?: (progress: PuzzleProgress) => void;
  now?: () => number;
  check?: typeof countSolutions;
};

/** Dig until every remaining clue is proved necessary. This is locally minimal,
 * not necessarily the fewest clues achievable over all removal orders. */
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
  const { random = Math.random, timeLimitMs = Infinity, checkTimeLimitMs = 250,
    now = () => performance.now(), check = countSolutions } = options;
  const clues = [...board.values];
  let pending = clues.map((_, index) => index);
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
    for (const cell of order) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      yield progress();
      const value = clues[cell];
      clues[cell] = 0;
      let result;
      try { result = check(board.rows, board.columns, clues, Math.min(budget, remaining)); }
      catch (error) { clues[cell] = value; throw error; }
      checked++;
      if (result.status === 'complete' && result.count === 1) {
        removed++;
        pending = pending.filter(index => index !== cell);
      } else {
        clues[cell] = value;
        if (result.status === 'complete' && result.count >= 2) {
          // Removing more clues cannot eliminate either of these solutions.
          // This clue stays necessary for all subsequent accepted removals.
          pending = pending.filter(index => index !== cell);
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
