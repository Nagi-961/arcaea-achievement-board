// 表を画像として保存する(html2canvas は index.html で読み込み済み)

// 保存ファイル名の頭につける日付（261031 形式）。データ収集日を優先し、なければ今日の日付
function fileDatePrefix(profile) {
    const collected = new Date(profile ? profile.last_updated : NaN);
    const date = isNaN(collected) ? new Date() : collected;
    return [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
        .map(n => String(n).padStart(2, '0')).join('');
}

function showModal(imgSrc) {
    const modal = document.createElement('div');
    modal.className = 'export-modal';

    const msg = document.createElement('p');
    msg.textContent = "⬇️ 画像を長押しして「写真に追加」で保存 ⬇️";

    const img = document.createElement('img');
    img.src = imgSrc;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = "❌ 閉じる";
    closeBtn.addEventListener('click', () => modal.remove());

    modal.append(msg, img, closeBtn);
    document.body.appendChild(modal);
}

// 合体済みのスコアを all.json として書き出す（スマホは共有シート、だめならダウンロード）
export async function exportJson(data) {
    const out = { profile: data.profile, scores: data.scores };
    if (data.history) out.history = data.history;
    const text = JSON.stringify(out, null, 2);
    const filename = fileDatePrefix(data.profile) + '_all.json';
    const file = new File([text], filename, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportImage(areaId, filename, btn, profile) {
    const originalText = btn.textContent;
    btn.textContent = "⏳ 生成中...";
    btn.classList.add('busy');
    const element = document.getElementById(areaId);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    try {
        // 見出しの Web フォントが読み込み終わってから撮る
        await document.fonts.ready;
        const canvas = await html2canvas(element, { backgroundColor: '#0e0e24', scale: 2.5, useCORS: true });
        if (isIOS) {
            showModal(canvas.toDataURL('image/png'));
        } else {
            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = fileDatePrefix(profile) + '_' + filename;
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
        }
    } catch (err) {
        alert("画像生成中にエラーが発生しました。\n" + err);
    } finally {
        btn.textContent = originalText;
        btn.classList.remove('busy');
    }
}
