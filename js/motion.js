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
