// スコア目標計算機: 目標スコアと内部精度の失点から、許容できる FAR / LOST を計算する
// all.json がなくても master.csv のノーツ数だけで使える。データがあれば自己ベストとの差も出す
import { icon, iconLabel } from '../icons.js';
import { escapeHtml, compareTitle, diffColors, levelSortKey } from '../board.js';
import { calcScore } from '../calc.js';

// まずはノーツ数がそろっている FTR / BYD / INS / ETR に限定する
const DIFFS = [
    { key: 'FTR', label: 'FTR', match: ['FTR'] },
    { key: 'BYD', label: 'BYD/INS', match: ['BYD', 'INS'] },
    { key: 'ETR', label: 'ETR', match: ['ETR'] },
];
const TARGET_DIFFS = DIFFS.flatMap(d => d.match);
// PM は FAR・LOST 0 が条件なので、スコアではなく別扱いにする
const GRADE_TARGETS = [
    { key: 'PM', label: 'PM', score: null, color: 'var(--g-pm)' },
    { key: 'EX+', label: 'EX+', score: 9900000, color: 'var(--g-exp)' },
    { key: 'EX', label: 'EX', score: 9800000, color: 'var(--g-ex)' },
    { key: 'AA', label: 'AA', score: 9500000, color: 'var(--g-aa)' },
    { key: 'A', label: 'A', score: 9200000, color: 'var(--g-a)' },
];
const LIST_LOSTS = [0, 1, 2, 3];
const MAX_TABLE_ROWS = 40;

const state = {
    mode: 'calc',
    target: { grade: 'EX+', score: null }, // score が入っていれば数値指定を優先
    loss: 0,
    chartKey: null,
    search: '',
    listDiffs: new Set(['FTR', 'BYD', 'ETR']),
    listMinLevel: '9',
    listSearch: '',
};
let charts = [];
const records = new Map();
let view = null;

const keyOf = c => c.song_id + '_' + c.difficulty;
const fmt = n => n.toLocaleString('ja-JP');

// ---- 計算 ----
function targetScore() {
    if (state.target.score != null) return state.target.score;
    return GRADE_TARGETS.find(g => g.key === state.target.grade).score;
}

const isPmTarget = () => state.target.score == null && state.target.grade === 'PM';

// LOST が lost 個のとき、目標に届く FAR の最大数。届かなければ -1
function maxFar(notes, lost, loss, target) {
    if (isPmTarget()) return lost === 0 ? 0 : -1;
    if (lost > notes || calcScore(notes, 0, lost, loss) < target) return -1;
    let lo = 0, hi = notes - lost;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (calcScore(notes, mid, lost, loss) >= target) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

// FAR が far 個のとき、目標に届く LOST の最大数。届かなければ -1
function maxLost(notes, far, loss, target) {
    if (isPmTarget()) return far === 0 ? 0 : -1;
    let lost = -1;
    while (lost + 1 <= notes - far && calcScore(notes, far, lost + 1, loss) >= target) lost++;
    return lost;
}

function achieved(record, target) {
    if (isPmTarget()) return record.far === 0 && record.lost === 0;
    return record.score >= target;
}

// ---- 表示 ----
function diffBadge(chart) {
    return `<span class="tg-diff" style="background:${diffColors[chart.difficulty] || '#444'};">${chart.difficulty}</span>`;
}

function chartLabel(chart) {
    return `${diffBadge(chart)} <span class="tg-title">${escapeHtml(chart.title)}</span>
        <span class="tg-meta">Lv ${escapeHtml(chart.level)} (${chart.constant.toFixed(1)})</span>`;
}

function targetText() {
    if (isPmTarget()) return 'PM';
    const grade = GRADE_TARGETS.find(g => g.score === targetScore());
    return fmt(targetScore()) + (grade && state.target.score == null ? `（${grade.label}）` : '');
}

// 自己ベストから、目標まであと何個 FAR / LOST を減らせばいいか
function adviceHtml(chart, record, target) {
    const loss = state.loss;
    const bestLoss = record.pure - record.shiny;
    const head = `<div class="tg-best">
        <div class="tg-best-title">あなたの自己ベスト</div>
        <div class="tg-best-score">${fmt(record.score)}</div>
        <div class="tg-best-judge">PURE ${record.pure}（光 ${record.shiny}）　FAR ${record.far}　LOST ${record.lost}</div>
        <div class="tg-best-loss">内部精度の失点: ${bestLoss}
            <button type="button" class="tg-use-loss" data-loss="${bestLoss}">この値で計算する</button></div>`;
    if (achieved(record, target)) return head + `<div class="tg-advice ok">${icon('check')}目標 ${targetText()} は達成済みです</div></div>`;

    const lines = [];
    const farAtLost = maxFar(chart.notes, record.lost, loss, target);
    if (farAtLost >= 0) {
        lines.push(`LOST ${record.lost} のままなら、FAR を <b>${record.far - farAtLost}</b> 個減らす（FAR ${farAtLost} 以下）`);
    } else {
        lines.push(`LOST ${record.lost} のままでは、FAR 0 でも届きません`);
    }
    const lostAtFar = maxLost(chart.notes, record.far, loss, target);
    if (lostAtFar >= 0) {
        lines.push(`FAR ${record.far} のままなら、LOST を <b>${record.lost - lostAtFar}</b> 個減らす（LOST ${lostAtFar} 以下）`);
    } else {
        lines.push(`FAR ${record.far} のままでは、LOST 0 でも届きません`);
    }
    if (farAtLost < 0 && lostAtFar < 0) {
        lines.push('FAR と LOST の両方を、上の表のどれかの組み合わせまで減らす必要があります');
    }
    return head + `<ul class="tg-advice">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
        <p class="tg-note">※ 内部精度の失点は上の入力値（${loss}）で計算しています。</p></div>`;
}

function calcOutputHtml() {
    const chart = charts.find(c => keyOf(c) === state.chartKey);
    if (!chart) return '<p class="tg-empty">上の検索から譜面を選んでください。</p>';
    const target = targetScore();
    const loss = state.loss;
    const rows = [];
    for (let lost = 0; lost < MAX_TABLE_ROWS; lost++) {
        const far = maxFar(chart.notes, lost, loss, target);
        if (far < 0) break;
        rows.push(`<tr><th>${lost}</th><td class="tg-far">${far}</td><td>${fmt(calcScore(chart.notes, far, lost, loss))}</td></tr>`);
    }
    const table = rows.length > 0
        ? `<table class="tg-table"><tr><th>LOST</th><th>FAR の上限</th><th>そのときのスコア</th></tr>${rows.join('')}</table>
            ${rows.length === MAX_TABLE_ROWS ? `<p class="tg-note">LOST ${MAX_TABLE_ROWS} 個以上は省略しています。</p>` : ''}`
        : '<p class="tg-warn">FAR・LOST 0 でも目標に届きません。内部精度の失点を見直してください。</p>';
    const record = records.get(keyOf(chart));
    return `<div class="tg-result">
        <div class="tg-chart">${chartLabel(chart)}</div>
        <div class="tg-facts">ノーツ数 ${fmt(chart.notes)}　理論値 ${fmt(10000000 + chart.notes)}　目標 <b>${targetText()}</b>　内部精度の失点 ${loss}</div>
        ${isPmTarget() ? '<p class="tg-note">PM は FAR・LOST 0 が条件です（内部精度は関係ありません）。</p>' : table}
        ${record ? adviceHtml(chart, record, target) : ''}
    </div>`;
}

function searchResultsHtml() {
    const q = state.search.trim().toLowerCase();
    if (q === '') return '';
    const hits = charts.filter(c => c.title.toLowerCase().includes(q) || c.song_id.toLowerCase().includes(q)).slice(0, 30);
    if (hits.length === 0) return '<p class="tg-empty">見つかりませんでした。</p>';
    return hits.map(c => `<button type="button" class="tg-hit${keyOf(c) === state.chartKey ? ' active' : ''}" data-key="${escapeHtml(keyOf(c))}">${chartLabel(c)}</button>`).join('');
}

function listOutputHtml() {
    const target = targetScore();
    const q = state.listSearch.trim().toLowerCase();
    const minLv = levelSortKey(state.listMinLevel);
    const shown = charts.filter(c => DIFFS.some(d => state.listDiffs.has(d.key) && d.match.includes(c.difficulty))
        && levelSortKey(c.level) >= minLv
        && (q === '' || c.title.toLowerCase().includes(q)));
    if (shown.length === 0) return '<p class="tg-empty">条件に合う譜面がありません。</p>';
    const hasRecords = records.size > 0;
    const rows = shown.map(c => {
        const fars = LIST_LOSTS.map(l => {
            const f = maxFar(c.notes, l, state.loss, target);
            return `<td class="${f < 0 ? 'tg-ng' : 'tg-far'}">${f < 0 ? '×' : f}</td>`;
        }).join('');
        let best = '';
        if (hasRecords) {
            const r = records.get(keyOf(c));
            let need = '<td class="tg-ng">-</td>';
            if (r) {
                const f = maxFar(c.notes, r.lost, state.loss, target);
                need = achieved(r, target) ? `<td class="tg-ok">${icon('check')}</td>`
                    : f >= 0 ? `<td>FAR −${r.far - f}</td>` : '<td class="tg-ng">LOST減必要</td>';
            }
            best = `<td class="tg-bestcell">${r ? `${r.far} / ${r.lost}` : '-'}</td>${need}`;
        }
        return `<tr><th><button type="button" class="tg-open" data-key="${escapeHtml(keyOf(c))}">${chartLabel(c)}</button></th>
            <td>${fmt(c.notes)}</td>${fars}${best}</tr>`;
    }).join('');
    return `<div class="tg-scroll"><table class="tg-table tg-list">
        <tr><th>譜面</th><th>ノーツ</th>${LIST_LOSTS.map(l => `<th>LOST ${l}<br><small>FAR上限</small></th>`).join('')}
            ${hasRecords ? '<th>ベスト<br><small>FAR / LOST</small></th><th>目標まで<br><small>LOSTそのまま</small></th>' : ''}</tr>
        ${rows}</table></div>
        <p class="tg-note">${shown.length} 譜面。譜面名を押すと、その譜面の詳しい表を開きます。</p>`;
}

function renderOutput() {
    view.querySelector('.tg-calc').hidden = state.mode !== 'calc';
    view.querySelector('.tg-listbox').hidden = state.mode !== 'list';
    if (charts.length === 0) {
        view.querySelector('.tg-output').innerHTML = '<p class="tg-empty">楽曲データを読み込み中...</p>';
        return;
    }
    if (state.mode === 'calc') view.querySelector('.tg-hits').innerHTML = searchResultsHtml();
    view.querySelector('.tg-output').innerHTML = state.mode === 'calc' ? calcOutputHtml() : listOutputHtml();
}

function renderChips() {
    view.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    view.querySelectorAll('[data-grade]').forEach(b =>
        b.classList.toggle('active', state.target.score == null && b.dataset.grade === state.target.grade));
    view.querySelectorAll('[data-listdiff]').forEach(b => b.classList.toggle('active', state.listDiffs.has(b.dataset.listdiff)));
}

function refresh() {
    renderChips();
    renderOutput();
}

function openChart(key) {
    state.chartKey = key;
    state.mode = 'calc';
    const chart = charts.find(c => keyOf(c) === key);
    state.search = chart ? chart.title : '';
    view.querySelector('.tg-search').value = state.search;
    refresh();
    view.scrollIntoView({ block: 'start' });
}

function mount(container) {
    view = container;
    container.innerHTML = `
        <div class="tg-tool">
            <div class="summary-controls tg-controls">
                <div class="summary-control"><span class="summary-label">表示</span><div class="chips">
                    <button type="button" class="chip" data-mode="calc">${iconLabel('target', '譜面ごとの早見表')}</button>
                    <button type="button" class="chip" data-mode="list">${iconLabel('list', '全譜面の一覧')}</button></div></div>
                <div class="summary-control"><span class="summary-label">目標</span><div class="chips">
                    ${GRADE_TARGETS.map(g => `<button type="button" class="chip" data-grade="${g.key}">${g.label}</button>`).join('')}</div>
                    <input type="number" class="tg-input tg-score" inputmode="numeric" min="0" max="10010000" step="1000" placeholder="数値で指定（例 9950000）"></div>
                <div class="summary-control"><span class="summary-label">内部精度の失点</span>
                    <input type="number" class="tg-input tg-loss" inputmode="numeric" min="0" step="1" value="0">
                    <span class="tg-hint">光らなかった PURE の数（1つにつき −1点）</span></div>
                <p class="summary-note">スコア = 10,000,000 ×（2×PURE＋FAR）÷（2×ノーツ数）＋光った PURE の数（小数点以下切り捨て）。対象は FTR / BYD / INS / ETR です。</p>
            </div>
            <div class="tg-calc">
                <input type="search" class="tg-input tg-search" placeholder="曲名で検索">
                <div class="tg-hits"></div>
            </div>
            <div class="tg-listbox summary-controls" hidden>
                <div class="summary-control"><span class="summary-label">難易度</span><div class="chips">
                    ${DIFFS.map(d => `<button type="button" class="chip" data-listdiff="${d.key}">${d.label}</button>`).join('')}</div></div>
                <div class="summary-control"><span class="summary-label">レベル</span><select class="tg-minlv"></select> 以上</div>
                <div class="summary-control"><input type="search" class="tg-input tg-listsearch" placeholder="曲名で絞り込み"></div>
            </div>
            <div class="tg-output"></div>
        </div>`;

    container.addEventListener('click', e => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.mode) { state.mode = t.dataset.mode; refresh(); }
        else if (t.dataset.grade) {
            state.target = { grade: t.dataset.grade, score: null };
            container.querySelector('.tg-score').value = '';
            refresh();
        } else if (t.dataset.listdiff) {
            const k = t.dataset.listdiff;
            // 1つも選ばれていない状態にはしない
            if (state.listDiffs.has(k) && state.listDiffs.size > 1) state.listDiffs.delete(k);
            else state.listDiffs.add(k);
            refresh();
        } else if (t.classList.contains('tg-hit')) {
            state.chartKey = t.dataset.key;
            refresh();
        } else if (t.classList.contains('tg-open')) {
            openChart(t.dataset.key);
        } else if (t.classList.contains('tg-use-loss')) {
            state.loss = Number(t.dataset.loss);
            container.querySelector('.tg-loss').value = state.loss;
            refresh();
        }
    });
    container.querySelector('.tg-score').addEventListener('input', e => {
        const v = Math.floor(Number(e.target.value));
        state.target = Number.isFinite(v) && v > 0 && e.target.value !== ''
            ? { grade: state.target.grade, score: v } : { grade: state.target.grade, score: null };
        refresh();
    });
    container.querySelector('.tg-loss').addEventListener('input', e => {
        const v = Math.floor(Number(e.target.value));
        state.loss = Number.isFinite(v) && v > 0 ? v : 0;
        refresh();
    });
    container.querySelector('.tg-search').addEventListener('input', e => { state.search = e.target.value; renderOutput(); });
    container.querySelector('.tg-listsearch').addEventListener('input', e => { state.listSearch = e.target.value; renderOutput(); });
    container.querySelector('.tg-minlv').addEventListener('change', e => { state.listMinLevel = e.target.value; renderOutput(); });
    refresh();
}

function setMaster(master) {
    charts = master.filter(c => TARGET_DIFFS.includes(c.difficulty) && c.notes)
        .sort((a, b) => b.constant - a.constant || compareTitle(a, b));
    const levels = [...new Set(charts.map(c => c.level))].sort((a, b) => levelSortKey(a) - levelSortKey(b));
    if (!levels.includes(state.listMinLevel)) state.listMinLevel = levels[0];
    view.querySelector('.tg-minlv').replaceChildren(...levels.map(lv => new Option(lv, lv, false, lv === state.listMinLevel)));
    refresh();
}

function update(songs) {
    records.clear();
    songs.forEach(s => { if (s.record) records.set(keyOf(s), s.record); });
    refresh();
}

export default {
    id: 'target',
    label: 'スコア目標計算機',
    icon: 'target',
    description: '目標スコア（EX+ や 9,950,000 など）に届くには FAR・LOST をいくつまで出せるか計算します。all.json なしでも使えます。',
    needsData: false,
    mount,
    setMaster,
    update,
};
