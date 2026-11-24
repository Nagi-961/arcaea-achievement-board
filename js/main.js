import { loadMaster } from './master.js';
import { normalizeData, mergeData, saveData, loadSavedData } from './storage.js';
import { exportImage, exportJson } from './export.js';
import { renderBoard, handleCoverError } from './board.js';
import rank from './features/rank.js';
import score from './features/score.js';
import summary from './features/summary.js';
import howto, { mountHowto } from './features/howto.js';

// 機能を追加するときは js/features/ にファイルを作ってここに並べる
// mount を持つ機能は最初に一度だけ描画し、スコアが変わると update(全譜面, プロフィール) が呼ばれる
// mount を持たない機能は表(renderBoard)として描画する
// description を持つ機能はトップページにツールとして並べる
const FEATURES = [rank, score, summary, howto];
const BOARD_FEATURES = FEATURES.filter(f => !f.mount);
const TOOL_FEATURES = FEATURES.filter(f => f.description);
// ジャケットの表に載せるのは定数10.0以上の譜面
const MIN_CONSTANT = 10.0;

const diffMap = { 0: "PST", 1: "PRS", 2: "FTR", 3: "BYD", 4: "ETR" };

let masterData = [];
let playerProfile = null;
let currentData = null;
let currentMode = null;
// データ読み込み前に選んだツール。読み込みが終わったらそれを開く
let pendingMode = null;

function calcGrade(rec) {
    const score = rec ? rec.score || 0 : 0;
    if (score <= 0) return "NO PLAY";
    if (rec.clear_type === 3) {
        const totalNotes = (rec.perfect_count || 0) + (rec.near_count || 0) + (rec.miss_count || 0);
        return (totalNotes > 0 && score >= 10000000 + totalNotes) ? "MAX" : "PM";
    }
    if (score >= 9900000) return "EX+";
    if (score >= 9800000) return "EX";
    if (score >= 9500000) return "AA";
    if (score >= 9200000) return "A";
    if (score >= 8900000) return "B";
    if (score >= 8600000) return "C";
    return "D";
}

// マスタの各譜面にスコアとランクを付ける
function mergeScores(scoreList) {
    // all.json では BYD と INS がどちらも difficulty 3 なので、マスタで INS の曲は INS として扱う
    const insSongs = new Set(masterData.filter(m => m.difficulty === "INS").map(m => m.song_id));
    const scoreDict = {};
    scoreList.forEach(s => {
        let diffStr = diffMap[s.difficulty] || String(s.difficulty);
        if (s.difficulty === 3 && insSongs.has(s.song_id)) diffStr = "INS";
        scoreDict[s.song_id + "_" + diffStr] = s;
    });

    return masterData.map(song => {
        const rec = scoreDict[song.song_id + "_" + song.difficulty];
        return { ...song, grade: calcGrade(rec), scoreVal: rec ? rec.score || 0 : 0 };
    });
}

function switchMode(mode) {
    currentMode = mode;
    FEATURES.forEach(f => {
        document.getElementById(`view-${f.id}`).style.display = f.id === mode ? 'block' : 'none';
        document.getElementById(`tab-${f.id}`).classList.toggle('active', f.id === mode);
    });
    document.getElementById('menu-current').textContent = FEATURES.find(f => f.id === mode)?.label || '';
}

// スマホ幅の ☰ メニュー
function setMenuOpen(open) {
    document.getElementById('tab-menu').classList.toggle('open', open);
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
}

function showHome() {
    document.getElementById('home').style.display = 'block';
    document.getElementById('tab-menu').style.display = 'none';
    document.getElementById('app-content').style.display = 'none';
    window.scrollTo(0, 0);
}

function openTool(mode) {
    document.getElementById('home').style.display = 'none';
    document.getElementById('tab-menu').style.display = 'flex';
    document.getElementById('app-content').style.display = 'block';
    switchMode(mode);
    window.scrollTo(0, 0);
}

// データがなければ、先に all.json を選んでもらう
function selectTool(mode) {
    if (currentData) {
        openTool(mode);
        return;
    }
    pendingMode = mode;
    const panel = document.getElementById('data-panel');
    document.getElementById('home-data-status').textContent = "⚠️ 先に all.json を選択してください。読み込むとツールが開きます。";
    panel.classList.add('attention');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showData(data, savedAt) {
    const collectedAt = data.profile && data.profile.last_updated;
    currentData = data;
    playerProfile = data.profile;

    const allSongs = mergeScores(data.scores);
    const boardSongs = allSongs.filter(m => m.constant >= MIN_CONSTANT);
    BOARD_FEATURES.forEach(f => {
        document.getElementById(`view-${f.id}`).innerHTML = renderBoard(boardSongs, playerProfile, f);
    });
    FEATURES.forEach(f => f.update?.(allSongs, playerProfile));

    const status = savedAt
        ? "最終更新: " + (collectedAt || new Date(savedAt).toLocaleString('ja-JP'))
        : "⚠️ ブラウザに未保存";
    document.getElementById('data-status').textContent = status;
    const name = data.profile && data.profile.name;
    document.getElementById('home-data-status').textContent =
        `✅ ${name ? name + " さんの" : ""}データを読み込み済み（${status}）。ツールを選んでください。`;
    document.getElementById('data-panel').classList.remove('attention');
    // 更新時は開いているタブをそのまま維持する
    if (currentMode) switchMode(currentMode);
}

function handleScoreFile(e) {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        // 同じファイルを続けて選んでも change が発火するように空にする
        input.value = '';
        let data;
        try {
            data = normalizeData(JSON.parse(event.target.result));
        } catch (err) {
            data = null;
        }
        if (!data) {
            alert("JSONファイルの読み込みに失敗しました。");
            return;
        }
        const merged = mergeData(currentData, data);
        if (merged) {
            data = merged;
        } else if (!confirm("保存済みのデータとは別のユーザーのデータです。置き換えますか？")) {
            return;
        }
        const savedAt = saveData(data);
        showData(data, savedAt);
        // トップページから読み込んだときは、選んでいたツール(なければ最初のツール)を開く
        if (input.id === 'json-input') openTool(pendingMode || TOOL_FEATURES[0].id);
        pendingMode = null;
        if (!savedAt) alert("ブラウザへの保存に失敗しました。次回もファイルの選択が必要です。");
    };
    reader.readAsText(file);
}

function buildViews() {
    const tabButtons = document.getElementById('tab-buttons');
    const appContent = document.getElementById('app-content');
    FEATURES.forEach(f => {
        f.init?.();

        const tab = document.createElement('button');
        tab.id = `tab-${f.id}`;
        tab.className = 'tab-btn';
        tab.textContent = f.label;
        tab.addEventListener('click', () => switchMode(f.id));
        tabButtons.appendChild(tab);

        const view = document.createElement('div');
        view.id = `view-${f.id}`;
        view.style.display = 'none';
        if (f.mount) {
            f.mount(view);
        } else {
            view.addEventListener('click', e => {
                const btn = e.target.closest('.btn-export');
                if (btn) exportImage(btn.dataset.area, btn.dataset.filename, btn, playerProfile);
            });
            view.addEventListener('error', handleCoverError, true);
        }
        appContent.appendChild(view);
    });
}

function buildToolCards() {
    const cards = document.getElementById('tool-cards');
    TOOL_FEATURES.forEach(f => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'tool-card';
        const title = document.createElement('span');
        title.className = 'tool-card-title';
        title.textContent = f.label;
        const desc = document.createElement('span');
        desc.className = 'tool-card-desc';
        desc.textContent = f.description;
        card.append(title, desc);
        card.addEventListener('click', () => selectTool(f.id));
        cards.appendChild(card);
    });
}

async function main() {
    buildViews();
    buildToolCards();
    mountHowto(document.getElementById('upload-howto'));
    document.getElementById('btn-home').addEventListener('click', showHome);
    const menuToggle = document.getElementById('menu-toggle');
    menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
    // メニューの項目を選んだら閉じる（ファイル選択は選び終わってから閉じる）
    const menuItems = document.getElementById('menu-items');
    menuItems.addEventListener('click', e => {
        if (e.target.closest('button')) setMenuOpen(false);
    });
    menuItems.addEventListener('change', () => setMenuOpen(false));
    document.getElementById('btn-backup').addEventListener('click', () => {
        if (currentData) exportJson(currentData);
    });
    const jsonInput = document.getElementById('json-input');
    const masterStatus = document.getElementById('master-status');
    try {
        masterData = await loadMaster();
    } catch (err) {
        console.error(err);
        masterStatus.textContent = "❌ 楽曲データ(data/master.csv)を読み込めませんでした。";
        masterStatus.classList.add('error');
        return;
    }
    masterStatus.textContent = '';
    jsonInput.disabled = false;
    jsonInput.addEventListener('change', handleScoreFile);
    document.getElementById('json-update-input').addEventListener('change', handleScoreFile);

    // 保存済みデータがあれば、ファイルを選ばずにツールを開けるようにしておく
    const savedData = loadSavedData();
    if (savedData) showData(savedData, savedData.savedAt);
}

main();
