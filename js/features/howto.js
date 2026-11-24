// 取得方法: collect.js を呼ぶブックマークレットの選択・コピーと、登録・実行手順の説明

const MODES = [
    { key: 'std', label: 'FTR・BYD・ETR（従来）' },
    { key: 'all', label: '全難易度' },
    { key: '0', label: 'PSTのみ' },
    { key: '1', label: 'PRSのみ' },
    { key: '2', label: 'FTRのみ' },
    { key: '3', label: 'BYD/INSのみ' },
    { key: '4', label: 'ETRのみ' },
];
const ARCAEA_ONLINE_URL = 'https://arcaea.lowiro.com/';

// 公開中のURLから collect.js の場所を決める（ローカル確認時は localhost を指す）
function bookmarkletCode(modeKey) {
    const src = new URL('collect.js', location.href).href;
    return `javascript:(()=>{const s=document.createElement('script');s.src='${src}?d=${modeKey}&t='+Date.now();document.body.appendChild(s)})();`;
}

async function copyText(text, textarea) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // clipboard API が使えない環境向け
        textarea.select();
        return document.execCommand('copy');
    }
}

const HOWTO_HTML = `
    <div class="howto">
        <h2>📥 all.json の取り方</h2>
        <p class="howto-note">Arcaea Online にログインした状態で、ブックマークに登録したコードを実行します。PC・スマホどちらでも使えます。</p>

        <h3>1. 取得する難易度を選んで、コードをコピー</h3>
        <div class="howto-modes"></div>
        <textarea class="howto-code" readonly rows="3"></textarea>
        <button type="button" class="howto-copy">📋 コードをコピー</button>
        <p class="howto-note">一部の難易度だけ取っても、前回までに取った分と合体して保存されます（同じブラウザで取得した場合）。
            このサイトに読み込んだときも、保存済みのデータと合体します。</p>

        <h3>2. ブックマークに登録</h3>
        <ul>
            <li><b>iPhone（Safari）</b>: 適当なページで共有ボタン →「ブックマークを追加」で保存 → ブックマーク一覧の「編集」からそのブックマークを開き、アドレスをコピーしたコードに置き換える</li>
            <li><b>Android（Chrome）</b>: 適当なページでメニューの ☆ でブックマーク → 「編集」で URL をコピーしたコードに置き換える</li>
            <li><b>PC</b>: ブックマークバーに適当なページを登録し、URL をコピーしたコードに置き換える</li>
        </ul>
        <p class="howto-note">名前は「arcaea取得」のように、入力しやすい短い名前がおすすめです。</p>

        <h3>3. Arcaea Online にログイン</h3>
        <p><a href="${ARCAEA_ONLINE_URL}" target="_blank" rel="noopener">${ARCAEA_ONLINE_URL}</a> を開いてログインします。</p>

        <h3>4. ブックマークを実行</h3>
        <ul>
            <li><b>iPhone</b>: Arcaea Online を開いたまま、ブックマーク一覧から登録したブックマークをタップ</li>
            <li><b>Android</b>: アドレスバーに登録した名前（例: arcaea取得）を入力し、候補に出てきたブックマーク（☆のもの）をタップ</li>
            <li><b>PC</b>: ブックマークバーのブックマークをクリック</li>
        </ul>

        <h3>5. 保存して読み込む</h3>
        <p>取得が終わったら「📥 保存」で all.json を保存し、このサイトの「📂 all.json を選択」または「🔄 データ更新」から読み込みます。</p>
    </div>`;

// 最初の画面とタブの両方で使えるよう、渡された要素の中に説明を作る
export function mountHowto(container) {
    container.innerHTML = HOWTO_HTML;
    const modes = container.querySelector('.howto-modes');
    const code = container.querySelector('.howto-code');
    const copyBtn = container.querySelector('.howto-copy');

    function select(modeKey) {
        modes.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === modeKey));
        code.value = bookmarkletCode(modeKey);
    }

    MODES.forEach(m => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'howto-mode';
        b.dataset.mode = m.key;
        b.textContent = m.label;
        b.addEventListener('click', () => select(m.key));
        modes.appendChild(b);
    });

    copyBtn.addEventListener('click', async () => {
        const ok = await copyText(code.value, code);
        copyBtn.textContent = ok ? '✅ コピーしました' : '⚠️ コピーできませんでした（長押しで選択してください）';
        setTimeout(() => { copyBtn.textContent = '📋 コードをコピー'; }, 2000);
    });

    select(MODES[0].key);
}

export default {
    id: 'howto',
    label: '📖 取得方法',
    mount: mountHowto,
};
