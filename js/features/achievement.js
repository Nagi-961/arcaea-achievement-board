// 実績表: 定数ごとにジャケットを並べる表。「ランク表示」と「スコア表示」を上部のチップで切り替える
// (以前の実績ランク表・スコア特化表をまとめたもの。描画は js/board.js の renderBoard が行う)
import { compareTitle } from '../board.js';

// 等幅フォントの字幅は端末ごとに違うので、最長のスコアがタイルに収まるサイズを計算する
function fitScoreFont() {
    const maxSize = 18, maxWidth = 92;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `bold ${maxSize}px monospace`;
    const width = ctx.measureText('10,001,135').width;
    const size = Math.min(maxSize, maxSize * maxWidth / width);
    document.documentElement.style.setProperty('--score-font-size', size + 'px');
}

// 表示の種類。key は保存画像のファイル名(arcaea_{key}_...)にも使う
const STYLES = {
    rank: {
        key: 'rank',
        label: 'ランク',
        icon: 'rank',
        heading: 'Arcaea Achievement',
        sectionSuffix: '',
        // タイルにランク、ホバーでスコア。曲名順
        sortSongs: compareTitle,
        tileBar: (song, gColor) =>
            `<div class="grade" style="background: ${gColor.bg}; color: ${gColor.color}; text-shadow: ${gColor.shadow};">${song.grade}</div>`,
        overlayInfo: song =>
            `<div class="o-score">${song.scoreVal > 0 ? song.scoreVal.toLocaleString() : "---"}</div>`,
    },
    score: {
        key: 'score',
        label: 'スコア',
        icon: 'score',
        heading: 'Arcaea Score Board',
        sectionSuffix: ' (Score)',
        // タイルにスコア、ホバーでランク。スコアの高い順
        sortSongs: (a, b) => b.scoreVal - a.scoreVal || compareTitle(a, b),
        tileBar: (song, gColor) =>
            `<div class="score-bar" style="background: ${gColor.bg}; color: ${gColor.color}; text-shadow: ${gColor.shadow};">${song.scoreVal > 0 ? song.scoreVal.toLocaleString() : "---"}</div>`,
        overlayInfo: (song, gColor) =>
            `<div class="o-rank" style="color:${gColor.color};">${song.grade}</div>`,
    },
};

// 選んだ表示はブラウザに覚えさせる
const STYLE_KEY = 'arcaea_board_style_v1';
let styleKey = (() => {
    try { return STYLES[localStorage.getItem(STYLE_KEY)] ? localStorage.getItem(STYLE_KEY) : 'rank'; } catch { return 'rank'; }
})();

export default {
    id: 'board',
    label: '実績表',
    icon: 'rank',
    description: '定数ごとにジャケットを並べて、各譜面のランクやスコアを一覧にします。ランク表示とスコア表示を切り替えられます。',
    init: fitScoreFont,
    styles: Object.values(STYLES),
    get style() { return STYLES[styleKey]; },
    setStyle(key) {
        if (!STYLES[key]) return;
        styleKey = key;
        try { localStorage.setItem(STYLE_KEY, key); } catch { /* 保存できなくても切り替えはする */ }
    },
};
