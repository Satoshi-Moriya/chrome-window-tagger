// ページ上にラベルを描く。Shadow DOM に閉じ込めるので、
// サイト側の CSS と衝突しない。クリックも透過する。

if (!window.__windowTaggerLoaded) {
  window.__windowTaggerLoaded = true;

  (() => {
    const COLOR_RE = /^#[0-9a-f]{6}$/i;
    const FALLBACK_COLOR = '#1e88e5';
    const MAX_NAME = 60;

    let host = null;
    let badge = null;
    let current = null;

    let cleanTitle = document.title; // タグの接頭辞を外した素のタイトル
    let applyingTitle = false;
    let titleObserver = null;

    // 背景側でも検証しているが、ここでも必ず通す。
    // color は CSS に、name は DOM に入るため、素性の保証を二重にする。
    function sanitize(tag) {
      if (!tag || typeof tag !== 'object') return null;
      const name = String(tag.name ?? '').trim().slice(0, MAX_NAME);
      if (!name) return null;
      return {
        name,
        color: COLOR_RE.test(tag.color) ? tag.color : FALLBACK_COLOR,
        showInTitle: tag.showInTitle === true,
      };
    }

    function ensureHost() {
      if (host && host.isConnected) return;
      host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
      const root = host.attachShadow({ mode: 'closed' });
      badge = document.createElement('div');
      badge.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'padding:6px 12px',
        'border-radius:6px',
        'font:600 12px/1.4 system-ui, "Yu Gothic UI", sans-serif',
        'color:#fff',
        'letter-spacing:.02em',
        'box-shadow:0 2px 8px rgba(0,0,0,.28)',
        'pointer-events:none',
        'user-select:none',
        'opacity:.92',
        'max-width:40vw',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
      ].join(';');
      root.appendChild(badge);
      (document.body || document.documentElement).appendChild(host);
    }

    function watchTitle() {
      if (titleObserver) return;
      const titleEl = document.querySelector('title');
      if (!titleEl) return;
      titleObserver = new MutationObserver(() => {
        if (applyingTitle) return;
        // サイト側がタイトルを書き換えた → 素のタイトルとして記録し直す
        cleanTitle = stripPrefix(document.title);
        applyTitle();
      });
      titleObserver.observe(titleEl, { childList: true });
    }

    // 自分が付けた接頭辞だけを外す。
    // 正規表現で [..] を落とすと「[速報] ニュース」のような
    // 元から角括弧で始まるタイトルを壊すため、完全一致で判定する。
    function stripPrefix(t) {
      if (!current || !current.showInTitle) return t;
      const p = `[${current.name}] `;
      return t.startsWith(p) ? t.slice(p.length) : t;
    }

    function applyTitle() {
      const want =
        current && current.showInTitle
          ? `[${current.name}] ${cleanTitle}`
          : cleanTitle;
      if (document.title === want) return;
      applyingTitle = true;
      document.title = want;
      // MutationObserver は非同期に走るのでマイクロタスク後に解除
      Promise.resolve().then(() => {
        applyingTitle = false;
      });
    }

    function render(tag) {
      // 先に旧タグの接頭辞を外してから、新しい状態に移る
      cleanTitle = stripPrefix(document.title);
      current = sanitize(tag);

      if (!current) {
        if (host && host.isConnected) host.remove();
        host = null;
        applyTitle();
        return;
      }
      ensureHost();
      badge.textContent = current.name;
      badge.style.background = current.color;
      watchTitle();
      applyTitle();
    }

    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (msg.type === 'tag') render(msg.tag);
    });

    // 読み込み時に自分のウィンドウのタグを取りに行く
    chrome.runtime.sendMessage({ type: 'getTag' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.tag) render(res.tag);
    });
  })();
}
