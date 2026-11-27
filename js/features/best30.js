// ベスト30: 単曲ポテンシャル上位30譜面をジャケットのタイル(5×6)で並べて、画像で共有する
// 「新基準」はクリアボーナス込みの単曲ポテンシャルで上位30、「旧基準」はボーナスなしで並べ替え、上位10にリセント枠(×2)の印を付ける。
// PC幅では保存用の画像をそのまま見せ、スマホ幅ではリストを見せて、保存は「画像を作る」のプレビューから行う
import { icon, iconLabel, crownMark } from '../icons.js';
import { escapeHtml, diffColors, profileHtml, handleCoverError, coverSrc, gradeClass, listDetailHtml } from '../board.js';
import { exportImage } from '../export.js';
import { openPreview } from '../preview.js';
import { playPotential, best30Average, oldMaxPotential } from '../calc.js';

const AREA_ID = 'best30-area';
const MODES = [
    { key: 'new', label: '新基準', heading: 'Arcaea Best 30', file: 'arcaea_best30.png' },
    { key: 'old', label: '旧基準', heading: 'Arcaea Best 30 (Legacy)', file: 'arcaea_best30_legacy.png' },
];
const COUNT = 30;
const RECENT_SLOTS = 10;

const state = { mode: 'new' };
let songs = [];
let profile = null;
let view = null;

const fmt = n => n.toLocaleString('ja-JP');
const fmtPot = v => v == null ? '--' : v.toFixed(3);

// プレイ済みの譜面に、新旧の単曲ポテンシャルを付けて並べる
function ranked(mode) {
    const played = songs.filter(s => s.record && s.record.score > 0).map(s => ({
        song: s,
        potNew: playPotential(s.constant, s.record.score, s.record.clear !== 0),
        // 旧方式の単曲ポテンシャルにはクリアボーナスがない
        potOld: playPotential(s.constant, s.record.score, false),
    }));
    const key = mode === 'old' ? 'potOld' : 'potNew';
    return played.map(p => ({ ...p, pot: p[key] })).sort((a, b) => b.pot - a.pot || b.song.constant - a.song.constant);
}

function tileHtml(entry, i, mode) {
    const s = entry.song;
    const color = diffColors[s.difficulty] || 'var(--tile-border)';
    const gradeCls = 'g-' + (s.grade === 'NO PLAY' ? 'NP' : s.grade.replace('+', 'p'));
    return `<div class="b30-tile">
            <div class="b30-jacket diff-${s.difficulty}" style="border-color:${color};">
                <img class="jacket" src="${coverSrc(s.song_id, s.difficulty)}" alt="" data-song-id="${escapeHtml(s.song_id)}">
                <span class="b30-no">${i + 1}</span>
                ${s.grade === 'MAX' ? `<span class="tile-crown b30-crown">${crownMark()}</span>` : ''}
                ${mode === 'old' && i < RECENT_SLOTS ? '<span class="b30-x2">×2</span>' : ''}
                <div class="b30-bar">
                    <span class="b30-grade ${gradeCls}">${s.grade}</span>
                    <span class="b30-pot">${entry.pot.toFixed(3)}</span>
                </div>
            </div>
            <div class="b30-title">${escapeHtml(s.title)}</div>
            <div class="b30-meta"><span class="tg-diff" style="background:${color};">${s.difficulty}</span><span>${s.constant.toFixed(1)}</span><span class="b30-score">${fmt(s.record.score)}</span></div>
        </div>`;
}

// スマホ幅のリストの1行。実績表のリストと同じく、タップで下に詳細(判定の内訳など)をスライドして開く
function mobileRowHtml(entry, i, mode) {
    const s = entry.song;
    const color = diffColors[s.difficulty] || 'var(--tile-border)';
    return `<details class="bl-row b30-row slide">
            <summary>
                <span class="b30m-no">${i + 1}</span>
                <img src="${coverSrc(s.song_id, s.difficulty)}" class="jacket bl-jacket diff-${s.difficulty}" alt="" loading="lazy" data-song-id="${escapeHtml(s.song_id)}" style="border-color:${color};">
                <span class="bl-main">
                    <span class="bl-title">${escapeHtml(s.title)}</span>
                    <span class="bl-meta"><span class="tg-diff" style="background:${color};">${s.difficulty}</span> ${s.constant.toFixed(1)}　${fmt(s.record.score)}${mode === 'old' && i < RECENT_SLOTS ? '<span class="b30m-x2">×2</span>' : ''}</span>
                </span>
                <span class="bl-right">
                    <span class="bl-grade ${gradeClass(s.grade)}">${s.grade === 'MAX' ? icon('crown', 'crown-ico') : ''}${s.grade}</span>
                    <span class="bl-score b30m-pot">${entry.pot.toFixed(3)}</span>
                </span>
            </summary>
            <div class="slide-body">${listDetailHtml(s, { withLegacy: true })}</div>
        </details>`;
}

function render() {
    view.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    const out = view.querySelector('.summary-output');
    if (songs.length === 0) {
        out.innerHTML = '<p class="summary-empty">all.json を読み込むと表示されます。</p>';
        return;
    }
    const mode = MODES.find(m => m.key === state.mode);
    const all = ranked(state.mode);
    const top = all.slice(0, COUNT);
    if (top.length === 0) {
        out.innerHTML = '<p class="summary-empty">プレイした譜面がありません。</p>';
        return;
    }
    // 見出しの数値: 新基準はベスト30平均、旧基準は (ベスト30 + 上位10) ÷ 40
    const main = state.mode === 'old'
        ? { label: '旧基準（最大）', value: oldMaxPotential(all.map(e => e.potOld)) }
        : { label: 'ベスト30平均', value: best30Average(all.map(e => e.potNew)) };
    const facts = [
        `${main.label} <b>${fmtPot(main.value)}</b>`,
        `30位 <b>${fmtPot(top[top.length - 1].pot)}</b>`,
        state.mode === 'old' ? `上位${RECENT_SLOTS}譜面を2倍（リセント枠の代わり）` : 'クリアボーナス込み',
    ];
    const statsHtml = `<div class="b30-stats">
            <div class="b30-main"><small>${main.label}</small><b>${fmtPot(main.value)}</b></div>
            <div class="b30-sub"><span>30位 <b>${fmtPot(top[top.length - 1].pot)}</b></span>
                <span>${state.mode === 'old' ? `上位${RECENT_SLOTS}譜面を2倍で計算（リセント枠をベスト上位10とみなす）` : '単曲ポテンシャルはクリアボーナス込み'}</span></div>
        </div>`;
    out.innerHTML = `
        <div class="capture-wrap">
        <div id="${AREA_ID}" class="summary-capture b30-capture">
            <div class="summary-head">
                <div>
                    <h1>${mode.heading}</h1>
                    <div class="summary-cond">${mode.label}　上位 ${top.length} 譜面</div>
                </div>
                ${profileHtml(profile)}
            </div>
            ${statsHtml}
            <div class="b30-grid">${top.map((e, i) => tileHtml(e, i, state.mode)).join('')}</div>
        </div>
        </div>
        <div class="sm-view">
            <button class="btn-preview b30-preview" type="button">${iconLabel('camera', '画像を作る')}</button>
            <p class="sm-cond">${facts.join('　')}</p>
            <div class="b30-list">${top.map((e, i) => mobileRowHtml(e, i, state.mode)).join('')}</div>
        </div>`;
}

function mount(container) {
    view = container;
    container.innerHTML = `
        <div class="summary-tool b30-tool">
            <div class="summary-controls">
                <div class="summary-control"><span class="summary-label">基準</span><div class="chips">
                    ${MODES.map(m => `<button type="button" class="chip" data-mode="${m.key}">${m.label}</button>`).join('')}</div></div>
                <button type="button" class="btn-summary-export">${iconLabel('camera', '画像を保存')}</button>
                <p class="summary-note">新基準: クリアボーナス(+0.2)込みの単曲ポテンシャルで上位30。旧基準: ボーナスなしで並べ、上位10を2倍して ÷40 した値(ゲームの旧方式で、リセント枠をベスト上位10とみなしたもの)。</p>
            </div>
            <div class="summary-output"></div>
        </div>`;
    container.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const mode = MODES.find(m => m.key === state.mode);
        if (b.dataset.mode) { state.mode = b.dataset.mode; render(); }
        else if (!document.getElementById(AREA_ID)) return;
        else if (b.classList.contains('btn-summary-export')) exportImage(AREA_ID, mode.file, b, profile);
        else if (b.classList.contains('b30-preview')) openPreview(AREA_ID, mode.file, `ベスト30（${mode.label}）`, profile);
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
    id: 'best30',
    label: 'ベスト30',
    icon: 'podium',
    description: '単曲ポテンシャル上位30譜面をジャケット付きの画像にします。新基準と旧基準(リセント枠を上位10とみなした値)を切り替えられます。',
    mount,
    update,
};
