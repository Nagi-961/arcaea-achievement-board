// 取得方法: collect.js を呼ぶブックマークレットのコピーと、登録・実行の手順(端末ごと・画像付き)
// 取得する難易度や増分 / 全件は、ここでは選ばない。ブックマークを実行したときに Arcaea Online 側の画面(collect.js)で選ぶ
import { icon, iconLabel } from '../icons.js';
import { mountSeg } from '../motion.js';

const ARCAEA_ONLINE_URL = 'https://arcaea.lowiro.com/';
// ブックマークの登録が済んだか(済んだら、次からは登録の手順をたたんで 3〜5 だけ見せる)
const REGISTERED_KEY = 'arcaea_howto_registered_v1';
// 端末の選択(自動判定を手で変えたとき)
const DEVICE_KEY = 'arcaea_howto_device_v1';

const DEVICES = [
    { key: 'iphone', label: 'iPhone', icon: 'phone' },
    { key: 'android', label: 'Android', icon: 'phone' },
    { key: 'pc', label: 'PC', icon: 'monitor' },
];

// 手順のスクリーンショット: img/howto/ に置いたファイルだけをここに書く(書いていない画像は読みに行かない = 404 を出さない)
// 例: iphone: { register: [{ file: 'iphone-register-1.png', caption: '共有ボタン →「ブックマークを追加」' }] }
const SHOTS = {
    iphone: {},
    android: {},
    pc: {},
    common: {},
};

// 端末ごとの手順の文
const STEPS = {
    iphone: {
        register: [
            '適当なページ(このページでOK)で、画面下の共有ボタン →「ブックマークを追加」で保存します。',
            'ブックマーク一覧(本のアイコン)を開き、右下の「編集」→ いま追加したブックマークをタップします。',
            '名前を「arcaea取得」などにし、アドレスを消して、コピーしたコードを貼り付けて保存します。',
        ],
        run: ['Arcaea Online を開いたまま、ブックマーク一覧から「arcaea取得」をタップします。'],
    },
    android: {
        register: [
            '適当なページ(このページでOK)で、右上のメニュー(︙)の ☆ を押してブックマークします。',
            '下に出る「編集」を押し、名前を「arcaea取得」などにします。',
            'URL の欄を消して、コピーしたコードを貼り付けて保存します。',
        ],
        run: ['Arcaea Online を開いたまま、アドレスバーに「arcaea取得」と入力し、候補に出てくる ☆ 付きのものをタップします。',
            '(Chrome はブックマーク一覧から開くと動かないので、必ずアドレスバーから選んでください)'],
    },
    pc: {
        register: [
            '上の「arcaea取得」ボタンを、ブラウザのブックマークバーへドラッグします。それだけで登録できます。',
            'ブックマークバーが出ていないときは Ctrl + Shift + B(Mac は ⌘ + Shift + B)で表示できます。',
        ],
        run: ['Arcaea Online を開いたまま、ブックマークバーの「arcaea取得」をクリックします。'],
    },
};

// 公開中のURLから collect.js の場所を決める(ローカル確認時は localhost を指す)
function bookmarkletCode() {
    const src = new URL('collect.js', location.href).href;
    return `javascript:(()=>{const s=document.createElement('script');s.src='${src}?t='+Date.now();document.body.appendChild(s)})();`;
}

function detectDevice() {
    try {
        const saved = localStorage.getItem(DEVICE_KEY);
        if (DEVICES.some(d => d.key === saved)) return saved;
    } catch { /* 読めなければ自動判定 */ }
    const ua = navigator.userAgent;
    // iPad の Safari は Mac と名乗るので、タッチできるかで見分ける
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
    if (/Android/.test(ua)) return 'android';
    return 'pc';
}

function isRegistered() {
    try { return localStorage.getItem(REGISTERED_KEY) === '1'; } catch { return false; }
}

function setRegistered(on) {
    try {
        if (on) localStorage.setItem(REGISTERED_KEY, '1');
        else localStorage.removeItem(REGISTERED_KEY);
    } catch { /* 保存できなくても表示は切り替える */ }
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

function shotsHtml(device, step) {
    const list = [...(SHOTS[device]?.[step] || []), ...(SHOTS.common[step] || [])];
    if (!list.length) return '';
    return `<div class="howto-shots">${list.map(s => `
        <figure class="howto-shot"><img src="img/howto/${s.file}" alt="${s.caption}" loading="lazy"><figcaption>${s.caption}</figcaption></figure>`).join('')}</div>`;
}

function listHtml(lines) {
    return `<ol class="howto-substeps">${lines.map(l => `<li>${l}</li>`).join('')}</ol>`;
}

function stepsHtml(device, code) {
    const s = STEPS[device];
    const registered = isRegistered();
    // PC はドラッグで登録できるので、コピーより先にドラッグ用のボタンを出す
    const copyBlock = device === 'pc'
        ? `<a class="howto-drag" href="${code}" draggable="true">${icon('bookmark')}arcaea取得</a>
           <p class="howto-note">ドラッグできないブラウザでは、コードをコピーしてブックマークの URL に貼り付けてください。</p>
           <details class="howto-code-wrap"><summary>コードを表示</summary>
               <textarea class="howto-code" readonly rows="3"></textarea>
               <button type="button" class="howto-copy">${iconLabel('copy', 'コードをコピー')}</button></details>`
        : `<button type="button" class="howto-copy howto-copy-main">${iconLabel('copy', 'コードをコピー')}</button>
           <textarea class="howto-code" readonly rows="3"></textarea>`;

    return `
        <details class="howto-once slide"${registered ? '' : ' open'}>
            <summary>${icon('bookmark')}<span>最初の1回だけ: ブックマークの登録</span>
                ${registered ? `<span class="howto-done-badge">${icon('check')}登録済み</span>` : ''}</summary>
            <div class="slide-body">
                <section class="howto-step">
                    <h3><span class="howto-num">1</span>${device === 'pc' ? '登録用のボタン' : 'コードをコピー'}</h3>
                    ${copyBlock}
                </section>
                <section class="howto-step">
                    <h3><span class="howto-num">2</span>ブックマークに登録</h3>
                    ${listHtml(s.register)}
                    ${shotsHtml(device, 'register')}
                    <button type="button" class="howto-registered">${registered ? iconLabel('refresh', '登録をやり直す') : iconLabel('check', '登録できた')}</button>
                </section>
            </div>
        </details>

        <p class="howto-every">${icon('refresh')}ここから下が、毎回の取得の手順です</p>

        <section class="howto-step">
            <h3><span class="howto-num">3</span>Arcaea Online にログイン</h3>
            <p><a href="${ARCAEA_ONLINE_URL}" target="_blank" rel="noopener">${ARCAEA_ONLINE_URL}</a> を開いてログインします。</p>
            ${shotsHtml(device, 'login')}
        </section>
        <section class="howto-step">
            <h3><span class="howto-num">4</span>ブックマークを実行して、取得する内容を選ぶ</h3>
            ${listHtml([...s.run, '画面の上に選択画面が出るので、そのまま「取得開始」を押します(全難易度・増分がおすすめ。次からは前回の選択を覚えています)。'])}
            ${shotsHtml(device, 'run')}
            <p class="howto-note">増分: 前回から更新された譜面だけを取りに行くので、数秒〜十数秒で終わります(初回は全件取得になります)。
                何かおかしいと感じたときは「全件」を選んでください。一部の難易度だけ取っても、前回までの分と合体して保存されます。</p>
        </section>
        <section class="howto-step">
            <h3><span class="howto-num">5</span>サイトに送る</h3>
            <p>取得が終わったら「サイトに送る」を押すと、このサイトが新しいタブで開き、そのままデータが読み込まれます。</p>
            ${shotsHtml(device, 'send')}
            <p class="howto-note">うまくいかないときは「保存」で all.json を保存し、このサイトの「all.json を選択」または「データ更新」から読み込んでください。
                ポップアップがブロックされた場合は、ブラウザの設定で Arcaea Online のポップアップを許可してください。</p>
        </section>`;
}

const HOWTO_HTML = `
    <div class="howto">
        <h2>${icon('download')}all.json の取り方</h2>
        <p class="howto-note">Arcaea Online にログインした状態で、ブックマークに登録したコードを実行します。お使いの端末を選んでください。</p>
        <p class="howto-point howto-news">${icon('alert')}<span><b>2026/11 にコードが新しくなりました。</b>前のコードもそのまま使えますが、
            新しいコードに登録し直すと、押したときに難易度などを選べるようになります(サイトでモードを選んでからコピーする必要がなくなります)。</span></p>
        <div class="seg howto-device" role="group" aria-label="端末"></div>
        <div class="howto-steps"></div>
    </div>`;

// 最初の画面とタブの両方で使えるよう、渡された要素の中に説明を作る
export function mountHowto(container) {
    container.innerHTML = HOWTO_HTML;
    const deviceBox = container.querySelector('.howto-device');
    const stepsBox = container.querySelector('.howto-steps');
    deviceBox.dataset.seg = `howto-device-${container.id || 'main'}`;
    const code = bookmarkletCode();
    let device = detectDevice();

    function render() {
        deviceBox.replaceChildren(...DEVICES.map(d => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'seg-btn' + (d.key === device ? ' active' : '');
            b.setAttribute('aria-pressed', String(d.key === device));
            b.innerHTML = `<span>${iconLabel(d.icon, d.label)}</span>`;
            b.addEventListener('click', () => {
                if (d.key === device) return;
                device = d.key;
                try { localStorage.setItem(DEVICE_KEY, device); } catch { /* 保存できなくても切り替える */ }
                render();
            });
            return b;
        }));
        mountSeg(deviceBox);
        stepsBox.innerHTML = stepsHtml(device, code);
        stepsBox.querySelectorAll('.howto-code').forEach(t => { t.value = code; });
    }

    // 描き直しても効くよう、操作は箱でまとめて受ける
    stepsBox.addEventListener('click', async e => {
        const copyBtn = e.target.closest('.howto-copy');
        if (copyBtn) {
            const ok = await copyText(code, copyBtn.parentElement.querySelector('.howto-code'));
            const label = copyBtn.innerHTML;
            copyBtn.innerHTML = ok ? iconLabel('check', 'コピーしました') : iconLabel('alert', 'コピーできませんでした(下の欄を長押しで選択してください)');
            setTimeout(() => { copyBtn.innerHTML = label; }, 2000);
            return;
        }
        // ドラッグ用のボタンは、このページで押しても意味がないので、ドラッグするよう伝える
        const drag = e.target.closest('.howto-drag');
        if (drag) {
            e.preventDefault();
            drag.classList.remove('nudge');
            void drag.offsetWidth;
            drag.classList.add('nudge');
            drag.title = 'クリックではなく、ブックマークバーへドラッグしてください';
            return;
        }
        if (e.target.closest('.howto-registered')) {
            const next = !isRegistered();
            setRegistered(next);
            render();
            // 登録できたら、毎回の手順(3〜5)が見えるところまで送る
            if (next) stepsBox.querySelector('.howto-every')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    render();
}

export default {
    id: 'howto',
    label: '取得方法',
    icon: 'book',
    mount: mountHowto,
};
