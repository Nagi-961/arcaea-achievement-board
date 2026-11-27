// 成長記録: 日・週・月・年ごとに、自己ベストを更新した譜面と、ポテンシャル・PM数・EX+数の推移をまとめる
// PC幅では保存用のレポートをそのまま見せる。スマホ幅では数値のリスト(タップでその推移のグラフ)と
// 更新した譜面のリストを見せ、保存は「画像を作る」のプレビュー(preview.js)から行う
import { icon, iconLabel, crownMark } from '../icons.js';
import { openPreview } from '../preview.js';
import { escapeHtml, diffColors, profileHtml, handleCoverError, compareTitle, coverSrc } from '../board.js';
import { exportImage } from '../export.js';
import { loadHistory } from '../history.js';
import { playPotential, gradeOf, isMaxScore, best30Average, oldMaxPotential } from '../calc.js';

const AREA_ID = 'growth-area';
const RECORDS_AREA_ID = 'growth-records-area';
const DIFF_NUM = { PST: 0, PRS: 1, FTR: 2, BYD: 3, INS: 3, ETR: 4 };
const UNITS = [
    { key: 'day', label: '日' },
    { key: 'week', label: '週' },
    { key: 'month', label: '月' },
    { key: 'year', label: '年' },
];
const SORTS = [
    { key: 'pot', label: '単曲ポテンシャル順' },
    { key: 'potUp', label: 'ポテンシャル上昇順' },
    { key: 'scoreUp', label: 'スコア上昇順' },
];
const TREND_BUCKETS = { day: 8, week: 8, month: 8, year: 5 };
const LIST_LIMIT = 30;

const state = { unit: 'week', offset: 0, sort: 'pot' };
// スマホ幅で開いている数値(グラフ)。描き直しても開いたままにする
const openStats = new Set();
let songs = [];
let profile = null;
let view = null;

// ---- 計算 ----
// offset 0 が今日を含む期間、-1 がその1つ前
function periodRange(unit, offset) {
    const now = new Date();
    let start;
    if (unit === 'day') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    else if (unit === 'week') {
        const monday = now.getDate() - ((now.getDay() + 6) % 7);
        start = new Date(now.getFullYear(), now.getMonth(), monday + offset * 7);
    } else if (unit === 'month') start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    else start = new Date(now.getFullYear() + offset, 0, 1);

    const end = new Date(start);
    if (unit === 'day') end.setDate(end.getDate() + 1);
    else if (unit === 'week') end.setDate(end.getDate() + 7);
    else if (unit === 'month') end.setMonth(end.getMonth() + 1);
    else end.setFullYear(end.getFullYear() + 1);
    return { start: start.getTime(), end: end.getTime(), startDate: start, endDate: new Date(end.getTime() - 1) };
}

const ymd = d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
const md = d => `${d.getMonth() + 1}/${d.getDate()}`;

function periodLabel(unit, r) {
    if (unit === 'day') return ymd(r.startDate);
    if (unit === 'week') return `${ymd(r.startDate)}〜${md(r.endDate)}`;
    if (unit === 'month') return `${r.startDate.getFullYear()}年${r.startDate.getMonth() + 1}月`;
    return `${r.startDate.getFullYear()}年`;
}

function shortLabel(unit, r) {
    if (unit === 'day' || unit === 'week') return md(r.startDate);
    if (unit === 'month') return `${r.startDate.getMonth() + 1}月`;
    return String(r.startDate.getFullYear());
}

// 譜面ごとの記録 [[時刻, スコア, クリア]]。履歴がなければ今の自己ベスト1件だけ
function entriesOf(song, history) {
    const list = history && history.charts[song.song_id + '_' + DIFF_NUM[song.difficulty]];
    if (list && list.length > 0) return list;
    const r = song.record;
    return r && Number.isFinite(r.time_played) ? [[r.time_played, r.score, r.clear]] : [];
}

// 時刻 t より前(t を含まない)の最新の記録
function entryBefore(entries, t) {
    let found = null;
    for (const e of entries) {
        if (e[0] < t) found = e;
        else break;
    }
    return found;
}

// 譜面のノーツ数。マスタになければ今の記録の PURE + FAR + LOST から求める(理論値の判定に使う)
function notesOf(song) {
    if (song.notes) return song.notes;
    const r = song.record;
    return r ? r.pure + r.far + r.lost : null;
}

function statsAt(charts, t) {
    let max = 0, pm = 0, exPlus = 0;
    const pots = [], oldPots = [];
    charts.forEach(c => {
        const e = entryBefore(c.entries, t);
        if (!e) return;
        if (e[2] === 3) pm++;
        if (e[2] === 3 && isMaxScore(e[1], c.notes)) max++;
        if (e[1] >= 9900000) exPlus++;
        pots.push(playPotential(c.song.constant, e[1], e[2]));
        // 旧方式の単曲ポテンシャルにはクリアボーナスがない
        oldPots.push(playPotential(c.song.constant, e[1], false));
    });
    return { max, pm, exPlus, b30: best30Average(pots), oldMax: oldMaxPotential(oldPots) };
}

function ratingAt(history, t) {
    if (!history) return null;
    let found = null;
    for (const s of history.snapshots) {
        if (s[0] < t) found = s[1];
        else break;
    }
    return found;
}

// ---- 表示 ----
const fmt = n => n.toLocaleString('ja-JP');
const fmtPot = v => v == null ? '--' : v.toFixed(3);
const fmtRating = v => v == null ? '--' : (v / 1000).toFixed(3);

function deltaHtml(value, digits = 0, unit = '') {
    if (value == null || Number.isNaN(value)) return '';
    const rounded = Number(value.toFixed(digits));
    if (rounded === 0) return `<span class="gr-delta zero">±0${unit}</span>`;
    const body = digits === 0 ? fmt(Math.abs(rounded)) : Math.abs(rounded).toFixed(digits);
    const text = (rounded > 0 ? '+' : '−') + body + unit;
    return `<span class="gr-delta ${rounded > 0 ? 'up' : 'down'}">${text}</span>`;
}

// グラフの色。SVG は画像に撮るとき CSS 変数やクラスの色が効かないので、描くときに今のテーマの値を読んで直接書く
function chartColors() {
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    return { line: v('--chart-line'), dot: v('--chart-dot'), grid: v('--chart-grid'), axis: v('--text-muted') };
}

// 推移のグラフ(SVG)。kind: 'area' = その時点の値を線+薄い面で / 'bar' = 期間ごとの増えた数を棒で。データがなければ空文字
// 各期間に縦長の当たり判定(.gr-hit)を置き、タップ・ホバーで数値のフキダシを出す(フキダシは保存範囲の外に出すので画像には写らない)
// points: [{ label, v, tip }]。tip はフキダシの2行目(値と増減)
function sparkSvg(label, points, kind, c) {
    const W = 240, H = 90, PADX = 12, TOP = 10, BOTTOM = 20;
    const vals = points.map(p => p.v).filter(v => v != null);
    if (vals.length === 0) return '';
    const base = H - BOTTOM;
    const step = (W - PADX * 2) / points.length;
    const cx = i => PADX + step * (i + 0.5);
    let bodies;
    if (kind === 'bar') {
        // 0 から積む。増えていない期間は細い線だけ
        const max = Math.max(1, ...vals);
        const bw = Math.min(16, step * 0.56);
        bodies = points.map((p, i) => {
            if (p.v == null) return '';
            const h = Math.max(1.5, (base - TOP) * p.v / max);
            return `<rect x="${(cx(i) - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c.line}" fill-opacity="${p.v > 0 ? (i === points.length - 1 ? 1 : 0.7) : 0.3}"/>`;
        }).join('');
    } else {
        let min = Math.min(...vals), max = Math.max(...vals);
        if (min === max) { min -= 1; max += 1; }
        // 下に少し余白を取り、面が底に張り付かないようにする
        const pad = (max - min) * 0.15;
        const y = v => TOP + (base - TOP) * (1 - (v - min + pad) / (max - min + pad));
        const pts = points.map((p, i) => p.v == null ? null : [cx(i), y(p.v)]);
        const segs = [];
        let cur = [];
        pts.forEach(pt => { if (pt) cur.push(pt); else if (cur.length) { segs.push(cur); cur = []; } });
        if (cur.length) segs.push(cur);
        const line = segs.map(seg => 'M' + seg.map(([x1, y1]) => `${x1.toFixed(1)},${y1.toFixed(1)}`).join('L')).join('');
        const area = segs.map(seg => `M${seg[0][0].toFixed(1)},${base}L` + seg.map(([x1, y1]) => `${x1.toFixed(1)},${y1.toFixed(1)}`).join('L') + `L${seg[seg.length - 1][0].toFixed(1)},${base}Z`).join('');
        const lastPt = pts[pts.length - 1];
        bodies = `<path d="${area}" fill="${c.line}" fill-opacity="0.16"/>
            <path d="${line}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${lastPt ? `<circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="3.5" fill="${c.line}" stroke="${c.dot}" stroke-width="1.5"/>` : ''}`;
    }
    const last = points.length - 1;
    const labels = [0, last].map(i => `<text x="${i === 0 ? PADX : W - PADX}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : 'end'}" class="gr-axis" fill="${c.axis}">${escapeHtml(points[i].label)}</text>`).join('');
    // 当たり判定とガイド線(ガイド線はふだん透明で、選んだ期間だけ CSS で見せる)
    const hits = points.map((p, i) => `<g class="gr-hit" data-title="${escapeHtml(p.label)}" data-tip="${escapeHtml(p.tip || '')}">
            <line class="gr-guide" x1="${cx(i).toFixed(1)}" x2="${cx(i).toFixed(1)}" y1="${TOP - 4}" y2="${base}" stroke="${c.axis}" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0"/>
            <rect x="${(PADX + step * i).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"/>
        </g>`).join('');
    return `<svg class="gr-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeHtml(label)}の推移">
            <line x1="${PADX}" x2="${W - PADX}" y1="${base}" y2="${base}" stroke="${c.grid}" stroke-width="1"/>
            ${bodies}${labels}${hits}
        </svg>`;
}

const signed = (v, digits) => {
    const r = Number(v.toFixed(digits));
    if (r === 0) return '±0';
    return (r > 0 ? '+' : '−') + (digits === 0 ? fmt(Math.abs(r)) : Math.abs(r).toFixed(digits));
};

// 面グラフの点: その時の値と、前の期間からの増減
function areaPoints(buckets, key, format, scale = 1) {
    return buckets.slice(1).map((b, i) => {
        const v = b[key], prev = buckets[i][key];
        const delta = v != null && prev != null ? `（${signed((v - prev) / scale, 3)}）` : '';
        return { label: b.label, v, tip: v == null ? 'データなし' : `${format(v)}${delta}` };
    });
}

// 棒グラフの点: その期間に増えた数と、期間の終わりの合計
function barPoints(buckets, key) {
    return buckets.slice(1).map((b, i) => {
        const v = b[key], prev = buckets[i][key];
        const inc = v != null && prev != null ? Math.max(0, v - prev) : null;
        return { label: b.label, v: inc, tip: inc == null ? 'データなし' : `${signed(inc, 0)}（合計 ${fmt(v)}）` };
    });
}

// 数値カード(推移のグラフ入り)
function statCard(st) {
    return `<div class="gr-card">
            <div class="gr-card-head"><span class="gr-stat-label">${st.crown ? crownMark() : ''}${st.label}</span>${st.delta || ''}</div>
            <div class="gr-stat-value">${st.value}</div>
            ${st.chart || '<div class="gr-chart-empty">データなし</div>'}
        </div>`;
}

function gradeOfRow(row) {
    const g = gradeOf(row.now[1], row.now[2]);
    return g === 'PM' && isMaxScore(row.now[1], row.notes) ? 'MAX' : g;
}

function deltasOf(row) {
    if (row.prev) return { score: deltaHtml(row.now[1] - row.prev[1]), pot: deltaHtml(row.potNow - row.potPrev, 3) };
    if (row.isNew) return { score: '<span class="gr-delta new">NEW</span>', pot: '' };
    return { score: '<span class="gr-delta zero">前回不明</span>', pot: '' };
}

// ---- 更新した譜面の画像: ランクの境目のレーンに、前回 → 今回の伸びを描く ----
// レーンの目盛り(ランクの境目)。pos はレーン上の位置(0〜1)。上位ほど差が見えるよう、AA 未満は詰めて AA・EX・EX+ を同じ幅にする
const LANE_STOPS = [
    { score: 8000000, pos: 0 },
    { score: 9500000, pos: 0.12, label: 'AA', grade: 'AA' },
    { score: 9800000, pos: 0.38, label: 'EX', grade: 'EX' },
    { score: 9900000, pos: 0.64, label: 'EX+', grade: 'EXp' },
    { score: 10000000, pos: 0.9, label: 'PM', grade: 'PM' },
    { score: 10002500, pos: 1 },
];

function lanePos(score) {
    if (score <= LANE_STOPS[0].score) return 0;
    for (let i = 1; i < LANE_STOPS.length; i++) {
        const a = LANE_STOPS[i - 1], b = LANE_STOPS[i];
        if (score <= b.score) return a.pos + (b.pos - a.pos) * (score - a.score) / (b.score - a.score);
    }
    return 1;
}

const pctOf = v => `${(v * 100).toFixed(2)}%`;
const TICKS = LANE_STOPS.filter(t => t.label).map(t => `<i class="lane-tick" style="left:${pctOf(t.pos)}"></i>`).join('');

function laneHtml(row, grade) {
    const now = lanePos(row.now[1]);
    const prev = row.prev ? lanePos(row.prev[1]) : null;
    const gain = prev != null && now > prev
        ? `<span class="lane-gain" style="left:${pctOf(prev)};width:${pctOf(now - prev)}"></span>` : '';
    return `<div class="lane">${TICKS}${gain}
            ${prev != null ? `<span class="lane-dot prev" style="left:${pctOf(prev)}"></span>` : ''}
            <span class="lane-dot now g-${grade.replace('+', 'p')}" style="left:${pctOf(now)}"></span>
        </div>`;
}

// 各列の先頭に1回だけ出す目盛りの名前
function laneScaleHtml() {
    return `<div class="rl-scale"><div class="lane-labels">${LANE_STOPS.filter(t => t.label)
        .map(t => `<span class="g-${t.grade}" style="left:${pctOf(t.pos)}">${t.label}</span>`).join('')}</div></div>`;
}

function recordRowHtml(row) {
    const s = row.song;
    const grade = gradeOfRow(row);
    const d = deltasOf(row);
    const color = diffColors[s.difficulty] || 'var(--tile-border)';
    const scores = row.prev
        ? `<span class="rl-prev">${fmt(row.prev[1])}</span><span class="rl-arrow">›</span><b>${fmt(row.now[1])}</b>`
        : `<b>${fmt(row.now[1])}</b>`;
    return `<div class="rl-row">
            <div class="rl-jacket">
                <img class="jacket" src="${coverSrc(s.song_id, s.difficulty)}" alt="" data-song-id="${escapeHtml(s.song_id)}">
                ${grade === 'MAX' ? `<span class="tile-crown">${crownMark()}</span>` : ''}
            </div>
            <div class="rl-main">
                <div class="rl-head">
                    <span class="rl-diff" style="background:${color};"><span>${s.difficulty} ${s.constant.toFixed(1)}</span></span>
                    <span class="rl-title">${escapeHtml(s.title)}</span>
                </div>
                ${laneHtml(row, grade)}
                <div class="rl-scores">${scores}<span class="rl-pot">pot ${row.potNow.toFixed(3)}</span></div>
            </div>
            <div class="rl-side">
                <span class="rl-grade gr-g-${grade.replace('+', 'p')}">${grade}</span>
                <span class="rl-delta">${d.score}</span>
                <span class="rl-delta">${d.pot}</span>
            </div>
        </div>`;
}

// 2列に分けて、左の列の上から順に並べる
function recordListHtml(shown) {
    const half = Math.ceil(shown.length / 2);
    const col = list => `<div class="rl-col">${laneScaleHtml()}${list.map(recordRowHtml).join('')}</div>`;
    return `<div class="rl-cols">${col(shown.slice(0, half))}${shown.length > half ? col(shown.slice(half)) : ''}</div>`;
}

// ---- スマホ幅 ----
// 数値1つ = 1行。タップで下にその推移のグラフを開く
function mobileStatHtml(st) {
    return `<details class="gm-stat slide" data-key="${st.key}"${openStats.has(st.key) ? ' open' : ''}>
            <summary><span class="gm-label">${st.crown ? icon('crown', 'crown-ico') : ''}${st.label}</span><span class="gm-value">${st.value}</span><span class="gm-delta">${st.delta || ''}</span>${icon('chevron', 'gm-chev')}</summary>
            <div class="slide-body"><div class="gm-chart">${st.chart || '<div class="gr-chart-empty">データなし</div>'}</div></div>
        </details>`;
}

function mobileSongHtml(row) {
    const s = row.song;
    const grade = gradeOfRow(row);
    const d = deltasOf(row);
    return `<div class="gm-song">
            <img class="jacket gm-jacket diff-${s.difficulty}" src="${coverSrc(s.song_id, s.difficulty)}" alt="" loading="lazy" data-song-id="${escapeHtml(s.song_id)}" style="border-color:${diffColors[s.difficulty] || 'var(--tile-border)'};">
            <div class="gm-main">
                <div class="gm-title">${escapeHtml(s.title)}</div>
                <div class="gm-meta"><span class="tg-diff" style="background:${diffColors[s.difficulty] || 'var(--tile-border)'};">${s.difficulty}</span> Lv ${escapeHtml(s.level)}
                    <span class="gm-pot">pot ${row.potNow.toFixed(3)} ${d.pot}</span></div>
            </div>
            <div class="gm-right">
                <span class="gr-g-${grade.replace('+', 'p')} gm-grade">${grade === 'MAX' ? icon('crown', 'crown-ico') : ''}${grade}</span>
                <span class="gm-score">${fmt(row.now[1])}</span>
                ${d.score}
            </div>
        </div>`;
}

function groupsHtml(groups, cardFn) {
    return groups.map(g => `<section class="gr-group"><h3 class="gr-group-title">${g.title}</h3><div class="gr-cards">${g.stats.map(cardFn).join('')}</div></section>`).join('');
}

function render() {
    hideTip();
    view.querySelectorAll('[data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === state.unit));
    view.querySelectorAll('[data-sort]').forEach(b => b.classList.toggle('active', b.dataset.sort === state.sort));
    view.querySelector('[data-step="1"]').disabled = state.offset >= 0;
    const range = periodRange(state.unit, state.offset);
    view.querySelector('.gr-period').textContent = periodLabel(state.unit, range);

    const out = view.querySelector('.gr-output');
    if (songs.length === 0) {
        out.innerHTML = '<p class="summary-empty">all.json を読み込むと表示されます。</p>';
        return;
    }
    const history = loadHistory();
    const charts = songs.map(song => ({ song, notes: notesOf(song), entries: entriesOf(song, history) })).filter(c => c.entries.length > 0);

    // 期間内に自己ベストを更新した譜面
    const since = history && history.since;
    const rows = [];
    charts.forEach(c => {
        const inPeriod = c.entries.filter(e => e[0] >= range.start && e[0] < range.end);
        if (inPeriod.length === 0) return;
        const now = inPeriod[inPeriod.length - 1];
        const prev = entryBefore(c.entries, range.start);
        const potNow = playPotential(c.song.constant, now[1], now[2]);
        rows.push({
            song: c.song, notes: c.notes, now, prev, potNow,
            potPrev: prev ? playPotential(c.song.constant, prev[1], prev[2]) : null,
            // 履歴を取り始めた後に初めて記録が出た譜面は、初プレイと分かる
            isNew: !prev && since != null && since <= range.start,
        });
    });
    const up = (a, b) => (a == null ? -Infinity : a) - (b == null ? -Infinity : b);
    const sorters = {
        pot: (a, b) => b.potNow - a.potNow,
        potUp: (a, b) => up(b.prev ? b.potNow - b.potPrev : null, a.prev ? a.potNow - a.potPrev : null) || b.potNow - a.potNow,
        scoreUp: (a, b) => up(b.prev ? b.now[1] - b.prev[1] : null, a.prev ? a.now[1] - a.prev[1] : null) || b.potNow - a.potNow,
    };
    rows.sort((a, b) => sorters[state.sort](a, b) || compareTitle(a.song, b.song));

    // 期間の始めと終わりの比較
    const startStats = statsAt(charts, range.start);
    const endStats = statsAt(charts, Math.min(range.end, Date.now() + 1));
    const ratingEnd = ratingAt(history, range.end), ratingStart = ratingAt(history, range.start);
    const ratingDelta = ratingEnd != null && ratingStart != null ? (ratingEnd - ratingStart) / 1000 : null;
    const diff = key => endStats[key] != null && startStats[key] != null ? endStats[key] - startStats[key] : null;

    // 推移(選んだ期間を最後に、同じ単位でさかのぼる)
    const n = TREND_BUCKETS[state.unit];
    const buckets = [];
    // 先頭は比較用(1つ前の期間)。グラフには出さない
    for (let k = n; k >= 0; k--) {
        const r = periodRange(state.unit, state.offset - k);
        const s = statsAt(charts, Math.min(r.end, Date.now() + 1));
        buckets.push({ label: shortLabel(state.unit, r), ...s, rating: ratingAt(history, r.end) });
    }
    const colors = chartColors();
    // ポテンシャル系は「今の高さ」なので面、達成数は「期間ごとに増えた数」なので棒
    const area = (key, label, value, delta, format, scale) =>
        ({ key, label, value, delta, chart: sparkSvg(label, areaPoints(buckets, key, format, scale), 'area', colors) });
    const bar = (key, label, value, delta, crown) =>
        ({ key, label, value, delta, crown, chart: sparkSvg(label, barPoints(buckets, key), 'bar', colors) });

    // 「ポテンシャル(プロフィール系)」と「達成数」の2つにまとめる
    const groups = [
        { title: 'ポテンシャル', stats: [
            area('rating', 'ポテンシャル', fmtRating(ratingEnd), deltaHtml(ratingDelta, 3), fmtRating, 1000),
            area('b30', 'ベスト30平均', fmtPot(endStats.b30), deltaHtml(diff('b30'), 3), fmtPot),
            area('oldMax', '旧基準（最大）', fmtPot(endStats.oldMax), deltaHtml(diff('oldMax'), 3), fmtPot),
        ] },
        { title: '達成数', stats: [
            bar('max', 'MAX', fmt(endStats.max), deltaHtml(endStats.max - startStats.max), true),
            bar('pm', 'PM', fmt(endStats.pm), deltaHtml(endStats.pm - startStats.pm)),
            bar('exPlus', 'EX+ 以上', fmt(endStats.exPlus), deltaHtml(endStats.exPlus - startStats.exPlus)),
        ] },
    ];

    const shown = rows.slice(0, LIST_LIMIT);
    const sortLabel = SORTS.find(s => s.key === state.sort).label;
    const periodText = `${escapeHtml(periodLabel(state.unit, range))}　${UNITS.find(u => u.key === state.unit).label}間`;
    const more = rows.length > shown.length ? `<p class="gr-more">ほか ${rows.length - shown.length} 譜面</p>` : '';
    const noRows = '<p class="summary-empty">この期間に更新した譜面はありません。</p>';
    out.innerHTML = `
        <div class="capture-wrap">
        <div id="${AREA_ID}" class="gr-capture">
            <div class="summary-head">
                <div>
                    <h1>Arcaea Growth Report</h1>
                    <div class="summary-cond">${periodText}</div>
                </div>
                ${profileHtml(profile)}
            </div>
            ${groupsHtml(groups, statCard)}
            <p class="gr-chart-note">グラフ: ポテンシャルは各期間の終わりの値、達成数は各期間に増えた数</p>
        </div>
        <div id="${RECORDS_AREA_ID}" class="gr-capture gr-records">
            <div class="summary-head">
                <div>
                    <h1>Arcaea New Records</h1>
                    <div class="summary-cond">${periodText}　自己ベスト更新 ${fmt(rows.length)} 譜面</div>
                </div>
                ${profileHtml(profile)}
            </div>
            <p class="gr-rec-sort">${escapeHtml(sortLabel)}</p>
            ${rows.length === 0 ? noRows : `${recordListHtml(shown)}${more}`}
        </div>
        </div>
        <div class="gm-view">
            <p class="gm-period">${periodText}</p>
            <button class="btn-preview gm-preview" type="button" data-area="${AREA_ID}">${iconLabel('camera', 'レポートの画像を作る')}</button>
            ${groups.map(g => `<h3 class="gm-group-title">${g.title}</h3><div class="gm-stats">${g.stats.map(mobileStatHtml).join('')}</div>`).join('')}
            <h2 class="gm-list-title">自己ベストを更新した譜面（${fmt(rows.length)}） <span>${escapeHtml(sortLabel)}</span></h2>
            <button class="btn-preview gm-preview" type="button" data-area="${RECORDS_AREA_ID}">${iconLabel('camera', '更新譜面の画像を作る')}</button>
            ${rows.length === 0 ? noRows
                : `<div class="gm-songs">${shown.map(mobileSongHtml).join('')}</div>
                   ${rows.length > shown.length ? `<p class="gr-more">ほか ${rows.length - shown.length} 譜面（画像には上位 ${LIST_LIMIT} 件）</p>` : ''}`}
        </div>
        <p class="tg-note">※ ポテンシャルは all.json を読み込んだ時点の公式の値です。ベスト30平均・旧基準・MAX・PM・EX+ の数は記録から計算しています。
            ベスト30平均は単曲ポテンシャル上位30の単純平均、旧基準（最大）は旧方式（クリアボーナスなし）で上位10を2倍して ÷40 した値（リセント枠をベスト上位10とみなした到達可能な最大値）です。
            MAX(理論値)はノーツ数が分かる譜面だけ数えています。
            ${since ? `履歴を取り始めた ${ymd(new Date(since))} より前の値は今の自己ベストからの推定なので、実際より低く出ることがあります。` : ''}</p>`;
}

// 保存する画像: レポート(数値)と、更新した譜面のタイル
const EXPORTS = {
    [AREA_ID]: { file: unit => `arcaea_growth_${unit}.png`, label: '成長記録（レポート）' },
    [RECORDS_AREA_ID]: { file: unit => `arcaea_growth_records_${unit}.png`, label: '成長記録（更新譜面）' },
};

// ---- グラフの数値のフキダシ ----
let tip = null, activeHit = null;

function hideTip() {
    activeHit?.classList.remove('active');
    activeHit = null;
    tip?.remove();
    tip = null;
}

function showTip(hit) {
    if (hit === activeHit) return;
    hideTip();
    activeHit = hit;
    hit.classList.add('active');
    // 保存範囲に写らないよう body に置き、画面に固定する
    tip = document.createElement('div');
    tip.className = 'gr-tip';
    const t = document.createElement('div');
    t.className = 'gr-tip-title';
    t.textContent = hit.dataset.title;
    const v = document.createElement('div');
    v.className = 'gr-tip-value';
    v.textContent = hit.dataset.tip;
    tip.append(t, v);
    document.body.appendChild(tip);
    const guide = hit.querySelector('.gr-guide').getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - box.width - 8, Math.max(8, guide.left - box.width / 2));
    const top = guide.top - box.height - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top < 8 ? guide.bottom + 8 : top}px`;
}

function mount(container) {
    view = container;
    container.innerHTML = `
        <div class="gr-tool">
            <div class="summary-controls">
                <div class="summary-control"><span class="summary-label">単位</span><div class="chips">
                    ${UNITS.map(u => `<button type="button" class="chip" data-unit="${u.key}">${u.label}</button>`).join('')}</div></div>
                <div class="summary-control gr-nav">
                    <button type="button" class="chip" data-step="-1" aria-label="前の期間">◀</button>
                    <span class="gr-period"></span>
                    <button type="button" class="chip" data-step="1" aria-label="次の期間">▶</button>
                </div>
                <div class="summary-control"><span class="summary-label">並び</span><div class="chips">
                    ${SORTS.map(s => `<button type="button" class="chip" data-sort="${s.key}">${s.label}</button>`).join('')}</div></div>
                <button type="button" class="btn-summary-export" data-area="${AREA_ID}">${iconLabel('camera', 'レポートを保存')}</button>
                <button type="button" class="btn-summary-export" data-area="${RECORDS_AREA_ID}">${iconLabel('camera', '更新譜面を保存')}</button>
            </div>
            <div class="gr-output"></div>
        </div>`;
    container.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const ex = EXPORTS[b.dataset.area];
        if (b.dataset.unit) { state.unit = b.dataset.unit; state.offset = 0; render(); }
        else if (b.dataset.step) { state.offset = Math.min(0, state.offset + Number(b.dataset.step)); render(); }
        else if (b.dataset.sort) { state.sort = b.dataset.sort; render(); }
        else if (ex && document.getElementById(b.dataset.area)) {
            hideTip();
            if (b.classList.contains('btn-summary-export')) exportImage(b.dataset.area, ex.file(state.unit), b, profile);
            else if (b.classList.contains('gm-preview')) openPreview(b.dataset.area, ex.file(state.unit), ex.label, profile);
        }
    });
    // スマホ幅: 開いているグラフを覚えておく(toggle はバブリングしないので capture で受ける)
    container.addEventListener('toggle', e => {
        const d = e.target;
        if (!(d instanceof HTMLDetailsElement) || !d.dataset.key) return;
        if (d.open) openStats.add(d.dataset.key); else openStats.delete(d.dataset.key);
    }, true);
    container.addEventListener('error', handleCoverError, true);
    // テーマを切り替えたら、グラフの色を描き直す
    document.addEventListener('themechange', () => render());
    // グラフ: マウスは乗せている間、指はタップで数値を出す。ほかの場所を触るか、スクロールしたら消す
    container.addEventListener('pointerover', e => {
        const hit = e.target.closest('.gr-hit');
        if (hit && e.pointerType === 'mouse') showTip(hit);
    });
    container.addEventListener('pointerout', e => {
        if (e.pointerType === 'mouse' && e.target.closest('.gr-spark') && !e.relatedTarget?.closest?.('.gr-spark')) hideTip();
    });
    document.addEventListener('pointerdown', e => {
        const hit = e.target.closest?.('.gr-hit');
        if (hit && view.contains(hit)) showTip(hit);
        else hideTip();
    });
    window.addEventListener('scroll', hideTip, { passive: true });
    render();
}

function update(allSongs, newProfile) {
    songs = allSongs;
    profile = newProfile;
    render();
}

export default {
    id: 'growth',
    label: '成長記録',
    icon: 'growth',
    description: '日・週・月・年ごとに、自己ベストを更新した譜面とポテンシャル・PM 数・EX+ 数の推移をまとめます。',
    mount,
    update,
};
