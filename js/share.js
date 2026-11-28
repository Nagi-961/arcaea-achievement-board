// 画像の共有(X / Discord / LINE など)
// 画像を作ってから共有の画面を開き、そこで送り先を押してもらう。
// (ブラウザは「押した直後」でないと共有メニューや新しいタブを開かせないので、画像を作る待ち時間のあとに一度押してもらう)
import { icon, iconLabel } from './icons.js';
import { captureCanvas, downloadBlob, imageFilename } from './export.js';

export const SHARE_TAG = '#Arcaea_Dashboard';

// このサイトの URL(#import などは付けない)
function siteUrl() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
}

// 投稿の文。ハッシュタグは日本語もつながってしまうので、後ろに半角スペースを入れる
export function shareText(label) {
    return `${SHARE_TAG} で${label}を生成しました。\n${siteUrl()}`;
}

const isMobile = () => /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canCopyImage = () => Boolean(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);

async function copyImage(blob) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// スマホで、端末の共有メニューに画像ごと渡せるか。
// (X・Discord・LINE へは、これがいちばん確実に画像と文章の両方を渡せる。PC の共有メニューは送り先が少ないので使わない)
function canShareNative(file) {
    return isMobile() && Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
}

let openDialog = null;

function closeShare() {
    if (!openDialog) return;
    openDialog.modal.remove();
    URL.revokeObjectURL(openDialog.url);
    document.removeEventListener('keydown', openDialog.onKey);
    openDialog = null;
}

function openShare(blob, filename, label) {
    closeShare();
    const text = shareText(label);
    const file = new File([blob], filename, { type: 'image/png' });
    const nativeOk = canShareNative(file);
    const url = URL.createObjectURL(blob);
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '画像を共有');
    modal.innerHTML = `
        <div class="share-card">
            <div class="share-head">
                <span class="share-title">${iconLabel('share', '画像を共有')}</span>
                <button class="pv-close share-close" type="button" aria-label="閉じる">${icon('close')}</button>
            </div>
            <img class="share-thumb" alt="">
            <textarea class="share-text" readonly rows="3"></textarea>
            ${nativeOk ? `<button type="button" class="btn-summary-export share-native" data-act="native">${iconLabel('share', 'アプリを選んで共有(X・Discord・LINE など)')}</button>` : `
            <div class="share-opts">
                <button type="button" class="chip share-opt" data-act="x">X に投稿</button>
                ${canCopyImage() ? `<button type="button" class="chip share-opt" data-act="copy">${iconLabel('copy', '画像をコピー')}</button>` : ''}
                <button type="button" class="chip share-opt" data-act="text">${iconLabel('copy', '文章をコピー')}</button>
                <button type="button" class="chip share-opt" data-act="save">${iconLabel('download', '保存')}</button>
            </div>`}
            <p class="share-status" role="status"></p>
            ${nativeOk ? '' : `<p class="share-hint">${canCopyImage()
                ? 'Discord・LINE などは「画像をコピー」してから、チャット欄に貼り付けてください。'
                : '画像を添付するときは、先に「保存」してから各アプリで選んでください。'}</p>`}
        </div>`;
    modal.querySelector('.share-thumb').src = url;
    modal.querySelector('.share-text').value = text;
    const status = modal.querySelector('.share-status');
    const say = msg => { status.textContent = msg; };

    modal.addEventListener('click', async e => {
        if (e.target === modal || e.target.closest('.share-close')) { closeShare(); return; }
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        try {
            if (act === 'native') {
                await navigator.share({ files: [file], text });
            } else if (act === 'x') {
                // X は外から画像を添付できないので、画像をコピーしてから投稿画面を開き、貼り付けてもらう
                let copied = false;
                if (canCopyImage() && !isMobile()) {
                    try { await copyImage(blob); copied = true; } catch { /* コピーできなくても投稿画面は開く */ }
                }
                window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
                say(copied ? '画像をコピーしました。投稿画面で貼り付け(Ctrl+V)してください。'
                    : '投稿画面を開きました。画像は「保存」してから添付してください。');
            } else if (act === 'copy') {
                await copyImage(blob);
                say('画像をコピーしました。送りたいところで貼り付けてください。');
            } else if (act === 'text') {
                await navigator.clipboard.writeText(text);
                say('文章をコピーしました。');
            } else if (act === 'save') {
                downloadBlob(blob, filename);
            }
        } catch (err) {
            if (err && err.name === 'AbortError') return; // 共有メニューを閉じただけ
            say('うまくいきませんでした: ' + (err && err.message ? err.message : err));
        }
    });

    const onKey = e => { if (e.key === 'Escape') closeShare(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    openDialog = { modal, url, onKey };
    modal.querySelector(nativeOk ? '.share-native' : '.share-opt').focus();
}

// areaId の範囲を画像にして、共有の画面を開く。label は投稿の文の「〇〇を生成しました」に入る
export async function shareImage(areaId, filename, label, btn, profile) {
    if (btn.classList.contains('busy')) return;
    const originalHtml = btn.innerHTML;
    btn.textContent = '生成中...';
    btn.classList.add('busy');
    try {
        const canvas = await captureCanvas(areaId);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const name = imageFilename(filename, profile);
        // スマホはすぐ共有メニューを開く。画像を作る間に「押した直後」でなくなって断られたら、
        // 共有の画面を出して、もう一度押してもらう
        const file = new File([blob], name, { type: 'image/png' });
        if (canShareNative(file)) {
            try {
                await navigator.share({ files: [file], text: shareText(label) });
                return;
            } catch (err) {
                if (err && err.name === 'AbortError') return; // 共有メニューを閉じただけ
            }
        }
        openShare(blob, name, label);
    } catch (err) {
        alert('画像生成中にエラーが発生しました。\n' + err);
    } finally {
        btn.innerHTML = originalHtml;
        btn.classList.remove('busy');
    }
}

// PC幅の保存ボタンの隣に置く共有ボタン
export function shareButtonHtml(attrs = '') {
    return `<button type="button" class="btn-share" ${attrs}>${iconLabel('share', '共有')}</button>`;
}
