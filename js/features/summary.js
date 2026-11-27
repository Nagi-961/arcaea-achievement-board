// 達成状況表: 難易度・レベルで絞り込んで、ランクごとの達成数を共有しやすい表にする
// PC幅では保存用の表をそのまま見せる。スマホ幅ではレベルごとのカード(積み上げバー、タップで内訳)を見せ、
// 保存は「画像を作る」のプレビュー(preview.js)から行う
import { icon, iconLabel, crownMark } from '../icons.js';
import { escapeHtml, levelSortKey, profileHtml } from '../board.js';
import { exportImage } from '../export.js';
import { openPreview } from '../preview.js';

const GRADES = [
    // 色は css/style.css のテーマごとの変数
    { key: 'MAX', label: 'MAX', color: 'var(--g-max)', bar: 'var(--g-max-bar)', glow: true, crown: true },
    { key: 'PM', label: 'PM', color: 'var(--g-pm)', bar: 'var(--g-pm-bar)' },
    { key: 'EX+', label: 'EX+', color: 'var(--g-exp)', bar: 'var(--g-exp-bar)' },
    { key: 'EX', label: 'EX', color: 'var(--g-ex)', bar: 'var(--g-ex)' },
    { key: 'AA', label: 'AA', color: 'var(--g-aa)', bar: 'var(--g-aa)' },
    { key: 'A', label: 'A', color: 'var(--g-a)', bar: 'var(--g-a)' },
    { key: 'B-D', label: 'B〜D', color: 'var(--g-bd)', bar: 'var(--g-bd-bar)' },
    { key: 'NP', label: '未プレイ', color: 'var(--g-np)', bar: 'var(--g-np-bar)' },
];
// INS は BYD と同じ枠で数える
const DIFFS = [
    { key: 'PST', label: 'PST', color: 'var(--d-PST)', match: ['PST'] },
    { key: 'PRS', label: 'PRS', color: 'var(--d-PRS)', match: ['PRS'] },
    { key: 'FTR', label: 'FTR', color: 'var(--d-FTR)', match: ['FTR'] },
    { key: 'BYD', label: 'BYD/INS', color: 'var(--d-BYD)', match: ['BYD', 'INS'] },
    { key: 'ETR', label: 'ETR', color: 'var(--d-ETR)', match: ['ETR'] },
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
    return levelsOf(songs).reverse().map(lv => countRow(`Lv ${lv}`, 'var(--text)', songs.filter(s => s.level === lv)));
}

// MAX(理論値)には王冠を付けて、PM と見分けやすくする
const gradeLabel = g => (g.crown ? crownMark() : '') + g.label;

const pct = (n, total) => total > 0 ? (n / total * 100).toFixed(1) + '%' : '-';

function barHtml(row) {
    return GRADES.map(g => row.counts[g.key] > 0
        ? `<span style="flex:${row.counts[g.key]};background:${g.bar};"></span>` : '').join('');
}

// ---- スマホ幅のカード ----
// 内訳: ランクごとの数(0 の欄も薄く出して、並びを揃える)
function cardCountsHtml(row) {
    return `<dl class="sm-counts">${GRADES.map(g => {
        const n = row.counts[g.key];
        return `<div${n > 0 ? '' : ' class="zero"'}><dt style="color:${g.color};">${gradeLabel(g)}</dt><dd>${n}</dd></div>`;
    }).join('')}</dl>`;
}

function rates(row) {
    const pmUp = row.counts.MAX + row.counts.PM;
    return { pm: pct(pmUp, row.total), exPlus: pct(pmUp + row.counts['EX+'], row.total) };
}

function cardHtml(row) {
    const r = rates(row);
    return `<details class="sm-card slide">
            <summary>
                <span class="sm-card-head">
                    <span class="sm-label" style="color:${row.color};">${escapeHtml(row.label)}</span>
                    <span class="sm-rate"><small>EX+以上</small>${r.exPlus}</span>
                    ${icon('chevron', 'sm-chev')}
                </span>
                <span class="sum-bar">${barHtml(row)}</span>
            </summary>
            <div class="slide-body"><div class="sm-detail">
                ${cardCountsHtml(row)}
                <p class="sm-facts"><span>合計 <b>${row.total}</b></span><span>PM以上 <b style="color:var(--g-pm);">${r.pm}</b></span></p>
            </div></div>
        </details>`;
}

function mobileHtml(rows, total) {
    const r = rates(total);
    return `<div class="sm-view">
            <button class="btn-preview sm-preview" type="button">${iconLabel('camera', '画像を作る')}</button>
            <p class="sm-cond">${escapeHtml(conditionText())}</p>
            <div class="sm-total">
                <div class="sm-total-nums">
                    <div><small>合計</small><b>${total.total}</b></div>
                    <div><small>PM以上</small><b style="color:var(--g-pm);">${r.pm}</b></div>
                    <div><small>EX+以上</small><b style="color:var(--g-exp);">${r.exPlus}</b></div>
                </div>
                <div class="sum-bar">${barHtml(total)}</div>
                ${cardCountsHtml(total)}
            </div>
            ${rows.map(cardHtml).join('')}
            <div class="summary-legend">${legendHtml()}</div>
        </div>`;
}

function legendHtml() {
    return GRADES.map(g => `<span>${g.crown ? crownMark() : `<i style="background:${g.bar};"></i>`}${g.label}</span>`).join('');
}

function rowHtml(row, isTotal) {
    const c = row.counts;
    const pmUp = c.MAX + c.PM;
    const exPlusUp = pmUp + c['EX+'];
    const cells = GRADES.map(g => {
        const n = c[g.key];
        const style = n > 0 ? `color:${g.color};${g.glow ? 'text-shadow:var(--g-max-glow);' : ''}` : 'color:var(--g-zero);';
        return `<td style="${style}">${n > 0 ? n : '-'}</td>`;
    }).join('');
    const bar = barHtml(row);
    return `<tr class="${isTotal ? 'sum-total' : ''}">
        <th style="color:${row.color};">${escapeHtml(row.label)}</th>
        ${cells}
        <td class="sum-num">${row.total}</td>
        <td class="sum-rate" style="color:var(--g-pm);">${pct(pmUp, row.total)}</td>
        <td class="sum-rate" style="color:var(--g-exp);">${pct(exPlusUp, row.total)}</td>
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
    const total = countRow('合計', 'var(--text)', songs);
    out.innerHTML = `
        <div class="capture-wrap">
        <div id="${AREA_ID}" class="summary-capture">
            <div class="summary-head">
                <div>
                    <h1>Arcaea Achievement Summary</h1>
                    <div class="summary-cond">${escapeHtml(conditionText())}</div>
                </div>
                ${profileHtml(profile)}
            </div>
            <table class="summary-big">
                <tr><th></th>${GRADES.map(g => `<th style="color:${g.color};">${gradeLabel(g)}</th>`).join('')}
                    <th>合計</th><th style="color:var(--g-pm);">PM以上</th><th style="color:var(--g-exp);">EX+以上</th><th>内訳</th></tr>
                ${rows.map(r => rowHtml(r, false)).join('')}
                ${rows.length > 1 ? rowHtml(total, true) : ''}
            </table>
            <div class="summary-legend">${legendHtml()}</div>
        </div>
        </div>
        ${mobileHtml(rows, total)}`;
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
                <button type="button" class="btn-summary-export">${iconLabel('camera', '画像を保存')}</button>
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
    // スマホ幅: プレビューを開いて、そこから保存する
    container.querySelector('.summary-output').addEventListener('click', e => {
        if (e.target.closest('.sm-preview') && document.getElementById(AREA_ID)) {
            openPreview(AREA_ID, 'arcaea_summary.png', '達成状況表', profile);
        }
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
    label: '達成状況表',
    icon: 'summary',
    description: '難易度・レベルごとに、MAX・PM・EX+ などの達成数をまとめた表を作ります。',
    mount,
    update,
};
