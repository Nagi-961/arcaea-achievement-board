import { loadMaster } from './master.js';
import { normalizeData, mergeData, saveData, loadSavedData } from './storage.js';
import { exportImage, exportJson } from './export.js';
import { loadHistory, recordHistory, importHistory } from './history.js';
import { renderBoard, handleCoverError, isCoversOff, setCoversOff, handleListTab, handleStyleSwitch, loadCoverList } from './board.js';
import { openPreview } from './preview.js';
import { gradeOfRecord } from './calc.js';
import { icon, iconLabel, mountIcons } from './icons.js';
import { enableDetailsSlide } from './motion.js';
import achievement from './features/achievement.js';
import summary from './features/summary.js';
import growth from './features/growth.js';
import target from './features/target.js';
import howto, { mountHowto } from './features/howto.js';

// 機能を追加するときは js/features/ にファイルを作ってここに並べる
// mount を持つ機能は最初に一度だけ描画し、スコアが変わると update(全譜面, プロフィール) が呼ばれる
// mount を持たない機能は表(renderBoard)として描画する
// description を持つ機能はトップページにツールとして並べる
// needsData: false の機能は all.json なしでも開ける。setMaster(楽曲マスタ) はマスタの読み込み後に呼ばれる
const FEATURES = [achievement, summary, growth, target, howto];
const BOARD_FEATURES = FEATURES.filter(f => !f.mount);
const TOOL_FEATURES = FEATURES.filter(f => f.description);
// ジャケットの表に載せるのは定数10.0以上の譜面
const MIN_CONSTANT = 10.0;

const diffMap = { 0: "PST", 1: "PRS", 2: "FTR", 3: "BYD", 4: "ETR" };

let masterData = [];
let playerProfile = null;
let currentData = null;
// 表(renderBoard)に載せる譜面。表示を切り替えたときの描き直しに使う
let boardSongs = [];
let currentMode = null;
// データ読み込み前に選んだツール。読み込みが終わったらそれを開く
let pendingMode = null;

// 状態メッセージ: 先頭にアイコン、本文は文字として入れる(プレイヤー名を含むので innerHTML にしない)
function setStatus(el, iconName, text) {
    el.innerHTML = icon(iconName, 'status-ico');
    el.append(text);
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
        // record: 自己ベストの判定内訳（スコア目標計算機で使う）
        const record = rec && rec.score > 0 ? {
            score: rec.score, pure: rec.perfect_count || 0, far: rec.near_count || 0,
            lost: rec.miss_count || 0, shiny: rec.shiny_perfect_count || 0,
            time_played: rec.time_played, clear: rec.best_clear_type ?? rec.clear_type ?? 0,
        } : null;
        return { ...song, grade: gradeOfRecord(rec), scoreVal: rec ? rec.score || 0 : 0, record };
    });
}

function switchMode(mode) {
    currentMode = mode;
    FEATURES.forEach(f => {
        document.getElementById(`view-${f.id}`).style.display = f.id === mode ? 'block' : 'none';
        document.getElementById(`tab-${f.id}`).classList.toggle('active', f.id === mode);
    });
    const current = FEATURES.find(f => f.id === mode);
    document.getElementById('menu-current').innerHTML = current ? iconLabel(current.icon, current.label) : '';
}

// スマホ幅の ☰ メニュー
function setMenuOpen(open) {
    document.getElementById('tab-menu').classList.toggle('open', open);
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
    // ドロワーを開いている間は後ろのページをスクロールさせない
    document.body.classList.toggle('menu-open', open);
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
    if (currentData || FEATURES.find(f => f.id === mode)?.needsData === false) {
        openTool(mode);
        return;
    }
    pendingMode = mode;
    const panel = document.getElementById('data-panel');
    setStatus(document.getElementById('home-data-status'), 'alert', "先に all.json を選択してください。読み込むとツールが開きます。");
    panel.classList.add('attention');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderBoardView(f) {
    document.getElementById(`view-${f.id}`).innerHTML = renderBoard(boardSongs, playerProfile, f);
}

function showData(data, savedAt) {
    const collectedAt = data.profile && data.profile.last_updated;
    currentData = data;
    playerProfile = data.profile;

    const allSongs = mergeScores(data.scores);
    boardSongs = allSongs.filter(m => m.constant >= MIN_CONSTANT);
    BOARD_FEATURES.forEach(renderBoardView);
    FEATURES.forEach(f => f.update?.(allSongs, playerProfile));

    const status = savedAt
        ? "最終更新: " + (collectedAt || new Date(savedAt).toLocaleString('ja-JP'))
        : "ブラウザに未保存";
    document.getElementById('data-status').textContent = status;
    const name = data.profile && data.profile.name;
    setStatus(document.getElementById('home-data-status'), 'check',
        `${name ? name + " さんの" : ""}データを読み込み済み（${status}）。ツールを選んでください。`);
    document.getElementById('data-panel').classList.remove('attention');
    // 更新時は開いているタブをそのまま維持する
    if (currentMode) switchMode(currentMode);
}

// 読み込んだ JSON(ファイル or collect.js から受信)を保存済みデータと合体して表示する。成功したら true
function importRaw(raw) {
    const data = normalizeData(raw);
    if (!data) {
        alert("JSONの読み込みに失敗しました。");
        return false;
    }
    const merged = mergeData(currentData, data);
    if (!merged && !confirm("保存済みのデータとは別のユーザーのデータです。置き換えますか？")) return false;
    // 成長記録用の履歴。バックアップに履歴が入っていれば先に合体する
    importHistory(raw && raw.history, data.profile && data.profile.user_code);
    recordHistory(data);
    const result = merged || data;
    const savedAt = saveData(result);
    showData(result, savedAt);
    if (!savedAt) alert("ブラウザへの保存に失敗しました。次回もファイルの選択が必要です。");
    return true;
}

function handleScoreFile(e) {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        // 同じファイルを続けて選んでも change が発火するように空にする
        input.value = '';
        let raw = null;
        try {
            raw = JSON.parse(event.target.result);
        } catch (err) {
            // importRaw が失敗を知らせる
        }
        if (!importRaw(raw)) return;
        // トップページから読み込んだときは、選んでいたツール(なければ最初のツール)を開く
        if (input.id === 'json-input') openTool(pendingMode || TOOL_FEATURES[0].id);
        pendingMode = null;
    };
    reader.readAsText(file);
}

// collect.js の「サイトに送る」で開かれたとき(#import)は、開いた側に合図を送ってデータを受け取る
// データは Arcaea Online(lowiro.com)からのものだけ受け付ける
const COLLECT_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*lowiro\.com$/;

function listenForCollect() {
    if (location.hash !== '#import') return;
    history.replaceState(null, '', location.pathname + location.search);
    const opener = window.opener;
    const status = document.getElementById('home-data-status');
    if (!opener) {
        setStatus(status, 'alert', "Arcaea Online のタブが見つかりませんでした。もう一度「サイトに送る」を押すか、ファイルで読み込んでください。");
        return;
    }
    setStatus(status, 'download', "Arcaea Online からデータを受け取っています...");
    let done = false;
    // 合図自体はデータを含まないので、送り先を限定しない(Arcaea Online のアドレスが変わっても動くように)
    const ping = () => { try { opener.postMessage({ type: 'arcaea-ready' }, '*'); } catch (err) { /* タブが閉じられた */ } };
    const timer = setInterval(() => { if (!done) ping(); }, 700);
    setTimeout(() => {
        clearInterval(timer);
        if (!done) setStatus(status, 'alert', "データを受け取れませんでした。Arcaea Online のタブで「サイトに送る」をもう一度押すか、ファイルで読み込んでください。");
    }, 30000);
    window.addEventListener('message', e => {
        if (done || e.source !== opener || !COLLECT_ORIGIN.test(e.origin)) return;
        if (!e.data || e.data.type !== 'arcaea-data') return;
        done = true;
        clearInterval(timer);
        opener.postMessage({ type: 'arcaea-received' }, e.origin);
        if (importRaw(e.data.data)) setStatus(status, 'check', "Arcaea Online から受け取りました。" + status.textContent);
    });
    ping();
}

function buildViews() {
    setCoversOff(isCoversOff());
    const tabButtons = document.getElementById('tab-buttons');
    const appContent = document.getElementById('app-content');
    FEATURES.forEach(f => {
        f.init?.();

        const tab = document.createElement('button');
        tab.id = `tab-${f.id}`;
        tab.className = 'tab-btn';
        tab.innerHTML = iconLabel(f.icon, f.label);
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
                if (e.target.closest('.btn-cover-toggle')) setCoversOff(!isCoversOff());
                // ランク表示 / スコア表示の切り替え
                if (handleStyleSwitch(e, f)) { renderBoardView(f); return; }
                // スマホ幅のリスト: レベル帯のタブと、画像のプレビュー
                if (handleListTab(e, f.id)) return;
                const preview = e.target.closest('.btn-preview');
                if (preview) openPreview(preview.dataset.area, preview.dataset.filename, preview.dataset.label, playerProfile);
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
        title.innerHTML = iconLabel(f.icon, f.label);
        // 背景に大きく薄く透かすアイコン
        const mark = document.createElement('span');
        mark.className = 'tool-card-mark';
        mark.innerHTML = icon(f.icon);
        const desc = document.createElement('span');
        desc.className = 'tool-card-desc';
        desc.textContent = f.description;
        card.append(mark, title, desc);
        card.addEventListener('click', () => selectTool(f.id));
        cards.appendChild(card);
    });
}

async function main() {
    mountIcons();
    enableDetailsSlide();
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
    document.getElementById('menu-backdrop').addEventListener('click', () => setMenuOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenuOpen(false); });
    document.getElementById('btn-backup').addEventListener('click', () => {
        // バックアップには成長記録の履歴も入れる
        if (currentData) exportJson({ ...currentData, history: loadHistory() });
    });
    const jsonInput = document.getElementById('json-input');
    const masterStatus = document.getElementById('master-status');
    try {
        // ジャケット一覧はマスタと並行して読む(失敗しても表示はできる)
        [masterData] = await Promise.all([loadMaster(), loadCoverList()]);
    } catch (err) {
        console.error(err);
        setStatus(masterStatus, 'alert', "楽曲データ(data/master.csv)を読み込めませんでした。");
        masterStatus.classList.add('error');
        return;
    }
    masterStatus.textContent = '';
    FEATURES.forEach(f => f.setMaster?.(masterData));
    jsonInput.disabled = false;
    jsonInput.addEventListener('change', handleScoreFile);
    document.getElementById('json-update-input').addEventListener('change', handleScoreFile);

    // 保存済みデータがあれば、ファイルを選ばずにツールを開けるようにしておく
    const savedData = loadSavedData();
    if (savedData) {
        // 成長記録の機能より前から使っている人は、保存済みのデータで履歴を始める
        if (!loadHistory()) recordHistory(savedData);
        showData(savedData, savedData.savedAt);
    }
    listenForCollect();
}

main();
