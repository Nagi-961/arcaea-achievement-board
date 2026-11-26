// 成長記録: 日・週・月・年ごとに、自己ベストを更新した譜面と、ポテンシャル・PM数・EX+数の推移をまとめる
import { escapeHtml, diffColors, profileHtml, handleCoverError, compareTitle } from '../board.js';
import { exportImage } from '../export.js';
import { loadHistory } from '../history.js';
import { playPotential, gradeOf, best30Average, oldMaxPotential } from '../calc.js';

const AREA_ID = 'growth-area';
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

function statsAt(charts, t) {
    let pm = 0, exPlus = 0;
    const pots = [], oldPots = [];
    charts.forEach(c => {
        const e = entryBefore(c.entries, t);
        if (!e) return;
        if (e[2] === 3) pm++;
        if (e[1] >= 9900000) exPlus++;
        pots.push(playPotential(c.song.constant, e[1], e[2]));
        // 旧方式の単曲ポテンシャルにはクリアボーナスがない
        oldPots.push(playPotential(c.song.constant, e[1], false));
    });
    return { pm, exPlus, b30: best30Average(pots), oldMax: oldMaxPotential(oldPots) };
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

function statCard(label, value, delta) {
    return `<div class="gr-stat"><div class="gr-stat-label">${label}</div><div class="gr-stat-value">${value}</div><div>${delta || '&nbsp;'}</div></div>`;
}

// 1系列だけの小さな折れ線。凡例は付けずタイトルで名前を示す
function sparkHtml(title, points, format) {
    const W = 240, H = 110, PADX = 14, TOP = 16, BOTTOM = 22;
    const vals = points.map(p => p.v).filter(v => v != null);
    if (vals.length === 0) return `<div class="gr-chart"><div class="gr-chart-title">${title}</div><div class="gr-chart-empty">データなし</div></div>`;
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const x = i => PADX + (W - PADX * 2) * (points.length === 1 ? 0.5 : i / (points.length - 1));
    const y = v => TOP + (H - TOP - BOTTOM) * (1 - (v - min) / (max - min));
    let path = '', pen = false;
    points.forEach((p, i) => {
        if (p.v == null) { pen = false; return; }
        path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
        pen = true;
    });
    const last = points.length - 1;
    const dots = points.map((p, i) => p.v == null ? '' :
        `<g class="gr-pt"><circle cx="${x(i)}" cy="${y(p.v)}" r="12" fill="transparent"/>
            <circle cx="${x(i)}" cy="${y(p.v)}" r="${i === last ? 5 : 4}" fill="${i === last ? '#6fd6ff' : '#12122c'}" stroke="#6fd6ff" stroke-width="2"/>
            <title>${escapeHtml(p.label)}: ${format(p.v)}</title></g>`).join('');
    const labels = points.map((p, i) => (i === 0 || i === last)
        ? `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : 'end'}" class="gr-axis">${escapeHtml(p.label)}</text>` : '').join('');
    const lastVal = points[last].v;
    return `<div class="gr-chart"><div class="gr-chart-title">${title}<span>${lastVal == null ? '' : format(lastVal)}</span></div>
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeHtml(title)}の推移">
            <line x1="${PADX}" x2="${W - PADX}" y1="${H - BOTTOM}" y2="${H - BOTTOM}" stroke="#2c2c52" stroke-width="1"/>
            <path d="${path}" fill="none" stroke="#6fd6ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}${labels}
        </svg></div>`;
}

function songRowHtml(row, i) {
    const s = row.song;
    const grade = gradeOf(row.now[1], row.now[2]);
    let scoreDelta, potDelta;
    if (row.prev) {
        scoreDelta = deltaHtml(row.now[1] - row.prev[1]);
        potDelta = deltaHtml(row.potNow - row.potPrev, 3);
    } else if (row.isNew) {
        scoreDelta = potDelta = '<span class="gr-delta new">NEW</span>';
    } else {
        scoreDelta = potDelta = '<span class="gr-delta zero">前回不明</span>';
    }
    const src = `covers/${encodeURIComponent(s.song_id)}_${s.difficulty}.png`;
    return `<tr>
        <td class="gr-rank">${i + 1}</td>
        <td class="gr-song">
            <img class="jacket gr-jacket" src="${src}" alt="" data-song-id="${escapeHtml(s.song_id)}">
            <div><div class="gr-song-title">${escapeHtml(s.title)}</div>
            <span class="tg-diff" style="background:${diffColors[s.difficulty] || '#444'};">${s.difficulty}</span>
            <span class="gr-song-meta">Lv ${escapeHtml(s.level)} (${s.constant.toFixed(1)})</span></div>
        </td>
        <td class="gr-grade gr-g-${grade.replace('+', 'p')}">${grade}</td>
        <td class="gr-score">${fmt(row.now[1])}<br>${scoreDelta}</td>
        <td class="gr-pot">${row.potNow.toFixed(3)}<br>${potDelta}</td>
    </tr>`;
}

function render() {
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
    const charts = songs.map(song => ({ song, entries: entriesOf(song, history) })).filter(c => c.entries.length > 0);

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
            song: c.song, now, prev, potNow,
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
    for (let k = n - 1; k >= 0; k--) {
        const r = periodRange(state.unit, state.offset - k);
        const s = statsAt(charts, Math.min(r.end, Date.now() + 1));
        buckets.push({ label: shortLabel(state.unit, r), b30: s.b30, oldMax: s.oldMax, pm: s.pm, exPlus: s.exPlus, rating: ratingAt(history, r.end) });
    }
    const series = key => buckets.map(b => ({ label: b.label, v: b[key] }));

    const shown = rows.slice(0, LIST_LIMIT);
    const sortLabel = SORTS.find(s => s.key === state.sort).label;
    out.innerHTML = `
        <div id="${AREA_ID}" class="gr-capture">
            <div class="summary-head">
                <div>
                    <h1>Arcaea Growth Report</h1>
                    <div class="summary-cond">${escapeHtml(periodLabel(state.unit, range))}　${UNITS.find(u => u.key === state.unit).label}間</div>
                </div>
                ${profileHtml(profile)}
            </div>
            <div class="gr-stats">
                ${statCard('ポテンシャル', fmtRating(ratingEnd), deltaHtml(ratingDelta, 3))}
                ${statCard('ベスト30平均', fmtPot(endStats.b30), deltaHtml(diff('b30'), 3))}
                ${statCard('旧基準（最大）', fmtPot(endStats.oldMax), deltaHtml(diff('oldMax'), 3))}
                ${statCard('PM 数', fmt(endStats.pm), deltaHtml(endStats.pm - startStats.pm))}
                ${statCard('EX+ 以上', fmt(endStats.exPlus), deltaHtml(endStats.exPlus - startStats.exPlus))}
                ${statCard('更新した譜面', fmt(rows.length), '')}
            </div>
            <div class="gr-charts">
                ${sparkHtml('ポテンシャル', series('rating'), fmtRating)}
                ${sparkHtml('ベスト30平均', series('b30'), fmtPot)}
                ${sparkHtml('旧基準（最大）', series('oldMax'), fmtPot)}
                ${sparkHtml('PM 数', series('pm'), fmt)}
                ${sparkHtml('EX+ 以上', series('exPlus'), fmt)}
            </div>
            <h2 class="gr-list-title">自己ベストを更新した譜面 <span>${escapeHtml(sortLabel)}</span></h2>
            ${rows.length === 0 ? '<p class="summary-empty">この期間に更新した譜面はありません。</p>' : `
            <table class="gr-table">
                <tr><th>#</th><th>譜面</th><th>ランク</th><th>スコア</th><th>単曲pot</th></tr>
                ${shown.map(songRowHtml).join('')}
            </table>
            ${rows.length > shown.length ? `<p class="gr-more">ほか ${rows.length - shown.length} 譜面</p>` : ''}`}
        </div>
        <p class="tg-note">※ ポテンシャルは all.json を読み込んだ時点の公式の値です。ベスト30平均・旧基準・PM 数・EX+ 数は記録から計算しています。
            ベスト30平均は単曲ポテンシャル上位30の単純平均、旧基準（最大）は旧方式（クリアボーナスなし）で上位10を2倍して ÷40 した値（リセント枠をベスト上位10とみなした到達可能な最大値）です。
            ${since ? `履歴を取り始めた ${ymd(new Date(since))} より前の値は今の自己ベストからの推定なので、実際より低く出ることがあります。` : ''}</p>`;
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
                <button type="button" class="btn-summary-export">📷 画像を保存</button>
            </div>
            <div class="gr-output"></div>
        </div>`;
    container.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.unit) { state.unit = b.dataset.unit; state.offset = 0; render(); }
        else if (b.dataset.step) { state.offset = Math.min(0, state.offset + Number(b.dataset.step)); render(); }
        else if (b.dataset.sort) { state.sort = b.dataset.sort; render(); }
        else if (b.classList.contains('btn-summary-export') && document.getElementById(AREA_ID)) {
            exportImage(AREA_ID, `arcaea_growth_${state.unit}.png`, b, profile);
        }
    });
    container.addEventListener('error', handleCoverError, true);
    render();
}

function update(allSongs, newProfile) {
    songs = allSongs;
    profile = newProfile;
    render();
}

export default {
    id: 'growth',
    label: '📈 成長記録',
    description: '日・週・月・年ごとに、自己ベストを更新した譜面とポテンシャル・PM 数・EX+ 数の推移をまとめます。',
    mount,
    update,
};
