// スコアデータの読み込み・保存(localStorage)

const STORAGE_KEY = 'arcaea_scores_v1';
// 埋め込み版(build_webapp.py)の頃のキー。新キーが空なら一度だけ引き継ぐ
const LEGACY_KEY = 'arcaea_dashboard_scores';

function isValidScores(scores) {
    return Array.isArray(scores) && scores.length > 0 && scores.every(s => s && s.song_id);
}

// 旧形式（スコア配列のみ）の all.json も受け付ける
export function normalizeData(raw) {
    const data = Array.isArray(raw) ? { scores: raw } : raw;
    return data && isValidScores(data.scores) ? { profile: data.profile || null, scores: data.scores } : null;
}

function isSameUser(a, b) {
    const codeA = a && a.user_code, codeB = b && b.user_code;
    return !codeA || !codeB || codeA === codeB;
}

// 一部の難易度だけの all.json でも消えないよう、保存済みデータに曲・難易度単位で上書きする
// 別ユーザーのデータは合体できないので null を返す
export function mergeData(saved, incoming) {
    if (!saved) return incoming;
    if (!isSameUser(saved.profile, incoming.profile)) return null;
    const keyOf = s => s.song_id + '_' + s.difficulty;
    const map = new Map(saved.scores.map(s => [keyOf(s), s]));
    incoming.scores.forEach(s => map.set(keyOf(s), s));
    return { profile: incoming.profile || saved.profile, scores: [...map.values()] };
}

export function saveData(data) {
    try {
        const savedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt, profile: data.profile, scores: data.scores }));
        return savedAt;
    } catch (err) {
        return null;
    }
}

function readKey(key) {
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        const data = normalizeData(saved);
        return data ? { ...data, savedAt: saved.savedAt } : null;
    } catch (err) {
        return null;
    }
}

export function loadSavedData() {
    const data = readKey(STORAGE_KEY);
    if (data) return data;

    const legacy = readKey(LEGACY_KEY);
    if (!legacy) return null;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: legacy.savedAt, profile: legacy.profile, scores: legacy.scores }));
        localStorage.removeItem(LEGACY_KEY);
    } catch (err) {
        // 書き込めなくても今回の表示には使える
    }
    return legacy;
}
