import { generateBoard, type Board } from './generator.ts';
import { digPuzzle, type PuzzleProgress, type PuzzleResult } from './puzzle.ts';

export type PuzzleWorkerMessage =
  | { type: 'progress'; rows: number; columns: number; progress: PuzzleProgress }
  | { type: 'complete'; rows: number; columns: number; result: PuzzleResult }
  | { type: 'error'; message: string };

export type PuzzleWorkerRequest =
  | { type: 'start'; rows: number; columns: number; board?: Board; rotationalSymmetry?: boolean }
  | { type: 'next' };

let board: Board | undefined;
let steps: ReturnType<typeof digPuzzle> | undefined;

self.onmessage = (event: MessageEvent<PuzzleWorkerRequest>) => {
  try {
    if (event.data.type === 'start') {
      board = event.data.board ?? generateBoard(event.data.rows, event.data.columns);
      steps = digPuzzle(board, { rotationalSymmetry: event.data.rotationalSymmetry });
    }
    if (!steps || !board) return;
    const step = steps.next();
    if (step.done) {
      steps = undefined;
      self.postMessage({ type: 'complete', rows: board.rows, columns: board.columns, result: step.value } satisfies PuzzleWorkerMessage);
    } else {
      self.postMessage({ type: 'progress', rows: board.rows, columns: board.columns, progress: step.value } satisfies PuzzleWorkerMessage);
    }
  } catch {
    steps = undefined;
    self.postMessage({ type: 'error', message: 'Unable to create a puzzle. Your grid is unchanged; please try again.' } satisfies PuzzleWorkerMessage);
  }
};
