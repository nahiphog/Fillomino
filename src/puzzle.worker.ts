import { generateBoard, type Board } from './generator.ts';
import { createPuzzle, type PuzzleProgress, type PuzzleResult } from './puzzle.ts';

export type PuzzleWorkerMessage =
  | { type: 'progress'; progress: PuzzleProgress }
  | { type: 'complete'; size: number; result: PuzzleResult }
  | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<{ size: number; board?: Board }>) => {
  try {
    const board = event.data.board ?? generateBoard(event.data.size);
    const result = createPuzzle(board, {
      onProgress: progress => self.postMessage({ type: 'progress', progress } satisfies PuzzleWorkerMessage),
    });
    self.postMessage({ type: 'complete', size: board.size, result } satisfies PuzzleWorkerMessage);
  } catch {
    self.postMessage({ type: 'error', message: 'Unable to create a puzzle. Your grid is unchanged; please try again.' } satisfies PuzzleWorkerMessage);
  }
};
