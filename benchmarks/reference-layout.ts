import { generateBoard, isValidBoard, validDimensions, type Board } from '../src/generator.ts';
import { countSolutions } from '../src/solver.ts';

export type LayoutProgress = { attempts: number; timeouts: number };
export type LayoutResult =
  | { status: 'found'; clues: number[]; board: Board; attempts: number; timeouts: number }
  | { status: 'not-found' | 'invalid'; attempts: number; timeouts: number };
export type LayoutOptions = {
  /** Optional budgets for callers/tests; the interactive search is unlimited. */
  timeLimitMs?: number;
  maxAttempts?: number;
  checkTimeLimitMs?: number;
  random?: () => number;
  now?: () => number;
  generate?: typeof generateBoard;
  check?: typeof countSolutions;
  onProgress?: (progress: LayoutProgress) => void;
};

/** Search completed boards, revealing exactly the chosen positions. No digging
 * or symmetry expansion is allowed to alter this user-defined clue mask. */
export function createLayoutPuzzle(rows: number, columns: number, mask: boolean[], options: LayoutOptions = {}): LayoutResult {
  let attempts = 0, timeouts = 0;
  if (!validDimensions(rows, columns) || mask.length !== rows * columns ||
      mask.some(value => typeof value !== 'boolean') || !mask.some(Boolean)) {
    return { status: 'invalid', attempts, timeouts };
  }
  const { timeLimitMs = Infinity, maxAttempts = Infinity, checkTimeLimitMs = 500,
    random = Math.random, now = () => performance.now(), generate = generateBoard,
    check = countSolutions, onProgress } = options;
  const deadline = now() + timeLimitMs;
  onProgress?.({ attempts, timeouts });
  while (attempts < maxAttempts && now() < deadline) {
    const board = generate(rows, columns, random);
    if (board.rows !== rows || board.columns !== columns || !isValidBoard(board)) {
      throw new Error('Layout generation requires a valid completed board.');
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const clues = board.values.map((value, i) => mask[i] ? value : 0);
    const result = check(rows, columns, clues, Math.min(checkTimeLimitMs, remaining));
    attempts++;
    if (result.status === 'timeout') timeouts++;
    onProgress?.({ attempts, timeouts });
    if (result.status === 'complete' && result.count === 1) {
      return { status: 'found', clues, board, attempts, timeouts };
    }
    // Exhausting the search budget does not prove that this layout is impossible.
  }
  return { status: 'not-found', attempts, timeouts };
}

