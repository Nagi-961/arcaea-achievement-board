// ダーク / ライトの切り替え。
// 描画前にテーマを決めて画面のちらつきを防ぐため、ES Modules ではなく <head> で同期的に読み込む。
// 選んだテーマは 'arcaea_theme_v1' に保存し、未選択なら OS の設定に合わせる
(() => {
    const KEY = 'arcaea_theme_v1';
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');

    const saved = () => {
        try { return localStorage.getItem(KEY); } catch (err) { return null; }
    };
    const preferred = () => saved() || (media.matches ? 'light' : 'dark');

    root.dataset.theme = preferred();

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        const sync = () => {
            const light = root.dataset.theme === 'light';
            btn.textContent = light ? '☾' : '☀';
            const label = light ? 'ダークモードにする' : 'ライトモードにする';
            btn.setAttribute('aria-label', label);
            btn.title = label;
        };
        sync();
        btn.addEventListener('click', () => {
            const next = root.dataset.theme === 'light' ? 'dark' : 'light';
            try { localStorage.setItem(KEY, next); } catch (err) { /* 保存できなくても切り替えはする */ }
            root.dataset.theme = next;
            sync();
        });
        // 自分で選んでいなければ、OS の設定の変更に追従する
        media.addEventListener('change', () => {
            if (saved()) return;
            root.dataset.theme = preferred();
            sync();
        });
    });
})();
