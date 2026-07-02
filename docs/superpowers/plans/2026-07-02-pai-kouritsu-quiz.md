# 牌効率クイズ（何切る）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ランダム生成した14枚の手牌から「シャンテン数を進め、かつ受け入れ枚数（ウケイレ）が最大になる打牌」を当てる牌効率クイズ（何切る）をブラウザで遊べるようにする。

**Architecture:** `index.html` + `app.js` + `styles.css` の3ファイル構成（ビルド不要・外部依存なし）。`app.js` は「シャンテン計算エンジン（純粋関数）」「問題生成」「描画・イベント処理」の3層に分かれる。シャンテン計算は全探索＋メモ化なしの再帰的ブロック分解（通常形）と、対子数／幺九牌保有数から直接算出する式（七対子・国士無双）を組み合わせる。

**Tech Stack:** Vanilla JavaScript (ES2017+)、CSS変数によるテーマ、Unicode麻雀絵文字（U+1F000番台）。Node.js/npm/ビルドツールは使用しない（このマシンには存在しない）。

## Global Constraints

- ビルドツール・外部ライブラリ・Firebaseは使用しない。3ファイル（`index.html`/`app.js`/`styles.css`）に完結させる。
- `$` は `document.getElementById` の短縮版として定義する（既存姉妹プロジェクト `mahjong-table/app.js` と同じ命名）。
- ユーザー入力由来の文字列をHTMLに挿入する箇所は `esc()` を通す（既存パターン踏襲。本アプリはフリーテキスト入力がほぼ無いが、パターンとして用意しておく）。
- 牌は画像素材を使わず、Unicode麻雀絵文字＋CSSで表示する。文字コードの直後に異体字セレクタ `︎` を付け、絵文字ではなくテキスト（白黒）描画を強制し、CSSでスート別に色を付けられるようにする。
- このマシンには Node.js / npm / Python が実質使用できない（`python`/`node` はスタブのみで動作しない）ため、自動テストは **ブラウザ上で動くテストハーネス（`test.html`）** で行う。`test.html` は納品物ではなく開発用の恒久的なデバッグページとして残す。
- `app.js` のDOM初期化コードは、`document.getElementById('quizRoot')` が存在する場合のみ実行するようガードする。これにより `test.html`（`#quizRoot` を持たない）から `app.js` を読み込んでもUI初期化コードが暴発しない。
- localStorageキーは `mahjong_kiru_` プレフィックスで統一する。
- 各タスックの最後に `git add` + `git commit` を行う（Task 1でこのプロジェクト用に `git init` する）。

---

### Task 1: プロジェクト雛形とプレビュー設定

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`
- Create: `test.html`
- Create: `.claude/launch.json`

**Interfaces:**
- Produces: `#quizRoot`（`index.html` 内、UI初期化のガード対象となるdiv）、`app.js` に空の `document.addEventListener('DOMContentLoaded', initUI)` とガード付き `initUI()`

- [ ] **Step 1: `git init` する**

```bash
git init
```

- [ ] **Step 2: `index.html` を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>牌効率クイズ（何切る）</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header>
  <h1>🀄 牌効率クイズ（何切る）</h1>
  <p>14枚の手牌から、シャンテン数を進めつつ受け入れ枚数が最大になる1枚を選んでください。</p>
</header>

<div class="wrap" id="quizRoot">
  <div class="statsBar" id="statsBar"></div>

  <div class="diffBar" id="diffBar">
    <button class="diffBtn" data-diff="tenpai">0〜1シャンテン</button>
    <button class="diffBtn" data-diff="mid">2〜3シャンテン</button>
    <button class="diffBtn" data-diff="all">絞り込みなし</button>
  </div>

  <div class="hand" id="hand"></div>

  <div class="feedback" id="feedback"></div>

  <div class="explain" id="explain"></div>

  <div class="controls">
    <button class="btn-main" id="nextBtn" style="display:none">次の問題へ</button>
  </div>
</div>

<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `styles.css` を作成する（基礎レイアウトのみ。牌の見た目はTask 8で追加）**

```css
:root {
  --bg:     #f0ebe0;
  --panel:  #faf7f0;
  --panel2: #ece7db;
  --line:   #c8bfa8;
  --txt:    #1f1a14;
  --muted:  #7a6e5f;
  --accent: #2a6e44;
  --accent2:#1a4f30;
  --warn:   #b87a1a;
  --bad:    #c23b2a;
  --good:   #2a6e44;
  --radius-sm: 8px;
  --radius-md: 12px;
  --shadow-sm: 0 1px 3px rgba(31,26,20,.08), 0 1px 6px rgba(31,26,20,.06);
}

*{box-sizing:border-box}

body {
  margin:0;
  font-family:"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Segoe UI",system-ui,sans-serif;
  background:var(--bg);
  color:var(--txt);
  line-height:1.7;
}

header {
  padding:18px 28px;
  border-bottom:1px solid var(--line);
  background:var(--panel);
  box-shadow:var(--shadow-sm);
}
header h1 { margin:0; font-size:19px; font-weight:700; }
header p { margin:6px 0 0; color:var(--muted); font-size:13px; }

.wrap {
  max-width:900px;
  margin:0 auto;
  padding:20px 24px 60px;
}

.btn-main {
  background:var(--accent);
  color:#fff;
  border:none;
  border-radius:var(--radius-sm);
  padding:10px 18px;
  font-size:14px;
  font-weight:700;
  cursor:pointer;
}
.btn-main:hover { background:var(--accent2); }

.controls { margin-top:16px; text-align:center; }
```

- [ ] **Step 4: `app.js` に骨組みを作成する**

```js
"use strict";
const $ = id => document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function initUI(){
  if (!$('quizRoot')) return;
  $('hand').textContent = '準備中…';
}

document.addEventListener('DOMContentLoaded', initUI);
```

- [ ] **Step 5: `test.html`（開発用テストハーネス）を作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><title>app.js テスト</title></head>
<body>
<pre id="out">実行中…</pre>
<script src="app.js"></script>
<script>
(function(){
  const results = [];
  window.__testResults = results;
  function assertEqual(name, actual, expected){
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(`${ok ? 'OK' : 'NG'} ${name} expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`);
  }
  window.assertEqual = assertEqual;
  window.runAllTests = function(){
    results.length = 0;
    if (typeof window.__registerTests === 'function') window.__registerTests();
    document.getElementById('out').textContent = results.length ? results.join('\n') : 'テスト未登録';
  };
  window.runAllTests();
})();
</script>
</body>
</html>
```

`app.js` 側は `window.__registerTests` にテスト登録関数を代入していく方式にする（各タスクで追記）。Task 1時点ではまだ何も登録しないため、`test.html` を開くと「テスト未登録」と表示されれば正しい。

- [ ] **Step 6: `.claude/launch.json` を作成する（プレビュー用。`python`/`node` が使えないため PowerShell の `HttpListener` を使う簡易静的サーバーを使う）**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "mahjong-kouritsu",
      "runtimeExecutable": "powershell",
      "runtimeArgs": ["-Command", "$root=(Get-Location).Path; $l=New-Object System.Net.HttpListener; $l.Prefixes.Add('http://localhost:8792/'); $l.Start(); Write-Output 'listening on 8792'; while ($l.IsListening) { $c=$l.GetContext(); $p=$c.Request.Url.LocalPath; if ($p -eq '/') { $p='/index.html' }; $f=Join-Path $root $p.TrimStart('/'); if (Test-Path $f -PathType Leaf) { $b=[System.IO.File]::ReadAllBytes($f); if ($f -like '*.html') { $c.Response.ContentType='text/html; charset=utf-8' } elseif ($f -like '*.css') { $c.Response.ContentType='text/css; charset=utf-8' } elseif ($f -like '*.js') { $c.Response.ContentType='application/javascript; charset=utf-8' }; $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length) } else { $c.Response.StatusCode=404 }; $c.Response.OutputStream.Close() }"],
      "port": 8792
    }
  ]
}
```

- [ ] **Step 7: プレビューで確認する**

`mcp__Claude_Preview__preview_start` で `mahjong-kouritsu` を起動し、`preview_snapshot` または `preview_screenshot` で `index.html` が「準備中…」を表示することを確認する。

- [ ] **Step 8: コミットする**

```bash
git add index.html styles.css app.js test.html .claude/launch.json
git commit -m "feat: プロジェクト雛形を作成"
```

---

### Task 2: 牌定数・ユーティリティ

**Files:**
- Modify: `app.js`
- Modify: `test.html`（変更不要、`__registerTests` 経由でテストが増える）

**Interfaces:**
- Consumes: なし
- Produces: `TILE_COUNT`(=34定数), `YAOCHUU`(13要素のindex配列), `mulberry32(seed)`, `tileLabel(idx)`, `tileGlyph(idx)`, `tileSuitClass(idx)`

- [ ] **Step 1: `app.js` の先頭付近に `window.__registerTests` へのテスト追記を行う（失敗する状態で書く）**

`app.js` の末尾（`initUI` 呼び出しの前）に追記:

```js
window.__registerTests = function(){
  assertEqual('tileLabel(0) 1m', tileLabel(0), '1m');
  assertEqual('tileLabel(8) 9m', tileLabel(8), '9m');
  assertEqual('tileLabel(9) 1p', tileLabel(9), '1p');
  assertEqual('tileLabel(27) 東', tileLabel(27), '東');
  assertEqual('tileLabel(33) 中', tileLabel(33), '中');
  assertEqual('tileSuitClass(0) man', tileSuitClass(0), 'man');
  assertEqual('tileSuitClass(9) pin', tileSuitClass(9), 'pin');
  assertEqual('tileSuitClass(18) sou', tileSuitClass(18), 'sou');
  assertEqual('tileSuitClass(27) honor', tileSuitClass(27), 'honor');
  assertEqual('YAOCHUU件数', YAOCHUU.length, 13);
  const rngA = mulberry32(1234);
  const rngB = mulberry32(1234);
  assertEqual('mulberry32は同じseedで同じ列を返す', [rngA(),rngA()], [rngB(),rngB()]);
};
```

- [ ] **Step 2: `test.html` をプレビューで開き、失敗することを確認する**

`preview_eval` で `document.getElementById('out').textContent` を取得。`tileLabel is not defined` 等のエラーで `runAllTests` が例外になる、または全項目が `NG` になることを確認する。

- [ ] **Step 3: `app.js` に実装を追加する（`"use strict";` の直後、`initUI` より前）**

```js
const TILE_COUNT = 34; // 0-8萬子1-9, 9-17筒子1-9, 18-26索子1-9, 27-33字牌(東南西北白發中)
const YAOCHUU = [0,8,9,17,18,26,27,28,29,30,31,32,33]; // 幺九牌(老頭牌+字牌)のindex

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HONOR_NAMES = ['東','南','西','北','白','發','中'];
function tileLabel(idx){
  if (idx < 9) return (idx + 1) + 'm';
  if (idx < 18) return (idx - 9 + 1) + 'p';
  if (idx < 27) return (idx - 18 + 1) + 's';
  return HONOR_NAMES[idx - 27];
}

const HONOR_GLYPHS = ['🀀','🀁','🀂','🀃','🀆','🀅','🀄'];
const MAN_GLYPHS = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'];
const PIN_GLYPHS = ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'];
const SOU_GLYPHS = ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'];
function tileGlyph(idx){
  const base = idx < 9 ? MAN_GLYPHS[idx]
    : idx < 18 ? PIN_GLYPHS[idx-9]
    : idx < 27 ? SOU_GLYPHS[idx-18]
    : HONOR_GLYPHS[idx-27];
  return base + '︎'; // 異体字セレクタ: 絵文字ではなくテキスト(単色)で描画させる
}

function tileSuitClass(idx){
  if (idx < 9) return 'man';
  if (idx < 18) return 'pin';
  if (idx < 27) return 'sou';
  return 'honor';
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全項目が `OK` になることを確認する**

`preview_eval` で `document.getElementById('out').textContent` を取得し、`NG` を含まないことを確認する。

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 牌定数・ユーティリティ関数を追加"
```

---

### Task 3: 通常形シャンテン計算 `stdShanten`

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: なし（`counts` は呼び出し側が用意する34要素配列）
- Produces: `stdShanten(counts)` — `counts: number[34]` を受け取り通常形のシャンテン数（number）を返す

- [ ] **Step 1: `window.__registerTests` に以下を追記する（失敗する状態）**

```js
  // 通常形シャンテン
  assertEqual('通常形-和了(4面子1雀頭)', stdShanten(mkCounts('123456789m12355p')), -1);
  assertEqual('通常形-テンパイ単騎待ち', stdShanten(mkCounts('123456789m1235p')), 0);
  assertEqual('通常形-1シャンテン', stdShanten(mkCounts('123456m789p45p1s')), 1);
  assertEqual('通常形-完全孤立(役に立つ塊なし)', stdShanten(mkCounts('147m147p147s1234z')), 8);
```

テスト内で使う `mkCounts(str)`（`"123m456p"` のような簡易記法を34要素配列に変換するテスト専用ヘルパ）を、同じ `__registerTests` の直前に追記する:

```js
function mkCounts(str){
  const counts = new Array(TILE_COUNT).fill(0);
  let nums = [];
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') { nums.push(+ch); continue; }
    if (ch === 'm' || ch === 'p' || ch === 's') {
      const base = ch === 'm' ? 0 : ch === 'p' ? 9 : 18;
      for (const n of nums) counts[base + n - 1]++;
      nums = [];
    } else if (ch === 'z') {
      for (const n of nums) counts[27 + n - 1]++;
      nums = [];
    }
  }
  return counts;
}
```

- [ ] **Step 2: `test.html` で失敗することを確認する**（`stdShanten is not defined`）

- [ ] **Step 3: `app.js` に `stdShanten` を実装する（`mkCounts` より前、ユーティリティ群のすぐ後ろ）**

```js
// 通常形(4面子+1雀頭)のシャンテン数を再帰的なブロック分解の全探索で求める。
// 各牌indexについて「刻子」「順子」「雀頭」「対子(将来の刻子候補)」「両面/嵌張」「浮き牌として捨てる」を
// 全パターン試し、最良(最小)のシャンテン数を採用する。手牌13枚・14枚どちらにも同じ式が使える
// （14枚で4面子+雀頭が完成していれば -1 = 和了となる）。
function stdShanten(counts) {
  let best = 8;
  const c = counts.slice();

  function calc(melds, taatsu, head) {
    let m = melds, t = taatsu;
    if (m + t > 4) t = 4 - m; // 面子スロットは最大4つ。超えた分の搭子は数えない
    const s = 8 - m * 2 - t - head;
    if (s < best) best = s;
  }

  function rec(idx, melds, taatsu, head) {
    while (idx < TILE_COUNT && c[idx] === 0) idx++;
    if (idx === TILE_COUNT || (melds === 4 && head === 1)) { calc(melds, taatsu, head); return; }
    const isHonor = idx >= 27;
    const suitPos = idx % 9;

    // 1. 刻子
    if (c[idx] >= 3) {
      c[idx] -= 3;
      rec(idx, melds + 1, taatsu, head);
      c[idx] += 3;
    }
    // 2. 順子
    if (!isHonor && suitPos <= 6 && c[idx] > 0 && c[idx+1] > 0 && c[idx+2] > 0) {
      c[idx]--; c[idx+1]--; c[idx+2]--;
      rec(idx, melds + 1, taatsu, head);
      c[idx]++; c[idx+1]++; c[idx+2]++;
    }
    // 3. 対子を雀頭として使う(雀頭未確定のときのみ)
    if (head === 0 && c[idx] >= 2) {
      c[idx] -= 2;
      rec(idx, melds, taatsu, 1);
      c[idx] += 2;
    }
    // 4. 対子を刻子候補(搭子)として使う
    if (c[idx] >= 2 && melds + taatsu < 4) {
      c[idx] -= 2;
      rec(idx, melds, taatsu + 1, head);
      c[idx] += 2;
    }
    // 5. 両面/辺張(idx, idx+1)
    if (!isHonor && suitPos <= 7 && c[idx] > 0 && c[idx+1] > 0 && melds + taatsu < 4) {
      c[idx]--; c[idx+1]--;
      rec(idx, melds, taatsu + 1, head);
      c[idx]++; c[idx+1]++;
    }
    // 6. 嵌張(idx, idx+2)
    if (!isHonor && suitPos <= 6 && c[idx] > 0 && c[idx+2] > 0 && melds + taatsu < 4) {
      c[idx]--; c[idx+2]--;
      rec(idx, melds, taatsu + 1, head);
      c[idx]++; c[idx+2]++;
    }
    // 7. 残りを浮き牌として切り捨てて次のindexへ
    {
      const save = c[idx];
      c[idx] = 0;
      rec(idx + 1, melds, taatsu, head);
      c[idx] = save;
    }
  }

  rec(0, 0, 0, 0);
  return best;
}
```

- [ ] **Step 4: `test.html` を再読み込みし、4件すべて `OK` になることを確認する**

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 通常形シャンテン計算を追加"
```

---

### Task 4: 七対子・国士無双シャンテン + 統合 `shanten`

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `TILE_COUNT`, `YAOCHUU`, `stdShanten(counts)`（Task 2/3で定義済み）
- Produces: `chiitoiShanten(counts)`, `kokushiShanten(counts)`, `shanten(counts)`

- [ ] **Step 1: `window.__registerTests` に追記する**

```js
  // 七対子・国士無双・統合shanten
  assertEqual('七対子-テンパイ(6対子+1)', chiitoiShanten(mkCounts('1122334455667m')), 0);
  assertEqual('国士無双-テンパイ(13種1枚ずつ)', kokushiShanten(mkCounts('19m19p19s1234567z')), 0);
  assertEqual('国士無双-和了(対子あり)', kokushiShanten(mkCounts('119m19p19s1234567z')), -1);
  assertEqual('統合shanten-和了', shanten(mkCounts('123456789m12355p')), -1);
  assertEqual('統合shanten-完全孤立(七対子側が有利)', shanten(mkCounts('147m147p147s1234z')), 6);
```

- [ ] **Step 2: `test.html` で失敗することを確認する**

- [ ] **Step 3: `app.js` に実装を追加する（`stdShanten` の直後）**

```js
// 七対子シャンテン数 = 6 - 対子数 + max(0, 7 - 保有種類数)
function chiitoiShanten(counts) {
  let pairs = 0, kinds = 0;
  for (const v of counts) { if (v >= 1) kinds++; if (v >= 2) pairs++; }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

// 国士無双シャンテン数 = 13 - 幺九牌の保有種類数 - (幺九牌に対子があれば1)
function kokushiShanten(counts) {
  let kinds = 0, hasPair = false;
  for (const i of YAOCHUU) {
    if (counts[i] >= 1) kinds++;
    if (counts[i] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

function shanten(counts) {
  return Math.min(stdShanten(counts), chiitoiShanten(counts), kokushiShanten(counts));
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全件 `OK` になることを確認する**

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 七対子・国士無双シャンテンと統合shantenを追加"
```

---

### Task 5: 受け入れ枚数（ウケイレ）計算 `ukeire`

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `TILE_COUNT`, `shanten(counts)`
- Produces: `ukeire(counts13)` — 13枚の手牌配列を受け取り `{ total: number, accepted: [tileIdx, remainCount][] }` を返す

- [ ] **Step 1: `window.__registerTests` に追記する**

```js
  // ukeire
  const tankiHand = mkCounts('123456789m1235p');
  const uk = ukeire(tankiHand);
  assertEqual('単騎待ちukeire-合計枚数', uk.total, 3);
  assertEqual('単騎待ちukeire-受け入れ牌', uk.accepted, [[13, 3]]); // 13 = 5p (9+5-1)
```

- [ ] **Step 2: `test.html` で失敗することを確認する**

- [ ] **Step 3: `app.js` に実装を追加する（`shanten` の直後）**

```js
// 13枚の手牌に対し、加えるとシャンテン数が1つ縮む牌(受け入れ牌)を全34種類から探し、
// 山に残っている枚数(4 - 手牌内の保有数)を合計する。他家の手牌・捨て牌は考慮しない単純化。
function ukeire(counts13) {
  const base = shanten(counts13);
  let total = 0;
  const accepted = [];
  for (let t = 0; t < TILE_COUNT; t++) {
    if (counts13[t] >= 4) continue;
    const c14 = counts13.slice();
    c14[t]++;
    if (shanten(c14) < base) {
      const remain = 4 - counts13[t];
      accepted.push([t, remain]);
      total += remain;
    }
  }
  return { total, accepted };
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全件 `OK` になることを確認する**

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 受け入れ枚数(ukeire)計算を追加"
```

---

### Task 6: 何切る判定 `evaluateDiscards`

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `TILE_COUNT`, `shanten(counts)`, `ukeire(counts13)`
- Produces: `evaluateDiscards(counts14)` — 14枚の手牌配列を受け取り、打牌候補ごとの評価を「シャンテン数昇順→受け入れ枚数降順」でソートした配列で返す。各要素は `{ tile: number, shantenAfter: number, ukeireTotal: number, ukeireAccepted: [tileIdx, remainCount][], isCorrect: boolean }`

- [ ] **Step 1: `window.__registerTests` に追記する**

```js
  // evaluateDiscards: 123456789m(3面子) + 123p(1面子) + 5p,6p(対子ではなく単独2枚)の14枚。
  // 4面子は完成しているが雀頭が無いため、5pか6pのどちらかを切って残り1枚を単騎待ちにする
  // (どちらも受け入れ3枚で同点=両方正解)のが正しい。萬子側を崩すと面子が壊れてシャンテンが悪化する。
  const discardHand = mkCounts('123456789m12356p'); // 14枚
  const options = evaluateDiscards(discardHand);
  assertEqual('打牌候補の枚数(14枚すべて異なる牌種)', options.length, 14);
  const best = options.filter(o => o.isCorrect);
  assertEqual('正解は5pと6pを切るケースの2通り(単騎待ちで同点)', best.map(o=>o.tile).sort((a,b)=>a-b), [13, 14]); // 13=5p, 14=6p
  assertEqual('正解打牌後はテンパイ(shantenAfter=0)', best.every(o=>o.shantenAfter===0), true);
  assertEqual('正解打牌の受け入れ枚数はどちらも3枚(単騎待ち)', best.every(o=>o.ukeireTotal===3), true);
```

- [ ] **Step 2: `test.html` で失敗することを確認する（`evaluateDiscards is not defined`）**

- [ ] **Step 3: `app.js` に実装を追加する（`ukeire` の直後）**

```js
// 14枚の手牌に対し、ありうる打牌候補(手牌に含まれる牌種)ごとに
// 「切った後のシャンテン数」「受け入れ枚数」を計算する。
// 正解(isCorrect)は、まずシャンテン数が最小になる打牌グループに絞り込み、
// その中で受け入れ枚数が最大の打牌(同点はすべて正解)とする。
function evaluateDiscards(counts14) {
  const candidates = [];
  for (let t = 0; t < TILE_COUNT; t++) {
    if (counts14[t] === 0) continue;
    const c13 = counts14.slice();
    c13[t]--;
    const shantenAfter = shanten(c13);
    const uk = ukeire(c13);
    candidates.push({ tile: t, shantenAfter, ukeireTotal: uk.total, ukeireAccepted: uk.accepted, isCorrect: false });
  }

  const minShanten = Math.min(...candidates.map(o => o.shantenAfter));
  const inBestGroup = candidates.filter(o => o.shantenAfter === minShanten);
  const maxUkeire = Math.max(...inBestGroup.map(o => o.ukeireTotal));
  for (const o of candidates) {
    if (o.shantenAfter === minShanten && o.ukeireTotal === maxUkeire) o.isCorrect = true;
  }

  candidates.sort((a, b) => a.shantenAfter - b.shantenAfter || b.ukeireTotal - a.ukeireTotal);
  return candidates;
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全件 `OK` になることを確認する**

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 何切る判定(evaluateDiscards)を追加"
```

---

### Task 7: 問題生成 `generateProblem`

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `TILE_COUNT`, `mulberry32`, `evaluateDiscards(counts14)`
- Produces: `drawRandomHand(rng)` — 34要素配列(合計14枚)を返す。`generateProblem(rng, difficulty)` — `difficulty: 'tenpai'|'mid'|'all'` を受け取り `{ hand: number[34], discardOptions: ReturnType<evaluateDiscards>, bestShanten: number }` を返す

- [ ] **Step 1: `window.__registerTests` に追記する**

```js
  // drawRandomHand / generateProblem
  const rngHand = mulberry32(42);
  const hand = drawRandomHand(rngHand);
  assertEqual('drawRandomHandは合計14枚', hand.reduce((a,b)=>a+b,0), 14);
  assertEqual('drawRandomHandは各牌最大4枚', hand.every(v => v <= 4), true);

  const probAll = generateProblem(mulberry32(7), 'all');
  assertEqual('generateProblem(all)は14枚', probAll.hand.reduce((a,b)=>a+b,0), 14);

  const probTenpai = generateProblem(mulberry32(7), 'tenpai');
  assertEqual('generateProblem(tenpai)はbestShantenが0か1', probTenpai.bestShanten <= 1, true);

  const probMid = generateProblem(mulberry32(7), 'mid');
  assertEqual('generateProblem(mid)はbestShantenが2か3', probMid.bestShanten >= 2 && probMid.bestShanten <= 3, true);
```

- [ ] **Step 2: `test.html` で失敗することを確認する**

- [ ] **Step 3: `app.js` に実装を追加する（`evaluateDiscards` の直後）**

```js
// 34種×4枚=136枚の牌山からランダムに14枚を引く(Fisher-Yatesシャッフルの先頭14枚を採用)。
function drawRandomHand(rng) {
  const pool = [];
  for (let t = 0; t < TILE_COUNT; t++) for (let k = 0; k < 4; k++) pool.push(t);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const counts = new Array(TILE_COUNT).fill(0);
  for (let i = 0; i < 14; i++) counts[pool[i]]++;
  return counts;
}

// 難易度フィルタに合う14枚を引き当てるまで再抽選する。
// 'tenpai' = 0〜1シャンテン, 'mid' = 2〜3シャンテン, 'all' = 絞り込みなし
function generateProblem(rng, difficulty) {
  for (;;) {
    const hand = drawRandomHand(rng);
    const discardOptions = evaluateDiscards(hand);
    const bestShanten = Math.min(...discardOptions.map(o => o.shantenAfter));
    if (difficulty === 'all') return { hand, discardOptions, bestShanten };
    if (difficulty === 'tenpai' && bestShanten <= 1) return { hand, discardOptions, bestShanten };
    if (difficulty === 'mid' && bestShanten >= 2 && bestShanten <= 3) return { hand, discardOptions, bestShanten };
  }
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全件 `OK` になることを確認する**

- [ ] **Step 5: コミットする**

```bash
git add app.js
git commit -m "feat: 問題生成(generateProblem)を追加"
```

---

### Task 8: 牌UIの描画

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `$`, `esc`, `tileGlyph`, `tileSuitClass`, `tileLabel`
- Produces: `renderHand(hand, onTileClick)` — `#hand` に牌カードを描画し、クリック時に `onTileClick(tileIndex, cardElement)` を呼ぶ

- [ ] **Step 1: `styles.css` に牌カードのスタイルを追記する**

```css
.hand {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  justify-content:center;
  padding:24px 0;
}
.tile {
  display:flex;
  align-items:center;
  justify-content:center;
  width:52px;
  height:70px;
  font-size:34px;
  background:var(--panel);
  border:1px solid var(--line);
  border-radius:var(--radius-sm);
  box-shadow:var(--shadow-sm);
  cursor:pointer;
  user-select:none;
  transition:transform .1s;
}
.tile:hover { transform:translateY(-4px); }
.tile.man { color:#1a5fb4; }
.tile.pin { color:#c23b2a; }
.tile.sou { color:#2a6e44; }
.tile.honor { color:#1f1a14; }
.tile.correct { outline:3px solid var(--good); }
.tile.wrong { outline:3px solid var(--bad); }
.tile.disabled { cursor:default; opacity:.6; }

.diffBar { display:flex; gap:8px; justify-content:center; margin-top:10px; }
.diffBtn {
  background:var(--panel2);
  border:1px solid var(--line);
  border-radius:999px;
  padding:6px 14px;
  font-size:13px;
  cursor:pointer;
}
.diffBtn.active { background:var(--accent); color:#fff; border-color:var(--accent); }

.statsBar { text-align:center; font-size:13px; color:var(--muted); padding-top:8px; }

.feedback { text-align:center; font-size:15px; font-weight:700; min-height:24px; }
.feedback.correct { color:var(--good); }
.feedback.wrong { color:var(--bad); }

.explain table { width:100%; border-collapse:collapse; font-size:13px; margin-top:12px; }
.explain th, .explain td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:center; }
.explain tr.correct { background:rgba(42,110,68,.08); }
```

- [ ] **Step 2: `app.js` に `renderHand` を追加する（`generateProblem` の直後）**

```js
// handを牌カードとして#handに描画する。onTileClickはカードクリック時に(tileIndex, cardElement)を渡して呼ばれる。
function renderHand(hand, onTileClick) {
  const container = $('hand');
  container.innerHTML = '';
  for (let t = 0; t < TILE_COUNT; t++) {
    for (let k = 0; k < hand[t]; k++) {
      const el = document.createElement('div');
      el.className = 'tile ' + tileSuitClass(t);
      el.textContent = tileGlyph(t);
      el.title = esc(tileLabel(t));
      el.dataset.tile = String(t);
      el.addEventListener('click', () => onTileClick(t, el));
      container.appendChild(el);
    }
  }
}
```

- [ ] **Step 3: プレビューで確認する**

`app.js` の `initUI()` を一時的に次のように書き換えてブラウザで表示を確認する（このステップの後、Task 9で本実装に置き換えるため一時コードのままでよい）:

```js
function initUI(){
  if (!$('quizRoot')) return;
  const problem = generateProblem(mulberry32(Date.now()), 'all');
  renderHand(problem.hand, (t, el) => console.log('clicked', tileLabel(t)));
}
```

`preview_start` → `preview_screenshot` で14枚の牌カードがスート別に色分けされて並んでいることを目視確認する。`preview_click` で1枚クリックし、`preview_console_logs` に `clicked xx` が出ることを確認する。

- [ ] **Step 4: コミットする**

```bash
git add app.js styles.css
git commit -m "feat: 牌カードの描画(renderHand)を追加"
```

---

### Task 9: 回答処理・解説表示

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `$`, `esc`, `tileLabel`, `generateProblem`, `renderHand`, `mulberry32`
- Produces: `renderExplain(discardOptions, chosenTile)` — `#explain` に解説テーブルを描画する。`initUI()` を本実装に更新し、クイズの1問完結フロー（出題→クリックで正誤表示→解説表示→次の問題ボタン）を実装する

- [ ] **Step 1: `app.js` に `renderExplain` を追加する（`renderHand` の直後）**

```js
// 打牌候補の一覧をシャンテン数・受け入れ枚数の降順テーブルとして#explainに描画する。
function renderExplain(discardOptions, chosenTile) {
  const rows = discardOptions.map(o => {
    const cls = o.isCorrect ? 'correct' : '';
    const mark = o.tile === chosenTile ? '←選択' : '';
    return `<tr class="${cls}"><td>${esc(tileLabel(o.tile))}</td><td>${o.shantenAfter}</td><td>${o.ukeireTotal}</td><td>${esc(mark)}</td></tr>`;
  }).join('');
  $('explain').innerHTML = `
    <table>
      <thead><tr><th>打牌</th><th>シャンテン数</th><th>受け入れ枚数</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
```

- [ ] **Step 2: `app.js` の `initUI` をクイズフロー本実装に置き換える（Task 8 Step 3の仮実装を置き換える）**

```js
let currentProblem = null;
let currentDifficulty = 'all';
let answered = false;

function newProblem(){
  answered = false;
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('explain').innerHTML = '';
  $('nextBtn').style.display = 'none';
  currentProblem = generateProblem(mulberry32(Date.now() ^ (Math.random()*1e9)), currentDifficulty);
  renderHand(currentProblem.hand, onTileClick);
}

function onTileClick(tile, el){
  if (answered) return;
  answered = true;
  const chosen = currentProblem.discardOptions.find(o => o.tile === tile);
  const isCorrect = chosen.isCorrect;

  document.querySelectorAll('#hand .tile').forEach(node => {
    const t = Number(node.dataset.tile);
    const opt = currentProblem.discardOptions.find(o => o.tile === t);
    if (opt && opt.isCorrect) node.classList.add('correct');
    node.classList.add('disabled');
  });
  if (!isCorrect) el.classList.add('wrong');

  $('feedback').textContent = isCorrect ? '正解！' : '不正解…';
  $('feedback').className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
  renderExplain(currentProblem.discardOptions, tile);
  $('nextBtn').style.display = '';
}

function initUI(){
  if (!$('quizRoot')) return;
  $('nextBtn').addEventListener('click', newProblem);
  newProblem();
}
```

- [ ] **Step 3: プレビューで確認する**

`preview_start` → `preview_screenshot` で14枚の牌が表示されることを確認。`preview_click` で1枚クリックし、`preview_snapshot` で「正解！」または「不正解…」のフィードバックと解説テーブルが表示され、「次の問題へ」ボタンが出ることを確認する。ボタンをクリックし、新しい14枚が表示されることを確認する。

- [ ] **Step 4: コミットする**

```bash
git add app.js
git commit -m "feat: 回答処理と解説表示を実装"
```

---

### Task 10: 成績のlocalStorage永続化

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `$`
- Produces: `STATS_KEY`(定数), `loadStats()`, `saveStats(stats)`, `renderStats(stats)`。`onTileClick` を成績更新を行うよう更新する

- [ ] **Step 1: `window.__registerTests` に追記する**

```js
  // stats
  localStorage.removeItem(STATS_KEY);
  const s0 = loadStats();
  assertEqual('初期成績', s0, { attempts:0, correct:0, currentStreak:0, bestStreak:0 });
  saveStats({ attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  const s1 = loadStats();
  assertEqual('保存後の成績', s1, { attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  localStorage.removeItem(STATS_KEY);
```

- [ ] **Step 2: `test.html` で失敗することを確認する**

- [ ] **Step 3: `app.js` に実装を追加する（`renderExplain` の直後）**

```js
const STATS_KEY = 'mahjong_kiru_stats';

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { attempts: 0, correct: 0, currentStreak: 0, bestStreak: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { attempts: 0, correct: 0, currentStreak: 0, bestStreak: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function renderStats(stats) {
  const rate = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
  $('statsBar').textContent =
    `出題数: ${stats.attempts} / 正解数: ${stats.correct} / 正答率: ${rate}% / 連続正解: ${stats.currentStreak} (自己ベスト ${stats.bestStreak})`;
}
```

- [ ] **Step 4: `test.html` を再読み込みし、全件 `OK` になることを確認する**

- [ ] **Step 5: `onTileClick` を成績更新するよう更新する（Task 9で実装した関数を置き換える）**

```js
function onTileClick(tile, el){
  if (answered) return;
  answered = true;
  const chosen = currentProblem.discardOptions.find(o => o.tile === tile);
  const isCorrect = chosen.isCorrect;

  document.querySelectorAll('#hand .tile').forEach(node => {
    const t = Number(node.dataset.tile);
    const opt = currentProblem.discardOptions.find(o => o.tile === t);
    if (opt && opt.isCorrect) node.classList.add('correct');
    node.classList.add('disabled');
  });
  if (!isCorrect) el.classList.add('wrong');

  $('feedback').textContent = isCorrect ? '正解！' : '不正解…';
  $('feedback').className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
  renderExplain(currentProblem.discardOptions, tile);
  $('nextBtn').style.display = '';

  const stats = loadStats();
  stats.attempts++;
  if (isCorrect) {
    stats.correct++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats);
  renderStats(stats);
}
```

- [ ] **Step 6: `initUI` の先頭で初期表示時にも成績を描画するよう更新する**

```js
function initUI(){
  if (!$('quizRoot')) return;
  $('nextBtn').addEventListener('click', newProblem);
  renderStats(loadStats());
  newProblem();
}
```

- [ ] **Step 7: プレビューで確認する**

牌を数回クリックし、`#statsBar` の出題数・正答率・連続正解数が更新されることを確認する。ページをリロードしても成績が保持されることを確認する。

- [ ] **Step 8: コミットする**

```bash
git add app.js
git commit -m "feat: 成績のlocalStorage永続化を追加"
```

---

### Task 11: 難易度セレクター配線

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `currentDifficulty`(Task 9で定義済みのモジュール変数), `newProblem()`
- Produces: 難易度ボタンのイベント配線（新規の公開関数は無し。`initUI` を更新）

- [ ] **Step 1: `app.js` の `initUI` に難易度ボタンの配線を追加する**

```js
function initUI(){
  if (!$('quizRoot')) return;
  $('nextBtn').addEventListener('click', newProblem);
  document.querySelectorAll('.diffBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDifficulty = btn.dataset.diff;
      document.querySelectorAll('.diffBtn').forEach(b => b.classList.toggle('active', b === btn));
      newProblem();
    });
  });
  document.querySelector('.diffBtn[data-diff="all"]').classList.add('active');
  renderStats(loadStats());
  newProblem();
}
```

- [ ] **Step 2: プレビューで確認する**

`preview_click` で「0〜1シャンテン」ボタンを押し、出題された14枚の `evaluateDiscards` の `bestShanten`（`preview_eval` で `currentProblem.bestShanten` を参照）が0か1になることを確認する。同様に「2〜3シャンテン」でも確認する。選択中のボタンに `.active` が付くことを `preview_inspect` で確認する。

- [ ] **Step 3: コミットする**

```bash
git add app.js
git commit -m "feat: 難易度セレクターを配線"
```

---

### Task 12: 総合ブラウザ動作確認

**Files:**
- (変更なし。確認のみ)

**Interfaces:**
- Consumes: 完成した `index.html` / `app.js` / `styles.css`

- [ ] **Step 1: `preview_start` で `mahjong-kouritsu` を起動する**

- [ ] **Step 2: 初期表示を確認する**

`preview_screenshot` で14枚の牌カード・難易度ボタン・成績バーが表示されていることを確認する。

- [ ] **Step 3: 正解を選ぶケースを確認する**

`preview_eval` で `currentProblem.discardOptions.find(o=>o.isCorrect).tile` を取得し、対応する牌を `preview_click` でクリックする。「正解！」の緑フィードバックと、正解行がハイライトされた解説テーブルが表示されることを確認する。

- [ ] **Step 4: 不正解を選ぶケースを確認する**

「次の問題へ」→正解でない牌をクリックし、「不正解…」の赤フィードバックと、正解牌に緑の枠・クリックした牌に赤の枠が付くことを確認する。

- [ ] **Step 5: 難易度フィルタと成績の永続化を確認する**

3種類の難易度ボタンをそれぞれ押して出題されることを確認し、数回回答した後に `preview_eval` で `location.reload()` を実行、成績バーの数値がリロード後も保持されていることを確認する。

- [ ] **Step 6: `test.html` を開き、全テストが `OK` であることを最終確認する**

- [ ] **Step 7: `preview_stop` でサーバーを停止する**

---

## Self-Review メモ

- 設計書の「シャンテン計算エンジン」「受け入れ枚数」「何切る正解判定」「問題生成（難易度フィルタ）」「クイズ進行UI」「成績永続化」はTask 3〜11でそれぞれ対応済み。
- 「テスト・検証方針（既知の手牌での確認）」は、実装前に別途ブラウザで検証済み（本計画の各タスックのTDDテストケースの多くはその検証で使った実例をそのまま流用している）。
- 型・シグネチャの一貫性: `counts` は常に34要素配列、`shanten`系の全関数はその配列を直接受け取る。`evaluateDiscards`が返すオブジェクトの形は Task 6で定義した後、Task 9/10で参照する箇所も同じプロパティ名(`tile`, `shantenAfter`, `ukeireTotal`, `isCorrect`)を使っている。
