const COLORS = [
  '#1e88e5',
  '#f4511e',
  '#43a047',
  '#8e24aa',
  '#00acc1',
  '#c2185b',
];

const POSITIONS = [
  ['top-left', '左上'],
  ['top-right', '右上'],
  ['bottom-left', '左下'],
  ['bottom-right', '右下'],
];

const nameEl = document.getElementById('name');
const swatchEl = document.getElementById('swatches');
const cornerEl = document.getElementById('corners');

let windowId = null;
let color = COLORS[0];
let position = 'bottom-right';

function paintSwatches() {
  swatchEl.replaceChildren();
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.type = 'button';
    b.setAttribute('aria-label', c);
    b.setAttribute('aria-pressed', String(c === color));
    b.addEventListener('click', () => {
      color = c;
      paintSwatches();
    });
    swatchEl.appendChild(b);
  }
}

function paintCorners() {
  cornerEl.replaceChildren();
  for (const [pos, label] of POSITIONS) {
    const b = document.createElement('button');
    b.className = 'corner';
    b.type = 'button';
    b.dataset.pos = pos;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(pos === position));
    b.addEventListener('click', async () => {
      position = pos;
      paintCorners();
      // 位置は即時反映する。ポップアップを閉じずに結果を確認できるほうが
      // 選びやすいため、「適用」を待たない。
      await chrome.runtime.sendMessage({
        type: 'setSettings',
        settings: { position },
      });
    });
    cornerEl.appendChild(b);
  }
}

async function init() {
  const win = await chrome.windows.getCurrent();
  windowId = win.id;
  const [res, settings] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'readTag', windowId }),
    chrome.runtime.sendMessage({ type: 'getSettings' }),
  ]);
  if (res && res.tag) {
    nameEl.value = res.tag.name;
    color = res.tag.color;
  }
  if (settings && settings.position) position = settings.position;
  paintSwatches();
  paintCorners();
  nameEl.select();
}

document.getElementById('apply').addEventListener('click', async () => {
  const name = nameEl.value.trim();
  if (!name) {
    nameEl.focus();
    return;
  }
  await chrome.runtime.sendMessage({
    type: 'setTag',
    windowId,
    tag: { name, color },
  });
  window.close();
});

document.getElementById('clear').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'setTag', windowId, tag: null });
  window.close();
});

nameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('apply').click();
});

init();
