const COLORS = [
  '#1e88e5',
  '#f4511e',
  '#43a047',
  '#8e24aa',
  '#00acc1',
  '#c2185b',
];

const nameEl = document.getElementById('name');
const titleEl = document.getElementById('title');
const swatchEl = document.getElementById('swatches');

let windowId = null;
let color = COLORS[0];

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

async function init() {
  const win = await chrome.windows.getCurrent();
  windowId = win.id;
  const res = await chrome.runtime.sendMessage({ type: 'readTag', windowId });
  if (res && res.tag) {
    nameEl.value = res.tag.name;
    color = res.tag.color;
    titleEl.checked = !!res.tag.showInTitle;
  }
  paintSwatches();
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
    tag: { name, color, showInTitle: titleEl.checked },
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
