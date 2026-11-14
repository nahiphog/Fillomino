import { neighbors } from './generator.ts';

export type Deduction = 'completedRegion' | 'forcedMerge' | 'insufficientSpace' | 'exactFit' | 'bottleneck' | 'branch';
export type SolverMetrics = {
  nodes: number; branches: number; contradictions: number; forcedAssignments: number;
  propagationChecks: number; removals: Record<Deduction, number>; elapsedMs: number;
  regionBranches: number; regionShapes: number;
};
export function newMetrics(): SolverMetrics {
  return { nodes: 0, branches: 0, regionBranches: 0, regionShapes: 0, contradictions: 0, forcedAssignments: 0, propagationChecks: 0,
    removals: { completedRegion: 0, forcedMerge: 0, insufficientSpace: 0, exactFit: 0, bottleneck: 0, branch: 0 }, elapsedMs: 0 };
}

/** Cell domains with a reversible deletion trail and a work queue of affected sizes. */
export class Constraints {
  readonly count: number;
  readonly stride: number;
  readonly adjacent: number[][];
  readonly domains: Uint8Array;
  readonly lengths: Uint16Array;
  readonly fixed: Uint16Array;
  readonly trail: number[] = [];
  private queue: number[] = [];
  private queued: Uint8Array;
  readonly metrics: SolverMetrics;
  private checkTime: () => void;

  constructor(rows: number, columns: number, clues: number[], metrics: SolverMetrics, checkTime: () => void) {
    this.count = rows * columns; this.stride = this.count + 1;
    this.adjacent = Array.from({ length: this.count }, (_, i) => neighbors(i, rows, columns));
    this.domains = new Uint8Array(this.count * this.stride);
    this.lengths = new Uint16Array(this.count);
    this.fixed = new Uint16Array(clues);
    this.queued = new Uint8Array(this.stride);
    this.metrics = metrics; this.checkTime = checkTime;
    for (let cell = 0; cell < this.count; cell++) {
      this.lengths[cell] = clues[cell] ? 1 : this.count;
      for (let n = 1; n <= this.count; n++) if (!clues[cell] || clues[cell] === n) this.domains[cell * this.stride + n] = 1;
    }
    for (let n = this.count; n >= 1; n--) this.enqueue(n);
  }

  has(cell: number, n: number): boolean { return this.domains[cell * this.stride + n] === 1; }
  candidates(cell: number): number[] {
    const result: number[] = [];
    for (let n = 1; n <= this.count; n++) if (this.has(cell, n)) result.push(n);
    return result;
  }
  private enqueue(n: number) {
    if (!this.queued[n]) { this.queued[n] = 1; this.queue.push(n); }
  }
  remove(cell: number, n: number, reason: Deduction): boolean {
    const index = cell * this.stride + n;
    if (!this.domains[index]) return true;
    this.domains[index] = 0; this.trail.push(index); this.lengths[cell]--;
    this.metrics.removals[reason]++; this.enqueue(n);
    if (!this.lengths[cell]) { this.fixed[cell] = 0; return false; }
    if (this.lengths[cell] === 1) {
      const value = this.candidates(cell)[0];
      this.fixed[cell] = value; this.enqueue(value);
      if (reason !== 'branch') this.metrics.forcedAssignments++;
    }
    return true;
  }
  assign(cell: number, n: number, reason: Deduction): boolean {
    if (!this.has(cell, n)) return false;
    for (let other = 1; other <= this.count; other++) {
      if (other !== n && !this.remove(cell, other, reason)) return false;
    }
    return true;
  }
  undo(mark: number) {
    while (this.trail.length > mark) {
      const index = this.trail.pop()!, cell = Math.floor(index / this.stride);
      this.domains[index] = 1; this.lengths[cell]++;
      this.fixed[cell] = this.lengths[cell] === 1 ? index % this.stride : 0;
    }
    // Search only branches from a propagation fixed point, so the parent is clean.
    this.queue = []; this.queued.fill(0);
  }

  /** An overestimate of the cells that could belong to this fixed component. */
  private reachable(cells: number[], n: number, excluded = -1): number[] {
    const distance = new Int16Array(this.count).fill(-1), queue = [...cells];
    for (const cell of cells) distance[cell] = 0;
    const maxDistance = n - cells.length;
    for (let head = 0; head < queue.length; head++) {
      if ((head & 63) === 0) this.checkTime();
      const cell = queue[head];
      if (distance[cell] >= maxDistance) continue;
      for (const next of this.adjacent[cell]) {
        if (next !== excluded && distance[next] < 0 && this.has(next, n)) {
          distance[next] = distance[cell] + 1; queue.push(next);
        }
      }
    }
    return queue;
  }

  private process(n: number): boolean {
    this.checkTime(); this.metrics.propagationChecks++;
    const startMark = this.trail.length;
    const ids = new Int16Array(this.count).fill(-1), components: number[][] = [];
    for (let start = 0; start < this.count; start++) {
      if (this.fixed[start] !== n || ids[start] >= 0) continue;
      const cells = [start], id = components.length;
      ids[start] = id;
      for (let head = 0; head < cells.length; head++) for (const next of this.adjacent[cells[head]]) {
        if (this.fixed[next] === n && ids[next] < 0) { ids[next] = id; cells.push(next); }
      }
      if (cells.length > n) return false;
      components.push(cells);
    }
    // Count distinct components, not the number of neighboring cells.
    for (let cell = 0; cell < this.count; cell++) {
      if (this.fixed[cell] || !this.has(cell, n)) continue;
      const touching = [...new Set(this.adjacent[cell].map(next => ids[next]).filter(id => id >= 0))];
      const mergedSize = 1 + touching.reduce((sum, id) => sum + components[id].length, 0);
      if (mergedSize > n && !this.remove(cell, n,
        touching.some(id => components[id].length === n) ? 'completedRegion' : 'forcedMerge')) return false;
    }
    // Applies to all sizes, including regions with no original clues.
    const visited = new Uint8Array(this.count);
    for (let start = 0; start < this.count; start++) {
      if (visited[start] || !this.has(start, n)) continue;
      const cells = [start]; visited[start] = 1;
      for (let head = 0; head < cells.length; head++) for (const next of this.adjacent[cells[head]]) {
        if (!visited[next] && this.has(next, n)) { visited[next] = 1; cells.push(next); }
      }
      if (cells.length < n) for (const cell of cells) if (!this.remove(cell, n, 'insufficientSpace')) return false;
    }
    for (const cells of components) {
      if (cells.length === n) continue;
      const area = this.reachable(cells, n);
      if (area.length < n) return false;
      if (area.length === n) {
        for (const cell of area) if (!this.assign(cell, n, 'exactFit')) return false;
      }
    }
    // Rebuild components after cheap deductions before costly cut tests.
    if (this.trail.length !== startMark) { this.enqueue(n); return true; }
    for (const cells of components) {
      if (cells.length === n) continue;
      const area = this.reachable(cells, n);
      // Large areas use immediate exits; skipping other cuts cannot remove solutions.
      const cuts = area.length <= 64 ? area : [...new Set(cells.flatMap(cell => this.adjacent[cell]))];
      for (const cell of cuts) {
        if (this.fixed[cell] || !this.has(cell, n)) continue;
        if (this.reachable(cells, n, cell).length < n) {
          if (!this.assign(cell, n, 'bottleneck')) return false;
          this.enqueue(n); return true;
        }
      }
    }
    return true;
  }

  propagate(): boolean {
    while (this.queue.length) {
      const n = this.queue.pop()!; this.queued[n] = 0;
      if (!this.process(n)) return false;
    }
    return true;
  }
  chooseCell(): number {
    let best = -1, bestLength = Infinity, bestScore = -1;
    for (let cell = 0; cell < this.count; cell++) {
      if (this.lengths[cell] <= 1) continue;
      const score = this.adjacent[cell].reduce((sum, next) => sum + (this.fixed[next] ? 4 : 1), 0);
      if (this.lengths[cell] < bestLength || (this.lengths[cell] === bestLength && score > bestScore)) {
        best = cell; bestLength = this.lengths[cell]; bestScore = score;
      }
    }
    return best;
  }
}
