// ウィンドウID -> {name, color} を保持する。
//
// storage.session を使うので Chrome を終了すると自動的に消える。
// ウィンドウIDは再起動で変わるため、永続化するとタグが別のウィンドウに
// 付いてしまう。消える方が安全という判断。

const KEY = 'tags';
const SETTINGS_KEY = 'settings';
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = '#1e88e5';
const MAX_NAME = 60;

// 表示位置は「毎回変えるもの」ではないので、タグと違って
// storage.local に置き、再起動後も保持する。
const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const DEFAULT_POSITION = 'bottom-right';

// ラベルの大きさも位置と同じく、全ウィンドウ共通の表示設定として扱う。
const SIZES = ['small', 'medium', 'large'];
const DEFAULT_SIZE = 'medium';

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const s = stored[SETTINGS_KEY] || {};
  return {
    position: POSITIONS.includes(s.position) ? s.position : DEFAULT_POSITION,
    size: SIZES.includes(s.size) ? s.size : DEFAULT_SIZE,
  };
}

async function saveSettings(next) {
  // 片方のキーしか渡されないことがある（位置だけ／大きさだけの変更）ので、
  // 既存設定に上書きする形でマージする。
  const current = await getSettings();
  const merged = { ...current, ...next };
  const position = POSITIONS.includes(merged.position)
    ? merged.position
    : DEFAULT_POSITION;
  const size = SIZES.includes(merged.size) ? merged.size : DEFAULT_SIZE;
  await chrome.storage.local.set({ [SETTINGS_KEY]: { position, size } });
  // 位置・大きさは全ウィンドウ共通なので、タグの付いた全ウィンドウに配る
  const all = await getAll();
  for (const windowId of Object.keys(all)) {
    await broadcast(Number(windowId), all[windowId]);
  }
  return { position, size };
}

// 受け取った値をそのまま信用しない。色は CSS に、名前は DOM に流し込むため、
// 形式を固定しておく。
function sanitize(tag) {
  if (!tag || typeof tag !== 'object') return null;
  const name = String(tag.name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  if (!name) return null;
  return {
    name,
    color: COLOR_RE.test(tag.color) ? tag.color : FALLBACK_COLOR,
  };
}

async function getAll() {
  const stored = await chrome.storage.session.get(KEY);
  return stored[KEY] || {};
}

async function getTag(windowId) {
  const all = await getAll();
  return all[windowId] || null;
}

async function saveTag(windowId, tag) {
  const clean = sanitize(tag);
  const all = await getAll();
  if (clean) all[windowId] = clean;
  else delete all[windowId];
  await chrome.storage.session.set({ [KEY]: all });
  await broadcast(windowId, clean);
}

// そのウィンドウの全タブにタグを配る。
// 拡張を入れる前から開いていたタブにはコンテンツスクリプトが
// 入っていないので、必要なら注入してから送る。
async function broadcast(windowId, tag) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return;
  }
  for (const tab of tabs) {
    await sendToTab(tab.id, tag);
  }
}

async function sendToTab(tabId, tag) {
  const { position, size } = await getSettings();
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'tag', tag, position, size });
  } catch {
    // 受け手がいない → 注入してからもう一度
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      await chrome.tabs.sendMessage(tabId, { type: 'tag', tag, position, size });
    } catch {
      // chrome:// や Chrome ウェブストアなど、注入できないページ。ここは諦める
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 他の拡張機能からのメッセージは受け付けない
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'getTag') {
    // コンテンツスクリプトは自分のウィンドウIDを知らないので、
    // 送信元のタブ情報から解決してやる
    const windowId = sender.tab && sender.tab.windowId;
    Promise.all([getTag(windowId), getSettings()]).then(([tag, s]) =>
      sendResponse({ tag, position: s.position, size: s.size })
    );
    return true;
  }
  if (msg.type === 'getSettings') {
    getSettings().then((s) => sendResponse(s));
    return true;
  }
  if (msg.type === 'setSettings') {
    saveSettings(msg.settings || {}).then((s) => sendResponse(s));
    return true;
  }
  if (msg.type === 'setTag') {
    saveTag(msg.windowId, msg.tag).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'readTag') {
    getTag(msg.windowId).then((tag) => sendResponse({ tag }));
    return true;
  }
});

// タブが別ウィンドウに移動したら、移動先のタグを適用し直す
chrome.tabs.onAttached.addListener(async (tabId, info) => {
  const tag = await getTag(info.newWindowId);
  await sendToTab(tabId, tag);
});

// ページ遷移でラベルが消えるので貼り直す
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete') return;
  const tag = await getTag(tab.windowId);
  if (tag) await sendToTab(tabId, tag);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const all = await getAll();
  if (all[windowId]) {
    delete all[windowId];
    await chrome.storage.session.set({ [KEY]: all });
  }
});
