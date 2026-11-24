// 楽曲マスタ(data/master.csv)の読み込み。不正な行は console に警告して読み飛ばす

const MASTER_URL = 'data/master.csv';
const COLUMNS = ['song_id', 'title', 'difficulty', 'level', 'constant'];
const DIFFICULTIES = ['PST', 'PRS', 'FTR', 'BYD', 'ETR', 'INS'];
const LEVEL_PATTERN = /^\d+\+?$/;

// タイトルに「,」や「"」を含む行があるので、引用符つきのフィールドにも対応する
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field); field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row);
            row = []; field = '';
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

function validateRow(row) {
    if (!row.song_id) return 'song_id が空';
    if (!DIFFICULTIES.includes(row.difficulty)) return `difficulty が不正 (${row.difficulty})`;
    if (!LEVEL_PATTERN.test(row.level)) return `level が不正 (${row.level})`;
    if (!Number.isFinite(Number(row.constant))) return `constant が不正 (${row.constant})`;
    return null;
}

export async function loadMaster() {
    const res = await fetch(MASTER_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${MASTER_URL} の取得に失敗しました (${res.status})`);
    const text = (await res.text()).replace(/^﻿/, '');
    const [header, ...lines] = parseCsv(text);

    const missing = COLUMNS.filter(col => !header.includes(col));
    if (missing.length > 0) throw new Error(`${MASTER_URL} に列がありません: ${missing.join(', ')}`);

    const songs = [];
    const seen = new Set();
    let unfilled = 0;
    lines.forEach((cells, i) => {
        if (cells.every(c => c.trim() === '')) return;
        const lineNo = i + 2;
        const row = {};
        header.forEach((col, j) => { row[col] = (cells[j] ?? '').trim(); });

        // 定数が未入力の行(新曲の入力待ち)はまとめて件数だけ警告する
        if (row.constant === '' && row.level === '') { unfilled++; return; }

        const error = validateRow(row);
        if (error) {
            console.warn(`master.csv ${lineNo}行目: ${error}`, row);
            return;
        }
        const key = row.song_id + '_' + row.difficulty;
        if (seen.has(key)) {
            console.warn(`master.csv ${lineNo}行目: ${key} が重複しています`, row);
            return;
        }
        seen.add(key);
        songs.push({
            song_id: row.song_id,
            title: row.title || row.song_id,
            difficulty: row.difficulty,
            level: row.level,
            constant: Number(row.constant),
        });
    });
    if (unfilled > 0) console.warn(`master.csv: レベル・定数が未入力の行が ${unfilled} 件あります`);
    return songs;
}
