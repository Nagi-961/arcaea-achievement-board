// Arcaea のゲーム上の計算(スコア・ランク・ポテンシャル)をまとめる。
// 画面・保存の処理は持たず、数値を受け取って数値を返す関数だけを置く。どの機能から読み込んでもよい

// ランクの下限スコア(高い順)。これ未満は D
const GRADE_LINES = [
    ['EX+', 9900000],
    ['EX', 9800000],
    ['AA', 9500000],
    ['A', 9200000],
    ['B', 8900000],
    ['C', 8600000],
];

// スコアとクリア種別からランク。clear が 3(PURE MEMORY)なら PM
export function gradeOf(score, clear) {
    if (clear === 3) return 'PM';
    for (const [grade, line] of GRADE_LINES) {
        if (score >= line) return grade;
    }
    return 'D';
}

// 理論値(全ノーツ光った PURE)か。スコア = 10,000,000 + ノーツ数。ノーツ数が分からなければ false
export function isMaxScore(score, notes) {
    return notes > 0 && score >= 10000000 + notes;
}

// all.json の1レコードからランク。未プレイは NO PLAY、PM のうち理論値なら MAX
export function gradeOfRecord(rec) {
    const score = rec ? rec.score || 0 : 0;
    if (score <= 0) return 'NO PLAY';
    if (rec.clear_type === 3) {
        const totalNotes = (rec.perfect_count || 0) + (rec.near_count || 0) + (rec.miss_count || 0);
        return isMaxScore(score, totalNotes) ? 'MAX' : 'PM';
    }
    return gradeOf(score, null);
}

// 単曲ポテンシャル。クリアしていれば(クリア種別が 0 以外) +0.2
export function playPotential(constant, score, clear) {
    let pot;
    if (score >= 10000000) pot = constant + 2.0;
    else if (score >= 9800000) pot = constant + 1.0 + (score - 9800000) / 200000;
    else pot = Math.max(0, constant + (score - 9500000) / 300000);
    return pot + (clear ? 0.2 : 0);
}

// スコア = floor(10,000,000 × (2×PURE + FAR) / (2×ノーツ数)) + 光った PURE の数
// 内部精度の失点 = 光らなかった PURE の数（FAR / LOST になったノーツは最初から光らない）
export function calcScore(notes, far, lost, loss) {
    const pure = notes - far - lost;
    return Math.floor(10000000 * (2 * pure + far) / (2 * notes)) + Math.max(0, pure - loss);
}

const sum = list => list.reduce((a, b) => a + b, 0);
const topOf = (pots, n) => pots.slice().sort((a, b) => b - a).slice(0, n);

// ベスト30平均: 単曲ポテンシャル上位30の単純平均。30譜面に満たなければある分で割る。記録がなければ null
export function best30Average(pots) {
    const top = topOf(pots, 30);
    return top.length > 0 ? sum(top) / top.length : null;
}

// 旧基準のポテンシャル(最大): 旧方式は (ベスト30の合計 + リセント10の合計) ÷ 40。
// リセント枠をベスト上位10で置き換えた、その時点で到達できる最大値。
// pots は旧方式の単曲ポテンシャル(クリアボーナスなし = playPotential(定数, スコア, false))を渡す。
// 30譜面に満たなくても、ゲームと同じく ÷40 のまま。記録がなければ null
export function oldMaxPotential(pots) {
    if (pots.length === 0) return null;
    const top = topOf(pots, 30);
    return (sum(top) + sum(top.slice(0, 10))) / 40;
}
