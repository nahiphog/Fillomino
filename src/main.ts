import './style.css';
import { generateBoard, isValidBoard, type Board } from './generator.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><a class="brand" href="./"><span class="brand-mark">f.</span>fillomino<span class="brand-dot">®</span></a><span class="header-note">A LITTLE ROOM FOR LOGIC</span></header>
  <main><section class="intro"><div class="eyebrow"><span></span> THE NUMBER REGION PUZZLE</div><h1>Everything has<br>its <em>place.</em></h1><p>A grid of numbers. A collection of regions.<br>A satisfying little world where everything fits.</p></section>
  <section class="workspace" aria-label="Fillomino generator"><aside><div class="section-label">01 / MAKE A GRID</div><h2>Start with a size.</h2><p>Choose your canvas. We’ll fill it with a complete, valid Fillomino solution.</p><form id="generate-form"><label for="size">Grid size <span>3–15</span></label><div class="size-input"><input id="size" type="number" min="3" max="15" step="1" value="6" required aria-describedby="size-help"><span id="dimensions">× 6</span></div><div id="size-help" class="hint">Rows × columns · always square</div><button class="generate" type="submit">Generate <span aria-hidden="true">↗</span></button></form><label class="toggle"><input id="colors" type="checkbox" checked><span>Region colors</span></label><div class="rule-card"><span class="small-label">THE BEAUTY IS IN THE RULES</span><ol><li>Every region is connected edge to edge.</li><li>Each number tells you its region’s size.</li><li>Equal-sized regions never share an edge.</li></ol></div></aside>
  <div class="board-panel"><div class="board-toolbar"><span id="board-title">YOUR COMPLETED GRID</span><span class="valid-badge">✓ Valid solution</span></div><div class="board-wrap"><div id="board" role="table" aria-label="Completed Fillomino grid"></div></div><div class="board-footer"><div id="stats"></div><button id="copy" type="button">Copy grid <span aria-hidden="true">↗</span></button></div><p id="status" role="status" aria-live="polite"></p></div></section>
  <footer><span>Small numbers. Beautiful possibilities.</span><span>FILLOMINO / GRID STUDIO</span></footer></main>`;

const input = document.querySelector<HTMLInputElement>('#size')!;
const boardElement = document.querySelector<HTMLDivElement>('#board')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let board: Board;

function render() {
  board = generateBoard(Number(input.value));
  if (!isValidBoard(board)) throw new Error('The generated grid did not pass validation. Please try again.');
  boardElement.replaceChildren();
  boardElement.style.setProperty('--size', String(board.size));
  boardElement.setAttribute('aria-label', `Completed ${board.size} by ${board.size} Fillomino grid`);
  for (let row = 0; row < board.size; row++) {
    const rowElement = document.createElement('div');
    rowElement.className = 'board-row';
    rowElement.setAttribute('role', 'row');
    for (let column = 0; column < board.size; column++) {
      const index = row * board.size + column;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'cell');
      cell.textContent = String(board.values[index]);
      cell.style.setProperty('--cell-color', `var(--color-${(board.values[index] - 1) % 9})`);
      if (column < board.size - 1 && board.regions[index] !== board.regions[index + 1]) cell.classList.add('edge-right');
      if (row < board.size - 1 && board.regions[index] !== board.regions[index + board.size]) cell.classList.add('edge-bottom');
      rowElement.append(cell);
    }
    boardElement.append(rowElement);
  }
  document.querySelector('#stats')!.textContent = `${board.size} × ${board.size} grid  ·  ${new Set(board.regions).size} regions  ·  ${board.values.length} cells`;
}

input.addEventListener('input', () => { document.querySelector('#dimensions')!.textContent = `× ${input.value || '—'}`; });
document.querySelector('#generate-form')!.addEventListener('submit', event => {
  event.preventDefault();
  if (!input.reportValidity()) return;
  try { render(); status.textContent = 'New grid generated. All regions checked and valid.'; }
  catch (error) { status.textContent = error instanceof Error ? error.message : 'Unable to generate grid.'; }
});
document.querySelector('#colors')!.addEventListener('change', event => { boardElement.classList.toggle('no-colors', !(event.target as HTMLInputElement).checked); });
document.querySelector('#copy')!.addEventListener('click', async () => {
  const text = Array.from({ length: board.size }, (_, row) => board.values.slice(row * board.size, (row + 1) * board.size).join(' ')).join('\n');
  try { await navigator.clipboard.writeText(text); status.textContent = 'Grid copied. Numbers are separated by spaces.'; }
  catch { status.textContent = 'Clipboard unavailable. Select the grid’s numbers to copy them.'; }
});
render();
