// 達成状況表: 難易度・レベルで絞り込んで、ランクごとの達成数を共有しやすい表にする
import { escapeHtml, levelSortKey, profileHtml } from '../board.js';
import { exportImage } from '../export.js';

const GRADES = [
    { key: 'MAX', label: '理論値', color: '#ffdf00', bar: '#ffdf00', glow: true },
    { key: 'PM', label: 'PM', color: '#ffd700', bar: '#c9a227' },
    { key: 'EX+', label: 'EX+', color: '#00ffff', bar: '#00bcd4' },
    { key: 'EX', label: 'EX', color: '#32cd32', bar: '#32cd32' },
    { key: 'AA', label: 'AA', color: '#ff4c4c', bar: '#ff4c4c' },
    { key: 'A', label: 'A', color: '#ff8a65', bar: '#ff8a65' },
    { key: 'B-D', label: 'B〜D', color: '#bcaaa4', bar: '#8d6e63' },
    { key: 'NP', label: '未プレイ', color: '#777777', bar: '#333333' },
];
// INS は BYD と同じ枠で数える
const DIFFS = [
    { key: 'PST', label: 'PST', color: '#4fc3f7', match: ['PST'] },
    { key: 'PRS', label: 'PRS', color: '#81c784', match: ['PRS'] },
    { key: 'FTR', label: 'FTR', color: '#9932cc', match: ['FTR'] },
    { key: 'BYD', label: 'BYD/INS', color: '#dc143c', match: ['BYD', 'INS'] },
    { key: 'ETR', label: 'ETR', color: '#d8bfd8', match: ['ETR'] },
];
const AREA_ID = 'summary-area';

const state = {
    diffs: new Set(['FTR', 'BYD', 'ETR']),
    minLevel: null,
    maxLevel: null,
    rowsBy: 'level',
};
let allSongs = [];
let profile = null;
let view = null;

function gradeBucket(grade) {
    if (grade === 'NO PLAY') return 'NP';
    if (['B', 'C', 'D'].includes(grade)) return 'B-D';
    return grade;
}

function diffOf(song) {
    return DIFFS.find(d => d.match.includes(song.difficulty));
}

function levelsOf(songs) {
    return [...new Set(songs.map(s => s.level))].sort((a, b) => levelSortKey(a) - levelSortKey(b));
}

function filteredSongs() {
    const min = levelSortKey(state.minLevel), max = levelSortKey(state.maxLevel);
    return allSongs.filter(s => {
        const d = diffOf(s);
        const lv = levelSortKey(s.level);
        return d && state.diffs.has(d.key) && lv >= min && lv <= max;
    });
}

function countRow(label, color, songs) {
    const counts = Object.fromEntries(GRADES.map(g => [g.key, 0]));
    songs.forEach(s => { counts[gradeBucket(s.grade)]++; });
    return { label, color, counts, total: songs.length };
}

function buildRows(songs) {
    if (state.rowsBy === 'diff') {
        return DIFFS.filter(d => state.diffs.has(d.key))
            .map(d => countRow(d.label, d.color, songs.filter(s => diffOf(s) === d)))
            .filter(r => r.total > 0);
    }
    // 高いレベルを上にする
    return levelsOf(songs).reverse().map(lv => countRow(`Lv ${lv}`, '#ffffff', songs.filter(s => s.level === lv)));
}

const pct = (n, total) => total > 0 ? (n / total * 100).toFixed(1) + '%' : '-';

function rowHtml(row, isTotal) {
    const c = row.counts;
    const pmUp = c.MAX + c.PM;
    const exPlusUp = pmUp + c['EX+'];
    const cells = GRADES.map(g => {
        const n = c[g.key];
        const style = n > 0 ? `color:${g.color};${g.glow ? `text-shadow:0 0 6px ${g.color};` : ''}` : 'color:#444;';
        return `<td style="${style}">${n > 0 ? n : '-'}</td>`;
    }).join('');
    const bar = GRADES.map(g => row.counts[g.key] > 0
        ? `<span style="flex:${row.counts[g.key]};background:${g.bar};"></span>` : '').join('');
    return `<tr class="${isTotal ? 'sum-total' : ''}">
        <th style="color:${row.color};">${escapeHtml(row.label)}</th>
        ${cells}
        <td class="sum-num">${row.total}</td>
        <td class="sum-rate" style="color:#ffd700;">${pct(pmUp, row.total)}</td>
        <td class="sum-rate" style="color:#00ffff;">${pct(exPlusUp, row.total)}</td>
        <td class="sum-bar-cell"><div class="sum-bar">${bar}</div></td>
    </tr>`;
}

function conditionText() {
    const diffs = DIFFS.filter(d => state.diffs.has(d.key)).map(d => d.label).join(' / ');
    const levels = state.minLevel === state.maxLevel ? `Lv ${state.minLevel}` : `Lv ${state.minLevel}〜${state.maxLevel}`;
    return `${diffs}　${levels}　${state.rowsBy === 'diff' ? '難易度別' : 'レベル別'}`;
}

function renderTable() {
    const out = view.querySelector('.summary-output');
    if (allSongs.length === 0) {
        out.innerHTML = '<p class="summary-empty">all.json を読み込むと表示されます。</p>';
        return;
    }
    const songs = filteredSongs();
    if (songs.length === 0) {
        out.innerHTML = '<p class="summary-empty">条件に合う譜面がありません。</p>';
        return;
    }
    const rows = buildRows(songs);
    const total = countRow('合計', '#ffffff', songs);
    const legend = GRADES.map(g => `<span><i style="background:${g.bar};"></i>${g.label}</span>`).join('');
    out.innerHTML = `
        <div id="${AREA_ID}" class="summary-capture">
            <div class="summary-head">
                <div>
                    <h1>Arcaea Achievement Summary</h1>
                    <div class="summary-cond">${escapeHtml(conditionText())}</div>
                </div>
                ${profileHtml(profile)}
            </div>
            <table class="summary-big">
                <tr><th></th>${GRADES.map(g => `<th style="color:${g.color};">${g.label}</th>`).join('')}
                    <th>合計</th><th style="color:#ffd700;">PM以上</th><th style="color:#00ffff;">EX+以上</th><th>内訳</th></tr>
                ${rows.map(r => rowHtml(r, false)).join('')}
                ${rows.length > 1 ? rowHtml(total, true) : ''}
            </table>
            <div class="summary-legend">${legend}</div>
        </div>`;
}

function chip(label, active, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
}

function renderControls() {
    const diffBox = view.querySelector('.summary-diffs');
    diffBox.replaceChildren(...DIFFS.map(d => chip(d.label, state.diffs.has(d.key), () => {
        // 1つも選ばれていない状態にはしない
        if (state.diffs.has(d.key) && state.diffs.size > 1) state.diffs.delete(d.key);
        else state.diffs.add(d.key);
        refresh();
    })));

    const rowsBox = view.querySelector('.summary-rows');
    rowsBox.replaceChildren(
        chip('レベルごと', state.rowsBy === 'level', () => { state.rowsBy = 'level'; refresh(); }),
        chip('難易度ごと', state.rowsBy === 'diff', () => { state.rowsBy = 'diff'; refresh(); }),
    );

    const levels = levelsOf(allSongs);
    ['min', 'max'].forEach(which => {
        const select = view.querySelector(`.summary-${which}`);
        const value = state[`${which}Level`];
        select.replaceChildren(...levels.map(lv => new Option(lv, lv, false, lv === value)));
    });
}

function refresh() {
    renderControls();
    renderTable();
}

function mount(container) {
    view = container;
    container.innerHTML = `
        <div class="summary-tool">
            <div class="summary-controls">
                <div class="summary-control"><span class="summary-label">難易度</span><div class="summary-diffs chips"></div></div>
                <div class="summary-control"><span class="summary-label">レベル</span>
                    <select class="summary-min"></select> 〜 <select class="summary-max"></select></div>
                <div class="summary-control"><span class="summary-label">行</span><div class="summary-rows chips"></div></div>
                <button type="button" class="btn-summary-export">📷 画像を保存</button>
                <p class="summary-note">PST・PRS のスコアは、取得方法で「全難易度」などを選んで取得したデータが必要です。</p>
            </div>
            <div class="summary-output"></div>
        </div>`;

    ['min', 'max'].forEach(which => {
        container.querySelector(`.summary-${which}`).addEventListener('change', e => {
            state[`${which}Level`] = e.target.value;
            // 下限と上限が逆になったら揃える
            if (levelSortKey(state.minLevel) > levelSortKey(state.maxLevel)) {
                if (which === 'min') state.maxLevel = state.minLevel;
                else state.minLevel = state.maxLevel;
            }
            refresh();
        });
    });
    container.querySelector('.btn-summary-export').addEventListener('click', e => {
        if (document.getElementById(AREA_ID)) exportImage(AREA_ID, 'arcaea_summary.png', e.currentTarget, profile);
    });
    refresh();
}

function update(songs, newProfile) {
    allSongs = songs;
    profile = newProfile;
    const levels = levelsOf(songs);
    if (!levels.includes(state.minLevel)) state.minLevel = levels[0];
    if (!levels.includes(state.maxLevel)) state.maxLevel = levels[levels.length - 1];
    refresh();
}

export default {
    id: 'summary',
    label: '📊 達成状況表',
    description: '難易度・レベルごとに、理論値・PM・EX+ などの達成数をまとめた表を作ります。',
    mount,
    update,
};
