// 画面の動き(アニメーション)のうち、CSS だけでは作れないもの。
// <details class="slide"> の中身(.slide-body)を、開くときは下にスライド、閉じるときは上にたたむ。
// iPhone の Safari では <details> の開閉を CSS でアニメーションできないので、高さを JS で動かす

const DURATION = 260;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const running = new WeakMap(); // details → 動いている Animation

function slide(details, body, opening) {
    // 途中で逆向きに押されたら、今の高さから動かし直す(止める前に測る)
    const prev = running.get(details);
    const from = prev || !opening ? (details.open ? body.offsetHeight : 0) : 0;
    prev?.cancel();
    if (opening) details.open = true;
    const to = opening ? body.scrollHeight : 0;
    body.style.overflow = 'hidden';
    const anim = body.animate(
        [{ height: `${from}px`, opacity: opening ? 0 : 1 }, { height: `${to}px`, opacity: opening ? 1 : 0 }],
        { duration: DURATION, easing: EASING },
    );
    running.set(details, anim);
    anim.onfinish = () => {
        running.delete(details);
        body.style.overflow = '';
        if (!opening) details.open = false;
    };
    anim.oncancel = () => { body.style.overflow = ''; };
}

// 切り替え(.seg): 選んでいるボタンの下に札(.seg-thumb)を敷く。
// 押すと表ごと描き直されるので、前の位置を key ごとに覚えておき、描き直した後にそこから今の位置へ滑らせる
const segLast = new Map(); // key → { left, width }
export function mountSeg(box) {
    const key = box.dataset.seg || '';
    let thumb = box.querySelector(':scope > .seg-thumb');
    if (!thumb) {
        thumb = document.createElement('span');
        thumb.className = 'seg-thumb';
        thumb.setAttribute('aria-hidden', 'true');
        box.prepend(thumb);
    }
    const place = animate => {
        const a = box.querySelector(':scope > .active');
        if (!a || !a.offsetWidth) return;
        thumb.style.transition = animate ? '' : 'none';
        thumb.style.left = `${a.offsetLeft}px`;
        thumb.style.width = `${a.offsetWidth}px`;
        segLast.set(key, { left: a.offsetLeft, width: a.offsetWidth });
    };
    const prev = segLast.get(key);
    if (prev && !reduced.matches) {
        thumb.style.transition = 'none';
        thumb.style.left = `${prev.left}px`;
        thumb.style.width = `${prev.width}px`;
        void thumb.offsetWidth; // 前の位置を確定させてから動かす(ここで確定させるので、次の描画を待たずに滑らせられる)
        place(true);
    } else {
        place(false);
    }
    // 最初は隠れていて幅が0のとき・画面幅が変わったときは、動かさずに置き直す
    // (observe した直後にも1回呼ばれるので、幅が変わっていないときは何もしない。滑っている途中を止めないため)
    let lastW = box.offsetWidth;
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => {
            if (box.offsetWidth === lastW) return;
            lastW = box.offsetWidth;
            place(false);
        }).observe(box);
    }
}

// root の中にある details.slide すべてに効く(後から描き直した HTML にも効くよう、まとめて受け取る)
export function enableDetailsSlide(root = document) {
    root.addEventListener('click', e => {
        const summary = e.target.closest('details.slide > summary');
        if (!summary || reduced.matches) return;
        const details = summary.parentElement;
        const body = details.querySelector(':scope > .slide-body');
        if (!body || typeof body.animate !== 'function') return;
        e.preventDefault();
        const closing = running.has(details) ? running.get(details).effect.getKeyframes()[1].height !== '0px' : details.open;
        slide(details, body, !closing);
    });
}
