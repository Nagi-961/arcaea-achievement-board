// 成長記録用の履歴(localStorage)。all.json を読み込むたびに、自己ベストが変わった譜面と公式ポテンシャルを貯める
// 形式: { v, user_code, since, snapshots: [[収集時刻, rating]], charts: { "song_id_難易度番号": [[time_played, score, best_clear_type]] } }
// 時刻はすべてミリ秒。charts の各配列は時刻順

const HISTORY_KEY = 'arcaea_history_v1';

function emptyHistory(userCode) {
    return { v: 1, user_code: userCode || null, since: null, snapshots: [], charts: {} };
}

function isValidHistory(h) {
    return h && typeof h === 'object' && Array.isArray(h.snapshots) && h.charts && typeof h.charts === 'object';
}

export function loadHistory() {
    try {
        const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return isValidHistory(h) ? h : null;
    } catch {
        return null;
    }
}

function saveHistory(h) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
        return true;
    } catch {
        return false;
    }
}

// "2026/11/25 20:38:26" 形式。読めなければ null
export function parseCollectedAt(text) {
    if (!text) return null;
    const m = String(text).match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!m) return null;
    const [, y, mo, d, h = 0, mi = 0, s = 0] = m.map(Number);
    return new Date(y, mo - 1, d, h, mi, s).getTime();
}

// 同じ時刻・同じ内容の重複を除いて、時刻順に入れる
function insertEntry(list, entry) {
    if (list.some(e => e[0] === entry[0] && e[1] === entry[1] && e[2] === entry[2])) return;
    list.push(entry);
    list.sort((a, b) => a[0] - b[0]);
}

function insertSnapshot(snapshots, snap) {
    const i = snapshots.findIndex(s => s[0] === snap[0]);
    if (i >= 0) snapshots[i] = snap;
    else snapshots.push(snap);
    snapshots.sort((a, b) => a[0] - b[0]);
}

function startHistory(userCode) {
    const h = loadHistory();
    // 別のユーザーの履歴とは混ぜない
    if (!h || (userCode && h.user_code && h.user_code !== userCode)) return emptyHistory(userCode);
    if (!h.user_code && userCode) h.user_code = userCode;
    return h;
}

// 読み込んだ all.json の内容を履歴に足す。自己ベストが変わった譜面だけ記録が増える
export function recordHistory(data) {
    const userCode = data.profile && data.profile.user_code;
    const h = startHistory(userCode);
    const collectedAt = parseCollectedAt(data.profile && data.profile.last_updated) ?? Date.now();
    data.scores.forEach(s => {
        if (!(s.score > 0) || !Number.isFinite(s.time_played)) return;
        const key = s.song_id + '_' + s.difficulty;
        const list = h.charts[key] ??= [];
        const last = list[list.length - 1];
        const entry = [s.time_played, s.score, s.best_clear_type ?? s.clear_type ?? 0];
        // 最新の記録と同じなら増やさない
        if (last && last[1] === entry[1] && last[2] === entry[2]) return;
        insertEntry(list, entry);
    });
    const rating = data.profile && data.profile.rating;
    if (Number.isFinite(rating) && rating >= 0) insertSnapshot(h.snapshots, [collectedAt, rating]);
    h.since = h.since == null ? collectedAt : Math.min(h.since, collectedAt);
    saveHistory(h);
    return h;
}

// バックアップに含めていた履歴を、今の履歴に合体する
export function importHistory(incoming, userCode) {
    if (!isValidHistory(incoming)) return;
    if (userCode && incoming.user_code && incoming.user_code !== userCode) return;
    const h = startHistory(userCode || incoming.user_code);
    Object.entries(incoming.charts).forEach(([key, list]) => {
        if (!Array.isArray(list)) return;
        const target = h.charts[key] ??= [];
        list.forEach(e => {
            if (Array.isArray(e) && e.length >= 3 && e.every(Number.isFinite)) insertEntry(target, [e[0], e[1], e[2]]);
        });
    });
    incoming.snapshots.forEach(s => {
        if (Array.isArray(s) && s.length >= 2 && s.every(Number.isFinite)) insertSnapshot(h.snapshots, [s[0], s[1]]);
    });
    if (Number.isFinite(incoming.since)) h.since = h.since == null ? incoming.since : Math.min(h.since, incoming.since);
    saveHistory(h);
}
