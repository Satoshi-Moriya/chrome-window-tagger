// ページ上にラベルを描く。Shadow DOM に閉じ込めるので、
// サイト側の CSS と衝突しない。クリックも透過する。
//
// ページのタイトルには一切触れない。ラベルはこの Shadow DOM の中で
// 完結しており、サイト側の JavaScript からは読み取れない。

if (!window.__windowTaggerLoaded) {
  window.__windowTaggerLoaded = true;

  (() => {
    const COLOR_RE = /^#[0-9a-f]{6}$/i;
    const FALLBACK_COLOR = '#1e88e5';
    const MAX_NAME = 60;

    const GAP = '16px';
    const POSITIONS = {
      'top-left': { top: GAP, bottom: 'auto', left: GAP, right: 'auto' },
      'top-right': { top: GAP, bottom: 'auto', left: 'auto', right: GAP },
      'bottom-left': { top: 'auto', bottom: GAP, left: GAP, right: 'auto' },
      'bottom-right': { top: 'auto', bottom: GAP, left: 'auto', right: GAP },
    };
    const DEFAULT_POSITION = 'bottom-right';

    // 大きさは3段階。フォントサイズ・余白・角丸をまとめて変える。
    const SIZES = {
      small: {
        padding: '4px 10px',
        font: '600 10px/1.4 system-ui, "Yu Gothic UI", sans-serif',
        radius: '5px',
      },
      medium: {
        padding: '6px 12px',
        font: '600 12px/1.4 system-ui, "Yu Gothic UI", sans-serif',
        radius: '6px',
      },
      large: {
        padding: '8px 16px',
        font: '600 14px/1.4 system-ui, "Yu Gothic UI", sans-serif',
        radius: '7px',
      },
    };
    const DEFAULT_SIZE = 'medium';

    let host = null;
    let badge = null;
    let current = null;
    let position = DEFAULT_POSITION;
    let size = DEFAULT_SIZE;

    // 背景側でも検証しているが、ここでも必ず通す。
    // color は CSS に、name は DOM に入るため、素性の保証を二重にする。
    function sanitize(tag) {
      if (!tag || typeof tag !== 'object') return null;
      const name = String(tag.name ?? '').trim().slice(0, MAX_NAME);
      if (!name) return null;
      return {
        name,
        color: COLOR_RE.test(tag.color) ? tag.color : FALLBACK_COLOR,
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
      applyPosition();
      applySize();
    }

    // 四隅のいずれかに寄せる。指定が不正なら既定の右下に戻す。
    function applyPosition() {
      if (!badge) return;
      const p = POSITIONS[position] || POSITIONS[DEFAULT_POSITION];
      badge.style.top = p.top;
      badge.style.bottom = p.bottom;
      badge.style.left = p.left;
      badge.style.right = p.right;
    }

    // 大きさを反映する。指定が不正なら既定の中サイズに戻す。
    function applySize() {
      if (!badge) return;
      const s = SIZES[size] || SIZES[DEFAULT_SIZE];
      badge.style.padding = s.padding;
      badge.style.font = s.font;
      badge.style.borderRadius = s.radius;
    }

    function render(tag, nextPosition, nextSize) {
      if (POSITIONS[nextPosition]) position = nextPosition;
      if (SIZES[nextSize]) size = nextSize;
      current = sanitize(tag);

      if (!current) {
        if (host && host.isConnected) host.remove();
        host = null;
        badge = null;
        return;
      }
      ensureHost();
      badge.textContent = current.name;
      badge.style.background = current.color;
      applyPosition();
      applySize();
    }

    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (msg.type === 'tag') render(msg.tag, msg.position, msg.size);
    });

    // 読み込み時に自分のウィンドウのタグを取りに行く
    chrome.runtime.sendMessage({ type: 'getTag' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.tag) render(res.tag, res.position, res.size);
    });
  })();
}
