'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function defaultRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return defaultRecords();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultRecords();
    const top = Array.isArray(parsed.top)
      ? parsed.top
          .filter(e => e && typeof e === 'object' && typeof e.score === 'number')
          .map(e => ({
            name: typeof e.name === 'string' ? e.name.slice(0, 12) : '???',
            score: e.score,
            lines: typeof e.lines === 'number' ? e.lines : 0,
            level: typeof e.level === 'number' ? e.level : 1,
          }))
      : [];
    return {
      top: top.sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS),
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      maxLines: typeof parsed.maxLines === 'number' ? parsed.maxLines : 0,
    };
  } catch (e) {
    return defaultRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // ignore storage failures (quota, privacy mode, etc.)
  }
}

function qualifiesForTop(records, score) {
  if (records.top.length < MAX_RECORDS) return true;
  return score > records.top[MAX_RECORDS - 1].score;
}

function insertRecord(records, entry) {
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, MAX_RECORDS);
  return records;
}

function renderRecordsList(listEl, records, highlightEntry) {
  if (!listEl) return;
  listEl.textContent = '';
  if (!records.top.length) {
    const li = document.createElement('li');
    li.className = 'record-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  records.top.forEach((entry, i) => {
    const li = document.createElement('li');
    if (entry === highlightEntry) li.classList.add('record-new');
    const left = document.createElement('span');
    left.textContent = `${i + 1}. ${entry.name}`;
    const right = document.createElement('span');
    right.textContent = `${entry.score.toLocaleString()} (L${entry.level}/${entry.lines})`;
    li.appendChild(left);
    li.appendChild(right);
    listEl.appendChild(li);
  });
}

function renderStartStats(records) {
  if (!startStatsEl) return;
  startStatsEl.textContent = `Mejor combo: ${records.bestCombo} · Líneas máx: ${records.maxLines}`;
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeToggleLabel = document.getElementById('theme-toggle-label');
const overlayRecordsList = document.getElementById('overlay-records-list');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameSubmitBtn = document.getElementById('name-submit-btn');
const startScreen = document.getElementById('start-screen');
const startRecordsList = document.getElementById('start-records-list');
const startStatsEl = document.getElementById('start-stats');
const startBtn = document.getElementById('start-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let combo, runMaxCombo;
let started = false;
let records = loadRecords();

function readGridColor() {
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  themeToggle.checked = theme === 'light';
  themeToggleLabel.textContent = theme === 'light' ? 'Modo claro' : 'Modo oscuro';
  readGridColor();
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem('theme', theme);
  applyTheme(theme);
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > runMaxCombo) runMaxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  if (gameOver) return;
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (gameOver) return;
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (runMaxCombo > records.bestCombo) records.bestCombo = runMaxCombo;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords(records);

  if (qualifiesForTop(records, score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderRecordsList(overlayRecordsList, records, null);
    overlay.classList.remove('hidden');
    setTimeout(() => { try { nameInput.focus(); } catch (e) {} }, 0);
  } else {
    nameEntry.classList.add('hidden');
    renderRecordsList(overlayRecordsList, records, null);
    overlay.classList.remove('hidden');
  }
}

function submitName() {
  if (!gameOver || nameEntry.classList.contains('hidden')) return;
  const raw = nameInput.value.trim();
  const name = (raw || 'AAA').slice(0, 12);
  const entry = { name, score, lines, level };
  insertRecord(records, entry);
  saveRecords(records);
  nameEntry.classList.add('hidden');
  renderRecordsList(overlayRecordsList, records, entry);
}

function clearAllRecords() {
  if (!window.confirm('¿Borrar todos los récords guardados? Esta acción no se puede deshacer.')) return;
  records = defaultRecords();
  saveRecords(records);
  renderRecordsList(startRecordsList, records, null);
  renderStartStats(records);
  renderRecordsList(overlayRecordsList, records, null);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  runMaxCombo = 0;
  started = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  if (gameOver && !nameEntry.classList.contains('hidden')) {
    if (!window.confirm('Todavía no has guardado tu récord. ¿Reiniciar de todos modos y perderlo?')) return;
  }
  init();
});

nameSubmitBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    submitName();
  }
});

resetRecordsBtn.addEventListener('click', clearAllRecords);

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

initTheme();
renderRecordsList(startRecordsList, records, null);
renderStartStats(records);
