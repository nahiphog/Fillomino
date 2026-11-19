import { generateBoard, isValidBoard, validDimensions, type Board } from './generator.ts';
import { countSolutions } from './solver.ts';
import { generateLayoutBoard, mergeLayoutRegions } from './layout-generator.ts';

export type LayoutProgress = { attempts: number; timeouts: number };
export type LayoutResult =
  | { status: 'found'; clues: number[]; board: Board; attempts: number; timeouts: number }
  | { status: 'not-found' | 'invalid'; attempts: number; timeouts: number };
export type LayoutOptions = {
  /** Optional budgets for callers/tests; the interactive search is unlimited. */
  timeLimitMs?: number;
  maxAttempts?: number;
  checkTimeLimitMs?: number;
  deduplicate?: boolean;
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
    random = Math.random, now = () => performance.now(), generate,
    check = countSolutions, onProgress } = options;
  const deadline = now() + timeLimitMs;
  let repaired: Board | undefined;
  let restarts = 0;
  const ambiguous = new Set<string>();
  onProgress?.({ attempts, timeouts });
  while (attempts < maxAttempts && now() < deadline) {
    // Keep periodic independent restarts: unclued regions are legal, so the
    // clue-seeded construction is a heuristic, not a restriction on solutions.
    const board = generate ? generate(rows, columns, random) : repaired ?? (restarts++ % 5 === 4
      ? generateBoard(rows, columns, random) : generateLayoutBoard(rows, columns, mask, random, restarts % 2 === 0));
    repaired = undefined;
    if (board.rows !== rows || board.columns !== columns || !isValidBoard(board)) {
      throw new Error('Layout generation requires a valid completed board.');
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const clues = board.values.map((value, i) => mask[i] ? value : 0);
    const key = clues.join(',');
    if (options.deduplicate !== false && ambiguous.has(key)) {
      attempts++;
      if (!generate) repaired = mergeLayoutRegions(board, random);
      onProgress?.({ attempts, timeouts });
      continue;
    }
    // Broad exploration gets a short exact check; periodic longer checks avoid
    // spending the entire search on the first difficult candidates.
    const probeBudget = attempts % 12 === 11 ? checkTimeLimitMs : Math.min(25, checkTimeLimitMs);
    const result = check(rows, columns, clues, Math.min(probeBudget, remaining));
    attempts++;
    if (result.status === 'timeout') timeouts++;
    onProgress?.({ attempts, timeouts });
    if (result.status === 'complete' && result.count === 1) {
      return { status: 'found', clues, board, attempts, timeouts };
    }
    if (result.status === 'complete' && result.count >= 2) {
      if (ambiguous.size >= 2048) ambiguous.delete(ambiguous.values().next().value!);
      ambiguous.add(key);
    }
    if (!generate) repaired = mergeLayoutRegions(board, random);
    // Exhausting the search budget does not prove that this layout is impossible.
  }
  return { status: 'not-found', attempts, timeouts };
}
