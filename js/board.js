// 実績ランク表・スコア特化表で共通の、集計表とジャケットタイルの描画

export const diffColors = { "FTR": "#9932cc", "ETR": "#d8bfd8", "BYD": "#dc143c", "INS": "#1e90ff", "PST": "#4fc3f7", "PRS": "#81c784" };
const gradeColors = {
    "MAX": { color: "#ffdf00", bg: "#000000", shadow: "0 0 8px #ffdf00" },
    "PM":  { color: "#ffd700", bg: "#000000", shadow: "0 0 5px #ffd700" },
    "EX+": { color: "#00ffff", bg: "#000000", shadow: "0 0 4px #00ffff" },
    "EX":  { color: "#32cd32", bg: "#000000", shadow: "0 0 4px #32cd32" },
    "AA":  { color: "#ff4c4c", bg: "#000000", shadow: "none" },
    "NO PLAY": { color: "#777777", bg: "#000000", shadow: "none" }
};

// 画像1枚ごとの区切り。levels が null のものは残り全部(Level 10)
const SECTIONS = [
    { key: '11', label: 'Level 11〜12', levels: ['11', '11+', '12'] },
    { key: '10p', label: 'Level 10+', levels: ['10+'] },
    { key: '10', label: 'Level 10', levels: null },
];

const COVER_DIR = 'covers';

export function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '-';
    return div.innerHTML;
}

export function gradeColor(grade) {
    if (gradeColors[grade]) return gradeColors[grade];
    if (["A", "B", "C", "D"].includes(grade)) return gradeColors["AA"];
    return gradeColors["NO PLAY"];
}

export function compareTitle(a, b) {
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
}

export function levelSortKey(lvl) { return parseFloat(lvl.replace('+', '.5')) || 0; }

// 保存画像のヘッダーに載せるプロフィール（旧形式のデータでは表示しない）
export function profileHtml(profile) {
    if (!profile) return '';
    const rating = Number.isFinite(profile.rating) && profile.rating >= 0 ? (profile.rating / 1000).toFixed(3) : '--';
    return `<div class="profile-info">
                <span class="profile-name">${escapeHtml(profile.name)}</span>
                <span class="profile-rating">Rating ${rating}</span>
                <span>Friend Code: ${escapeHtml(profile.user_code)}</span>
                <span>Updated: ${escapeHtml(profile.last_updated)}</span>
            </div>`;
}

function summaryTableHtml(songs) {
    const summaryData = {};
    songs.forEach(song => {
        const lvl = song.level;
        if (!summaryData[lvl]) summaryData[lvl] = { "MAX": 0, "PM": 0, "EX+": 0, "EX": 0, "AA": 0, "A": 0, "B-D": 0, "NP": 0, "Total": 0 };
        const row = summaryData[lvl];
        row.Total++;
        const g = song.grade;
        if (row[g] !== undefined) row[g]++;
        else if (["B", "C", "D"].includes(g)) row["B-D"]++;
        else if (g === "NO PLAY") row["NP"]++;
    });

    const fmt = v => v > 0 ? v : '<span style="color:#444;">-</span>';
    let html = `<table class="summary-table"><tr><th>Lv</th><th style="color:#ffdf00;">MAX</th><th style="color:#ffd700;">PM</th><th style="color:#00ffff;">EX+</th><th style="color:#32cd32;">EX</th><th style="color:#ff4c4c;">AA</th><th style="color:#ff4c4c;">A</th><th style="color:#ff4c4c;">B-D</th><th style="color:#777777;">NP</th><th>Total</th><th>EX+↑</th></tr>`;
    Object.keys(summaryData).sort((a, b) => levelSortKey(a) - levelSortKey(b)).forEach(lvl => {
        const row = summaryData[lvl];
        const total = row.Total;
        const exPlus = row.MAX + row.PM + row["EX+"];
        const rate = total > 0 ? (exPlus / total * 100).toFixed(1) : 0;
        html += `<tr><td class="lvl-col">${lvl}</td><td style="color:#ffdf00; text-shadow:0 0 5px #ffdf00;">${fmt(row.MAX)}</td><td style="color:#ffd700;">${fmt(row.PM)}</td><td style="color:#00ffff;">${fmt(row['EX+'])}</td><td style="color:#32cd32;">${fmt(row.EX)}</td><td style="color:#ff4c4c;">${fmt(row.AA)}</td><td style="color:#ff4c4c;">${fmt(row.A)}</td><td style="color:#ff4c4c;">${fmt(row['B-D'])}</td><td style="color:#777777;">${fmt(row.NP)}</td><td>${total}</td><td class="rate">${rate}%</td></tr>`;
    });
    return html + `</table>`;
}

function tileHtml(song, feature) {
    const gColor = gradeColor(song.grade);
    const dColor = diffColors[song.difficulty] || "#444";
    const noplayCls = song.scoreVal === 0 ? " noplay" : "";
    const title = escapeHtml(song.title);
    // 見つからなければ handleCoverError が {song_id}.png → default.png の順に差し替える
    const src = `${COVER_DIR}/${encodeURIComponent(song.song_id)}_${song.difficulty}.png`;
    return `
        <div class="tile${noplayCls}" style="border-color: ${dColor};">
            <img src="${src}" class="jacket" alt="${title}" data-song-id="${escapeHtml(song.song_id)}">
            ${feature.tileBar(song, gColor)}
            <div class="overlay"><div class="o-title">${title}</div>${feature.overlayInfo(song, gColor)}</div>
        </div>`;
}

// feature: { id, heading, sectionSuffix, sortSongs, tileBar, overlayInfo }
export function renderBoard(songs, profile, feature) {
    const summaryHtml = summaryTableHtml(songs);
    let areasHtml = '';

    SECTIONS.forEach(sec => {
        const sectionSongs = songs.filter(song => sec.levels ? sec.levels.includes(song.level)
            : !SECTIONS.some(s => s.levels && s.levels.includes(song.level)));
        if (sectionSongs.length === 0) return;

        const areaId = `${feature.id}-area-${sec.key}`;

        const grouped = {};
        sectionSongs.forEach(song => { (grouped[song.constant] ??= []).push(song); });

        // 保存ボタンは画像に写らないよう、保存範囲(capture-area)の外の真上に置く
        areasHtml += `<div class="board-section">
                        <button class="btn-export" data-area="${areaId}" data-filename="arcaea_${feature.id}_${sec.key}.png">📷 ${sec.label} を保存</button>
                        <div id="${areaId}" class="capture-area">
                        <div class="header-container">
                            <div>
                                <h1>${feature.heading} <span class="title-sub">[${sec.label}${feature.sectionSuffix}]</span></h1>
                                ${profileHtml(profile)}
                            </div>
                            ${summaryHtml}
                        </div>`;
        Object.keys(grouped).map(Number).sort((a, b) => b - a).forEach(c => {
            areasHtml += `<div class="constant-section"><div class="constant-header">CC: ${c.toFixed(1)}</div><div class="tile-container">`;
            grouped[c].sort(feature.sortSongs).forEach(song => { areasHtml += tileHtml(song, feature); });
            areasHtml += `</div></div>`;
        });
        areasHtml += `</div></div>`;
    });

    return areasHtml;
}

// error イベントはバブリングしないので、ビューに capture で登録して使う
export function handleCoverError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('jacket')) return;
    const stage = img.dataset.fallback || '';
    if (stage === '') {
        img.dataset.fallback = 'song';
        img.src = `${COVER_DIR}/${encodeURIComponent(img.dataset.songId)}.png`;
    } else if (stage === 'song') {
        img.dataset.fallback = 'default';
        img.src = `${COVER_DIR}/default.png`;
    }
}
