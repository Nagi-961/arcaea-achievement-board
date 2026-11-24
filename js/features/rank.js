// 実績ランク表: タイルにランクを表示し、曲名順に並べる
import { compareTitle } from '../board.js';

export default {
    id: 'rank',
    label: '🎖️ 実績ランク表',
    description: '定数ごとにジャケットを並べて、各譜面のランク（PM・EX+ など）を一覧にします。',
    heading: 'Arcaea Achievement',
    sectionSuffix: '',
    sortSongs: compareTitle,
    tileBar: (song, gColor) =>
        `<div class="grade" style="background: ${gColor.bg}; color: ${gColor.color}; text-shadow: ${gColor.shadow};">${song.grade}</div>`,
    overlayInfo: song =>
        `<div class="o-score">${song.scoreVal > 0 ? song.scoreVal.toLocaleString() : "---"}</div>`,
};
