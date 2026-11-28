// 線のアイコン(SVG)。絵文字の代わりに使う。
// 色は currentColor なので、文字色(テーマ)にそのまま馴染む。外部ライブラリを使わないのでリクエストも増えない
// HTML 文字列には icon('名前') を、静的な HTML には <span data-icon="名前"></span> を書いて mountIcons() で埋める

const PATHS = {
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    rank: '<circle cx="12" cy="9" r="5"/><path d="m9 13.5-1.5 6.5L12 18l4.5 2-1.5-6.5"/><path d="m12 6.6.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z"/>',
    score: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    summary: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
    growth: '<path d="m4 16 5-5 4 4 7-7"/><path d="M15 8h5v5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
    book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
    refresh: '<path d="M19 12a7 7 0 0 1-12.3 4.6"/><path d="M5 12a7 7 0 0 1 12.3-4.6"/><path d="M17.5 3.5v4h-4M6.5 20.5v-4h4"/>',
    archive: '<rect x="4" y="4" width="16" height="5" rx="1"/><path d="M5.5 9v10h13V9"/><path d="M10 13h4"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    folder: '<path d="M3.5 6.5h6l2 2h9v10h-17z"/>',
    tools: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 5-4.5 3.5 3 2.5-2 3 3"/>',
    imageOff: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="0.8" fill="currentColor"/><circle cx="5" cy="12" r="0.8" fill="currentColor"/><circle cx="5" cy="18" r="0.8" fill="currentColor"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19.5h6M12 15.5v4"/>',
    bookmark: '<path d="M7 4h10v16l-5-3.5L7 20z"/>',
    podium: '<path d="M3.5 20h17"/><path d="M9 20V7.5h6V20M3.5 20v-8h5.5M15 20v-5.5h5.5V20"/>',
    crown: '<path d="M4 17.5 3 8l5 3.5L12 5l4 6.5L21 8l-1 9.5z"/><path d="M5 20.5h14"/>',
    zap:'<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
};

export function icon(name, cls = '') {
    const body = PATHS[name];
    if (!body) return '';
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// 理論値(MAX)の王冠(プラチナ色)。画像に撮る範囲でも使うので、色を直接書く(撮るときは CSS の色が効かないため)
export function crownMark(cls = 'crown-mark') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 17.5 3 8l5 3.5L12 5l4 6.5L21 8l-1 9.5z" fill="#e4eefa" stroke="#5d6c82" stroke-width="1.2" stroke-linejoin="round"/><rect x="4.5" y="19" width="15" height="2.2" rx="1" fill="#e4eefa" stroke="#5d6c82" stroke-width="1"/></svg>`;
}

// 静的な HTML の <span data-icon="名前"> をアイコンに置き換える
export function mountIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        el.outerHTML = icon(el.dataset.icon, el.className);
    });
}

// アイコン + 文字の HTML(ボタンのラベルなどに使う)
export function iconLabel(name, text) {
    return `${icon(name)}<span>${text}</span>`;
}
