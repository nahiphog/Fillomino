import { isValidBoard, type Board } from './generator.ts';
import { countSolutions } from './solver.ts';

export type PuzzleProgress = { checked: number; total: number; removed: number };
export type PuzzleResult = { clues: number[]; removed: number; checked: number; limited: boolean };
export type PuzzleOptions = {
  random?: () => number;
  timeLimitMs?: number;
  checkTimeLimitMs?: number;
  onProgress?: (progress: PuzzleProgress) => void;
};

/** Every accepted removal has an exhaustive uniqueness proof. */
export function createPuzzle(board: Board, options: PuzzleOptions = {}): PuzzleResult {
  if (!isValidBoard(board)) throw new Error('A valid completed grid is required.');
  const { random = Math.random, timeLimitMs = 12000, checkTimeLimitMs = 250, onProgress } = options;
  const clues = [...board.values];
  const order = clues.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const deadline = performance.now() + timeLimitMs;
  let removed = 0, checked = 0, limited = false;
  onProgress?.({ checked, total: order.length, removed });
  for (const cell of order) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) { limited = true; break; }
    const value = clues[cell];
    clues[cell] = 0;
    const result = countSolutions(board.rows, board.columns, clues, Math.min(checkTimeLimitMs, remaining));
    if (result.status === 'complete' && result.count === 1) removed++;
    else {
      clues[cell] = value;
      if (result.status === 'timeout') limited = true;
    }
    checked++;
    onProgress?.({ checked, total: order.length, removed });
  }
  return { clues, removed, checked, limited };
}
