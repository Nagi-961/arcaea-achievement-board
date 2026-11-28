// スマホ幅で「画像を作る」を押したときのプレビュー(実績表・達成状況表・成長記録で共通)。
// 保存範囲(capture-area)をプレビューの中に移して表示し、閉じたら元の場所に戻す。
// 「全体」は画面幅に合わせて CSS の zoom で縮小する。保存するときは縮小を外して撮るので画像には影響しない
import { icon, iconLabel } from './icons.js';
import { exportImage } from './export.js';
import { shareImage } from './share.js';
import { isCoversOff, setCoversOff, coverToggleLabel } from './board.js';

let current = null; // { modal, area, width, home, next, zoom, onResize, onKey }

function applyZoom() {
    const { modal, area, width, zoom } = current;
    const stage = modal.querySelector('.pv-stage');
    if (zoom === 'fit') {
        const style = getComputedStyle(stage);
        const inner = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        area.style.zoom = String(Math.min(1, inner / width));
    } else {
        area.style.zoom = '';
    }
    modal.querySelectorAll('.pv-zoom .chip').forEach(b => b.classList.toggle('active', b.dataset.zoom === zoom));
    stage.classList.toggle('fit', zoom === 'fit');
}

export function closePreview() {
    if (!current) return;
    const { modal, area, home, next, onResize, onKey } = current;
    area.style.zoom = '';
    // 表示中にデータ更新で描き直された場合は、古い保存範囲は戻さず捨てる
    if (home.isConnected) home.insertBefore(area, next && next.parentNode === home ? next : null);
    modal.remove();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('pv-open');
    current = null;
}

export function openPreview(areaId, filename, label, profile) {
    closePreview();
    const area = document.getElementById(areaId);
    if (!area) return;

    const off = isCoversOff();
    // ジャケットのオン・オフは実績表(タイルのある表)のときだけ出す
    const hasCovers = area.classList.contains('capture-area');
    const modal = document.createElement('div');
    modal.className = 'pv-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '画像のプレビュー');
    modal.innerHTML = `
        <div class="pv-bar">
            <div class="pv-row">
                <button class="pv-close" type="button" aria-label="閉じる">${icon('close')}</button>
                <span class="pv-title"></span>
            </div>
            <div class="pv-row">
                <div class="chips pv-zoom">
                    <button class="chip" type="button" data-zoom="fit">全体</button>
                    <button class="chip" type="button" data-zoom="1">等倍</button>
                </div>
                ${hasCovers ? `<button class="btn-cover-toggle pv-cover" type="button" aria-pressed="${off}">${coverToggleLabel(off)}</button>` : ''}
            </div>
        </div>
        <div class="pv-stage"></div>
        <div class="pv-actions">
            <button class="btn-share pv-share" type="button">${iconLabel('share', '共有')}</button>
            <button class="btn-export pv-save" type="button">${iconLabel('camera', '保存')}</button>
        </div>`;
    modal.querySelector('.pv-title').textContent = label;

    current = {
        modal, area, home: area.parentNode, next: area.nextSibling, zoom: 'fit',
        onResize: () => { if (current && current.zoom === 'fit') applyZoom(); },
        onKey: e => { if (e.key === 'Escape') closePreview(); },
    };
    modal.querySelector('.pv-stage').appendChild(area);
    document.body.appendChild(modal);
    // 保存範囲の幅(実績表 1430px・達成状況表 / 成長記録 1080px)を測って、「全体」の縮小率に使う
    current.width = area.offsetWidth || 1080;
    document.body.classList.add('pv-open');
    applyZoom();
    window.addEventListener('resize', current.onResize);
    document.addEventListener('keydown', current.onKey);

    modal.addEventListener('click', async e => {
        if (e.target.closest('.pv-close')) { closePreview(); return; }
        if (e.target.closest('.pv-cover')) { setCoversOff(!isCoversOff()); return; }
        const zoomBtn = e.target.closest('.pv-zoom .chip');
        if (zoomBtn) {
            current.zoom = zoomBtn.dataset.zoom;
            applyZoom();
            return;
        }
        const save = e.target.closest('.pv-save, .pv-share');
        if (save && !save.classList.contains('busy')) {
            // 縮小したままだと画像も小さく撮れてしまうので、撮る間だけ等倍に戻す
            area.style.zoom = '';
            try {
                if (save.classList.contains('pv-share')) await shareImage(areaId, filename, label, save, profile);
                else await exportImage(areaId, filename, save, profile);
            } finally {
                if (current && current.area === area) applyZoom();
            }
        }
    });
}
