// Arcaea Online のページ上で実行して、スコアを all.json として保存するスクリプト
// ブックマークレットから collect.js?d=<モード>&inc=1 の形で読み込む（d がなければ従来どおり FTR/BYD/ETR）
// inc=1 なら増分取得: 前回分と同じ記録が出てきたところでページ送りをやめる（新しく更新した順に並んでいるため）
(async function () {
    const MODES = {
        std: { label: 'FTR・BYD・ETR', diffs: [2, 3, 4] },
        all: { label: '全難易度', diffs: [0, 1, 2, 3, 4] },
        0: { label: 'PST', diffs: [0] },
        1: { label: 'PRS', diffs: [1] },
        2: { label: 'FTR', diffs: [2] },
        3: { label: 'BYD/INS', diffs: [3] },
        4: { label: 'ETR', diffs: [4] },
    };
    const DIFF_NAMES = ['PST', 'PRS', 'FTR', 'BYD/INS', 'ETR'];
    // 前回までの取得分（Arcaea Online 側のブラウザに保存）。一部の難易度だけ取ってもこれと合体させる
    const BACKUP_KEY = 'arcaea_collect_backup_v1';
    const API = 'https://webapi.lowiro.com/webapi';

    const scriptSrc = document.currentScript ? document.currentScript.src : '';
    const params = new URLSearchParams(scriptSrc.split('?')[1] || '');
    const modeKey = params.get('d') || 'std';
    const mode = MODES[modeKey] || MODES.std;
    const incremental = params.get('inc') === '1';
    // データを送る先（collect.js を置いているサイト）
    const SITE_URL = scriptSrc ? new URL('./', scriptSrc).href : '';
    const SITE_ORIGIN = scriptSrc ? new URL(scriptSrc).origin : '';
    const modeLabel = mode.label + (incremental ? '・増分' : '');

    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:rgba(10,10,30,0.92);color:#ecebff;z-index:99999;padding:20px;font-size:16px;line-height:1.6;text-align:center;box-sizing:border-box;font-weight:bold;font-family:sans-serif;';
    div.innerText = `Arcaeaのデータを取得中...（${modeLabel}）\nそのまま画面を閉じずにお待ちください`;
    document.body.appendChild(div);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const keyOf = s => s.song_id + '_' + s.difficulty;

    function loadBackup() {
        try {
            const saved = JSON.parse(localStorage.getItem(BACKUP_KEY));
            return saved && Array.isArray(saved.scores) ? saved : null;
        } catch (e) {
            return null;
        }
    }

    function saveBackup(data) {
        try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    // 同じ曲・難易度は今回取得した方で上書きする
    function mergeScores(oldScores, newScores) {
        const map = new Map(oldScores.map(s => [keyOf(s), s]));
        newScores.forEach(s => map.set(keyOf(s), s));
        return [...map.values()];
    }

    function extractRecords(json) {
        if (json && json.value && Array.isArray(json.value.scores)) return json.value.scores;
        if (Array.isArray(json)) return json;
        if (json && json.value && Array.isArray(json.value)) return json.value;
        if (json && json.data && Array.isArray(json.data)) return json.data;
        return [];
    }

    // primary: いちばん押してほしいボタン(サイトに送る)を目立たせる
    function addButton(label, fn, primary) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'margin:6px;padding:10px 20px;font-size:16px;font-weight:bold;border-radius:999px;cursor:pointer;'
            + (primary ? 'background:linear-gradient(120deg,#4fd8ff,#8f7bff 55%,#d27bff);color:#fff;border:none;'
                : 'background:rgba(255,255,255,0.08);color:#ecebff;border:1px solid rgba(140,150,255,0.4);');
        b.addEventListener('click', fn);
        div.appendChild(b);
    }

    try {
        const profile = { name: 'Unknown', user_code: '', rating: 0, last_updated: new Date().toLocaleString('ja-JP') };
        div.innerText = 'プロフィール情報を取得中...';
        try {
            const meRes = await fetch(`${API}/user/me`, { credentials: 'include' });
            if (meRes.ok) {
                const user = (await meRes.json()).value || {};
                profile.name = user.name || 'Unknown';
                profile.user_code = user.user_code || '';
                profile.rating = user.rating || 0;
            }
        } catch (e) {
            console.warn(e);
        }

        // 別のアカウントの前回分とは合体しない
        const backup = loadBackup();
        const sameUser = backup && (!backup.profile || !profile.user_code || backup.profile.user_code === profile.user_code);
        const known = new Map(sameUser ? backup.scores.map(s => [keyOf(s), s]) : []);
        const isUnchanged = r => {
            const old = known.get(keyOf(r));
            return old && old.score === r.score && old.time_played === r.time_played;
        };

        const fetched = [];
        let pages = 0, fullDiffs = 0;
        for (const diff of mode.diffs) {
            // 増分は、前回この難易度を取っているときだけ。なければ全件取る
            let canStop = incremental && backup && sameUser && backup.scores.some(s => s.difficulty === diff);
            if (!canStop) fullDiffs++;
            let lastTime = Infinity;
            for (let page = 1; ; page++) {
                div.innerText = `取得中...（${modeLabel}）\n(難易度: ${DIFF_NAMES[diff]}, ページ: ${page})`;
                await sleep(1000);
                const res = await fetch(`${API}/score/song/me/all?difficulty=${diff}&page=${page}&sort=date&term=`, { credentials: 'include' });
                if (!res.ok) break;
                const records = extractRecords(await res.json());
                if (records.length === 0) break;
                pages++;
                fetched.push(...records);
                if (!canStop) continue;
                // 新しい順に並んでいなければ、途中でやめると取りこぼすので全件取りに切り替える
                const times = records.map(r => r.time_played);
                const descending = times.every(t => Number.isFinite(t) && t <= lastTime) && times.every((t, i) => i === 0 || t <= times[i - 1]);
                lastTime = times[times.length - 1];
                if (!descending) { canStop = false; fullDiffs++; continue; }
                // 前回と同じ記録が出てきたら、ここから先は前回から変わっていない
                if (records.some(isUnchanged)) break;
            }
        }

        if (fetched.length === 0) {
            div.innerText = 'データが取得できませんでした。\nログイン状態を確認してください。';
            setTimeout(() => div.remove(), 4000);
            return;
        }

        const updatedCount = fetched.filter(r => !isUnchanged(r)).length;
        const scores = sameUser ? mergeScores(backup.scores, fetched) : fetched;
        const data = { profile, scores };
        const backupSaved = saveBackup(data);
        const text = JSON.stringify(data, null, 2);

        const counts = DIFF_NAMES.map((name, d) => {
            const n = scores.filter(s => s.difficulty === d).length;
            return n > 0 ? `${name}: ${n}` : null;
        }).filter(Boolean).join(' / ');
        const rating = profile.rating > 0 ? (profile.rating / 1000).toFixed(3) : '---';
        div.innerText = `取得完了（${modeLabel}: ${pages}ページ・${fetched.length}件）\n`
            + (sameUser ? `前回から更新された譜面: ${updatedCount}件\n` : '')
            + (incremental && fullDiffs > 0 ? '（前回分がない難易度などは全件取得しました）\n' : '')
            + `${sameUser ? '前回までの分と合体しました' : '新しく保存しました'}（合計 ${scores.length}件）\n`
            + `${counts}\n`
            + `${profile.name} (Rate: ${rating})\n`
            + `最終更新: ${profile.last_updated}\n`
            + (backupSaved ? '' : '※ このブラウザに前回分を保存できませんでした\n')
            + '\n「サイトに送る」でそのまま読み込めます（ファイル保存も可）\n';

        // サイトを新しいタブで開き、準備ができた合図(arcaea-ready)が来たらデータを渡す
        addButton('サイトに送る', () => {
            if (!SITE_URL) { alert('送り先のサイトが分かりませんでした。保存ボタンを使ってください。'); return; }
            const win = window.open(SITE_URL + '#import', '_blank');
            if (!win) { alert('新しいタブを開けませんでした。ポップアップの許可を確認するか、保存ボタンを使ってください。'); return; }
            const onMessage = e => {
                if (e.source !== win || e.origin !== SITE_ORIGIN || !e.data) return;
                if (e.data.type === 'arcaea-ready') {
                    win.postMessage({ type: 'arcaea-data', data }, SITE_ORIGIN);
                } else if (e.data.type === 'arcaea-received') {
                    window.removeEventListener('message', onMessage);
                    const note = document.createElement('div');
                    note.style.cssText = 'color:#7fff7f;margin-bottom:8px;';
                    note.textContent = 'サイトに送りました。開いたタブで確認してください。';
                    div.prepend(note);
                }
            };
            window.addEventListener('message', onMessage);
        }, true);
        addButton('保存', async () => {
            const file = new File([text], 'all.json', { type: 'text/plain' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file] });
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
            }
            try {
                const blob = new Blob([text], { type: 'application/octet-stream' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'all.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (e) {
                alert('保存失敗: ' + e.name + ' ' + e.message);
            }
        });
        addButton('コピー', async () => {
            try {
                await navigator.clipboard.writeText(text);
                alert('コピーしました');
            } catch (e) {
                alert('コピー失敗: ' + e.message);
            }
        });
        addButton('閉じる', () => div.remove());
    } catch (e) {
        div.innerText = 'エラーが発生しました: ' + e.message;
        setTimeout(() => div.remove(), 5000);
    }
})();
