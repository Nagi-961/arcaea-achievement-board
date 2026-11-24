// スコア特化表: タイルにスコアを表示し、スコア降順に並べる
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

export default {
    id: 'score',
    label: '🔢 スコア特化表',
    description: '定数ごとにスコアの高い順で並べて、スコアそのものを一覧にします。',
    heading: 'Arcaea Score Board',
    sectionSuffix: ' (Score)',
    init: fitScoreFont,
    sortSongs: (a, b) => b.scoreVal - a.scoreVal || compareTitle(a, b),
    tileBar: (song, gColor) =>
        `<div class="score-bar" style="background: ${gColor.bg}; color: ${gColor.color}; text-shadow: ${gColor.shadow};">${song.scoreVal > 0 ? song.scoreVal.toLocaleString() : "---"}</div>`,
    overlayInfo: (song, gColor) =>
        `<div class="o-rank" style="color:${gColor.color};">${song.grade}</div>`,
};
