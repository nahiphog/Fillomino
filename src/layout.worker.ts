import { createLayoutPuzzle, type LayoutProgress, type LayoutResult } from './layout.ts';

export type LayoutWorkerMessage =
  | { type: 'progress'; progress: LayoutProgress }
  | { type: 'complete'; result: LayoutResult }
  | { type: 'error' };

self.onmessage = (event: MessageEvent<{ rows: number; columns: number; mask: boolean[] }>) => {
  try {
    const { rows, columns, mask } = event.data;
    const result = createLayoutPuzzle(rows, columns, mask, {
      onProgress: progress => self.postMessage({ type: 'progress', progress } satisfies LayoutWorkerMessage),
    });
    self.postMessage({ type: 'complete', result } satisfies LayoutWorkerMessage);
  } catch {
    self.postMessage({ type: 'error' } satisfies LayoutWorkerMessage);
  }
};
