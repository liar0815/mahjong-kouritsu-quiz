# 放銃回避トレーニングv2(打点統合・tier再編) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 放銃回避トレーニング(危険牌クイズ・安全度ランキング・押し引き二択)に、①打点統合、②複数リーチ解説内訳、③片筋/壁のtier分離、④筋の前提注記、⑤巡目補正を追加する。

**Architecture:** すべて `app.js` 単一ファイル内の追加・変更。既存の`counts[34]`ベースのデータモデルと`window.__registerTests`によるブラウザ内テスト（`test.html`経由）のパターンをそのまま踏襲する。新規ファイル・新規依存は追加しない。

**Tech Stack:** Vanilla JS (ES2017相当)、ビルドツールなし、`test.html`のブラウザ内assert、`mcp__Claude_Preview__*`ツールでの目視確認。

## Global Constraints

- 常に日本語で応答し、コードコメントも日本語で書く（ユーザーのグローバル設定）。
- タスクに必要な範囲を超えたリファクタリングはしない。
- 各ステップはTDD（RED→GREEN）で進める。`test.html`をブラウザで開き、`document.getElementById('out').textContent`に`NG`行が無いことを確認する。
- 新規関数・変更箇所には日本語コメントで「なぜ」を記述する（「何をしているか」は書かない）。
- 参照spec: `docs/superpowers/specs/2026-07-03-boushin-kaihi-v2-design.md`

---

## 事前準備: プレビューサーバーでのテスト実行手順

このプランの全タスクで、以下の手順を「テストを実行する」の意味で使う。

1. `mcp__Claude_Preview__preview_start`で`name: "mahjong-kouritsu"`を起動する（起動済みなら流用）。
2. `mcp__Claude_Preview__preview_eval`で `window.location.href='/test.html'; 'nav'` を実行してテストページへ遷移する。
3. 再実行時は `window.location.reload(); 'reloading'` を実行する。
4. `document.getElementById('out').textContent.split('\n').filter(l=>l.startsWith('NG')).join('\n') || 'ALL OK'` を評価し、`ALL OK`ならグリーン、`NG ...`という行が出ればその内容を確認する。

---

### Task 1: Tier再編(6段階→7段階、片筋と壁を分離)

**Files:**
- Modify: `app.js`（`DANGER_TIERS`/`TIER_LABELS`定義部、`classifyAgainstOpponent`内のkabe分岐、テストの`classifyAgainstOpponent`ブロック）

**Interfaces:**
- Produces: `DANGER_TIERS.KABE`（新規、値4）。既存の`DANGER_TIERS.MODERATE`は5、`DANGER_TIERS.DANGEROUS`は6に変わる（シンボル参照のため呼び出し側コードの変更は不要）。

- [ ] **Step 1: 失敗するテストを書く(RED)**

`app.js`内の`window.__registerTests`関数、`classifyAgainstOpponent`ブロック（`// classifyAgainstOpponent`というコメントで始まる箇所、`isKabe`のテストの少し後）を探し、以下のテストを追加する。追加位置は同ブロック内、無地端牌/無地中央のassertEqualの直後（字牌視認テストの前）:

```js
    // 壁(kabe)は片筋より一段階危険側の独立tierになる(片筋は現物という確定情報、壁は3枚見えの確率的情報のため)
    const allVisibleKabeOnly = new Array(TILE_COUNT).fill(0);
    allVisibleKabeOnly[5] = 3; // 6mが3枚見え(壁)
    assertEqual('classify: 壁は片筋と別tier(KABE)', classifyAgainstOpponent(4, { discards: [] }, allVisibleKabeOnly).tier, DANGER_TIERS.KABE);
```

**Step 2: テストを実行して失敗を確認する**

上記の「事前準備」手順でテストを実行する。
期待される失敗: `NG classify: 壁は片筋と別tier(KABE) expected=undefined got=3`（`DANGER_TIERS.KABE`が未定義のため`expected`が`undefined`になる、または`3`のまま一致してしまわず失敗する）。`DANGER_TIERS.KABE`が存在しないことを確認できればRED成立。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

`app.js`内の以下のブロックを:

```js
const DANGER_TIERS = {
  GENBUTSU: 0,      // 現物
  NOCHANCE: 1,      // ノーチャンス
  SUJI_BOTH: 2,     // 両筋・中筋
  SUJI_ONE: 3,      // 片筋・壁・字牌(視認3+)
  MODERATE: 4,      // 字牌(視認1〜2)・無地端寄り(1,2,3,7,8,9)
  DANGEROUS: 5      // 字牌(視認0=生牌)・無地中央(4,5,6)
};
const TIER_LABELS = ['現物', 'ノーチャンス', '両筋・中筋', '片筋・壁・字牌安全域', '中危険', '高危険'];
```

以下に置き換える:

```js
const DANGER_TIERS = {
  GENBUTSU: 0,      // 現物
  NOCHANCE: 1,      // ノーチャンス
  SUJI_BOTH: 2,     // 両筋・中筋
  SUJI_ONE: 3,      // 片筋(相方が現物という確定情報に基づく)
  KABE: 4,          // 壁(搭子構成牌が3枚見え=ノーチャンス一歩手前という確率的情報。片筋より信頼度が低いため片筋より危険側)
  MODERATE: 5,      // 字牌(視認1〜2)・無地端寄り(1,2,3,7,8,9)
  DANGEROUS: 6      // 字牌(視認0=生牌)・無地中央(4,5,6)
};
const TIER_LABELS = ['現物', 'ノーチャンス', '両筋・中筋', '片筋', '壁', '中危険', '高危険'];
```

続けて、`classifyAgainstOpponent`関数内の以下の行を:

```js
  if (isKabe(tile, allVisible)) return { tier: DANGER_TIERS.SUJI_ONE, reason: 'kabe' };
```

以下に置き換える:

```js
  if (isKabe(tile, allVisible)) return { tier: DANGER_TIERS.KABE, reason: 'kabe' };
```

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを再実行し、`ALL OK`になることを確認する。既存の`MODERATE`/`DANGEROUS`関連のテストはシンボル参照(`DANGER_TIERS.MODERATE`等)のため自動的に新しい数値に追従し、壊れないはずである。もし壊れていたら、その箇所が`DANGER_TIERS.MODERATE`ではなく生の数値`4`や`5`を直接使っていないか確認して直す。

- [ ] **Step 5: `REASON_LABELS`に変更が不要なことを確認する**

`REASON_LABELS`オブジェクトの`'kabe': '壁'`は既存のまま変更不要（tier番号とは独立した理由文字列のため）。

- [ ] **Step 6: コミット**

```bash
git add app.js
git commit -m "feat: 危険度tierを7段階化し片筋と壁を分離"
```

---

### Task 2: `doraTileFromIndicator`の実装

**Files:**
- Modify: `app.js`（`tileSuitAndValue`関数の直後あたりに新規関数を追加、`window.__registerTests`にテスト追加）

**Interfaces:**
- Produces: `doraTileFromIndicator(doraIndicator)` — ドラ表示牌のindexから実際のドラ牌のindexを返す。数牌はv+1(9の次は1)、風牌は東→南→西→北→東、三元牌は白→發→中→白の巡回。

- [ ] **Step 1: 失敗するテストを書く(RED)**

`window.__registerTests`内、`// 危険度判定エンジン: tileSuitAndValue / visibleCounts`というコメントの直前に以下を追加する:

```js
  // doraTileFromIndicator
  assertEqual('doraTileFromIndicator: 数牌は+1(1m→2m)', doraTileFromIndicator(0), 1);
  assertEqual('doraTileFromIndicator: 数牌は9→1に巡回(9m→1m)', doraTileFromIndicator(8), 0);
  assertEqual('doraTileFromIndicator: 風牌は東→南', doraTileFromIndicator(27), 28);
  assertEqual('doraTileFromIndicator: 風牌は北→東に巡回', doraTileFromIndicator(30), 27);
  assertEqual('doraTileFromIndicator: 三元牌は白→發', doraTileFromIndicator(31), 32);
  assertEqual('doraTileFromIndicator: 三元牌は中→白に巡回', doraTileFromIndicator(33), 31);
```

- [ ] **Step 2: テストを実行して失敗を確認する**

`ReferenceError: doraTileFromIndicator is not defined` 相当のエラーで`window.__registerTests`全体が止まり、`out`の内容が「実行中…」のまま変わらないか、コンソールにエラーが出ることを確認する（この関数はまだ存在しないため）。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

`app.js`の`tileSuitAndValue`関数の直後に以下を追加する:

```js
// ドラ表示牌のindexから実際のドラ牌のindexを返す。数牌はv+1(9の次は1に巡回)、
// 風牌は東→南→西→北→東、三元牌は白→發→中→白の順で巡回する。
function doraTileFromIndicator(doraIndicator) {
  const { suit, v } = tileSuitAndValue(doraIndicator);
  if (suit !== null) {
    const base = doraIndicator - (v - 1);
    return base + (v % 9); // v=9のときv%9=0→base+0=1つ目(1)に巡回
  }
  if (doraIndicator <= 30) return 27 + ((doraIndicator - 27 + 1) % 4); // 風牌(27-30)の巡回
  return 31 + ((doraIndicator - 31 + 1) % 3); // 三元牌(31-33)の巡回
}
```

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを再実行し、`ALL OK`になることを確認する。

- [ ] **Step 5: コミット**

```bash
git add app.js
git commit -m "feat: ドラ表示牌からドラ牌を算出するdoraTileFromIndicatorを追加"
```

---

### Task 3: 巡目補正を`overallDangerTier`に実装

**Files:**
- Modify: `app.js`（`overallDangerTier`関数、`drawSafetyScenario`関数、`window.__registerTests`）

**Interfaces:**
- Consumes: `DANGER_TIERS`（Task 1で7段階化済み）
- Produces: `overallDangerTier(tile, scenario)`の戻り値が、対象opponentの巡目（`riichiDiscardIndex + 1`）が6巡目以内の場合、GENBUTSU/NOCHANCE以外のtierを1段階危険側に補正する（上限MODERATE）ようになる。

- [ ] **Step 1: 失敗するテストを書く(RED)**

`window.__registerTests`内の`// overallDangerTier`ブロックの直後（`// drawSafetyScenario`ブロックの直前）に以下を追加する:

```js
  // 巡目による危険度補正(6巡目以内の早いリーチはtierを1段階危険側に補正、GENBUTSU/NOCHANCEは補正しない、上限はMODERATE)
  {
    // 片筋(tier3)+早い巡目(riichiDiscardIndex=0→1巡目) → 壁(tier4)に補正される
    const scenarioEarlySuji = {
      hand: mkCounts('1m'),
      opponents: [{ discards: [1], riichiDiscardIndex: 0 }], // 2m(idx1)が現物→5m(idx4)は片筋
      doraIndicator: 2
    };
    assertEqual('overallDangerTier: 6巡目以内の片筋はKABEに補正される', overallDangerTier(4, scenarioEarlySuji).tier, DANGER_TIERS.KABE);

    // 同じ片筋(tier3)でも7巡目以降(riichiDiscardIndex=7→8巡目)なら補正されない
    const scenarioLateSuji = {
      hand: mkCounts('1m'),
      opponents: [{ discards: [1], riichiDiscardIndex: 7 }],
      doraIndicator: 2
    };
    assertEqual('overallDangerTier: 7巡目以降の片筋は補正されない', overallDangerTier(4, scenarioLateSuji).tier, DANGER_TIERS.SUJI_ONE);

    // 現物(tier0)は巡目に関わらず補正されない
    const scenarioEarlyGenbutsu = {
      hand: mkCounts('1m'),
      opponents: [{ discards: [4], riichiDiscardIndex: 0 }], // 5m(idx4)が現物
      doraIndicator: 2
    };
    assertEqual('overallDangerTier: 現物は早い巡目でも補正されない', overallDangerTier(4, scenarioEarlyGenbutsu).tier, DANGER_TIERS.GENBUTSU);

    // 中危険(MODERATE, tier5)は早い巡目でも上限を超えてDANGEROUS(tier6)にはならない
    const scenarioEarlyModerate = {
      hand: mkCounts('1z'), // 東(idx27)を1枚保持=視認1枚
      opponents: [{ discards: [], riichiDiscardIndex: 0 }],
      doraIndicator: 2
    };
    assertEqual('overallDangerTier: MODERATEは早い巡目でもDANGEROUSまでは上がらない', overallDangerTier(27, scenarioEarlyModerate).tier, DANGER_TIERS.MODERATE);
  }
```

- [ ] **Step 2: テストを実行して失敗を確認する**

テストを実行し、`NG overallDangerTier: 6巡目以内の片筋はKABEに補正される expected=4 got=3` のように、補正未実装のため元のtier(3)のまま返ってくることを確認する。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

`app.js`内の`overallDangerTier`関数を:

```js
// 全アクティブなリーチ者に対する最悪(最大)階級を採用する。リーチ0人なら常に安全(0)。
function overallDangerTier(tile, scenario) {
  if (scenario.opponents.length === 0) return { tier: DANGER_TIERS.GENBUTSU, reason: 'no-riichi' };
  const allVisible = visibleCounts(scenario.hand, scenario.opponents, scenario.doraIndicator);
  let worst = { tier: DANGER_TIERS.GENBUTSU, reason: 'genbutsu' };
  for (const opp of scenario.opponents) {
    const result = classifyAgainstOpponent(tile, opp, allVisible);
    if (result.tier > worst.tier) worst = result;
  }
  return worst;
}
```

以下に置き換える:

```js
// 早い巡目(6巡目以内)のリーチは待ちが広く実際にはより危険なため、
// 現物・ノーチャンス以外のtierを1段階危険側に補正する(上限はMODERATE、DANGEROUSまでは引き上げない)。
function applyTurnAdjustment(result, opponent) {
  const turn = opponent.riichiDiscardIndex + 1;
  if (turn > 6) return result;
  if (result.tier === DANGER_TIERS.GENBUTSU || result.tier === DANGER_TIERS.NOCHANCE) return result;
  return { tier: Math.min(result.tier + 1, DANGER_TIERS.MODERATE), reason: result.reason };
}

// 全アクティブなリーチ者に対する最悪(最大)階級を採用する。リーチ0人なら常に安全(0)。
function overallDangerTier(tile, scenario) {
  if (scenario.opponents.length === 0) return { tier: DANGER_TIERS.GENBUTSU, reason: 'no-riichi' };
  const allVisible = visibleCounts(scenario.hand, scenario.opponents, scenario.doraIndicator);
  let worst = { tier: DANGER_TIERS.GENBUTSU, reason: 'genbutsu' };
  for (const opp of scenario.opponents) {
    const result = applyTurnAdjustment(classifyAgainstOpponent(tile, opp, allVisible), opp);
    if (result.tier > worst.tier) worst = result;
  }
  return worst;
}
```

**注意:** `scenarioEarlyModerate`のテストでは`opponent.riichiDiscardIndex`が`0`(有効な数値)なので`turn=1<=6`となり補正が発火する。`opponent.riichiDiscardIndex`が`undefined`の場合(Task 1以前のテストで使われている素の`{discards:[...]}`のみのオブジェクト)は`turn = undefined + 1 = NaN`となり、`NaN > 6`は`false`だが`NaN <= 6`も`false`となるため、`if (turn > 6) return result;`の条件は`NaN > 6`→`false`なので通過してしまう点に注意。既存テスト(Task 1で追加したKABEテストや、既存の`classifyAgainstOpponent`直接呼び出しテスト)は`overallDangerTier`ではなく`classifyAgainstOpponent`を直接呼んでいるため影響を受けない。ただし`overallDangerTier`を使う既存テスト（`// overallDangerTier`ブロック、`checkSafetyRanking`テスト内のscenario、`evaluatePushFold`関連の一部）で`riichiDiscardIndex`が未設定のopponentを使っている場合、`turn`が`NaN`になり`NaN > 6`が`false`のため補正処理に入ってしまう可能性がある。これを避けるため、`applyTurnAdjustment`の先頭を以下のように`Number.isFinite`でガードする:

```js
function applyTurnAdjustment(result, opponent) {
  const turn = opponent.riichiDiscardIndex + 1;
  if (!Number.isFinite(turn) || turn > 6) return result;
  if (result.tier === DANGER_TIERS.GENBUTSU || result.tier === DANGER_TIERS.NOCHANCE) return result;
  return { tier: Math.min(result.tier + 1, DANGER_TIERS.MODERATE), reason: result.reason };
}
```

（`riichiDiscardIndex`が数値でない場合は巡目情報が無いものとして補正しない、という扱い。既存の`riichiDiscardIndex`を持たないテストフィクスチャがそのまま動く。）

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを再実行し、`ALL OK`になることを確認する。特に既存の`// overallDangerTier`ブロック・`checkSafetyRanking`・`evaluatePushFold`関連の既存テストが壊れていないことを確認する（`riichiDiscardIndex`未設定のため補正がかからず、既存の期待値のままのはず）。

- [ ] **Step 5: コミット**

```bash
git add app.js
git commit -m "feat: 早い巡目のリーチはtierを1段階危険側に補正するapplyTurnAdjustmentを追加"
```

---

### Task 4: `estimateHanCount` / `estimateOwnValueTier`の実装

**Files:**
- Modify: `app.js`（`evaluatePushFold`関数の手前に新規関数を追加、`window.__registerTests`にテスト追加）

**Interfaces:**
- Consumes: `YAOCHUU`（既存定数）
- Produces: `estimateHanCount(hand13, doraTile)` — 数値(概算翻数)を返す。`estimateOwnValueTier(hand14, candidateTile, doraTile)` — `'LOW'`/`'MID'`/`'HIGH'`のいずれかの文字列を返す(0〜2翻=LOW、3〜4翻=MID、5翻以上=HIGH)。

- [ ] **Step 1: 失敗するテストを書く(RED)**

`window.__registerTests`内、`// ownShantenExcludingCandidate / evaluatePushFold`ブロックの直前に以下を追加する:

```js
  // estimateHanCount / estimateOwnValueTier
  {
    // タンヤオのみ(役牌・混一色・トイトイ不成立、ドラ0) → 1翻 → LOW
    const tanyaoOnly13 = mkCounts('234567m234567p2s');
    assertEqual('estimateHanCount: タンヤオのみは1翻', estimateHanCount(tanyaoOnly13, 0), 1);

    // タンヤオ+ドラ4(2mを4枚) → 1+4=5翻 → HIGH
    const tanyaoDora13 = mkCounts('2222456m234567p');
    assertEqual('estimateHanCount: タンヤオ+ドラ4は5翻', estimateHanCount(tanyaoDora13, 1), 5); // doraTile=1(2m)

    // 役なし(幺九牌あり、混一色・役牌・トイトイ不成立、ドラ0) → 0翻 → LOW
    const noYaku13 = mkCounts('123456789m123p4p');
    assertEqual('estimateHanCount: 役なしは0翻', estimateHanCount(noYaku13, 20), 0); // doraTile=20(3s、手牌に無い)

    // estimateOwnValueTierは3段階に分類する
    const lowHand14 = mkCounts('234567m234567p2s1p'); // 候補1p(idx9)を切るとtanyaoOnly13と同じ形になる
    assertEqual('estimateOwnValueTier: 1翻はLOW', estimateOwnValueTier(lowHand14, 9, 0), 'LOW');

    const highHand14 = mkCounts('2222456m234567p1p'); // 候補1p(idx9)を切るとtanyaoDora13と同じ形になる
    assertEqual('estimateOwnValueTier: 5翻はHIGH', estimateOwnValueTier(highHand14, 9, 1), 'HIGH');
  }
```

- [ ] **Step 2: テストを実行して失敗を確認する**

`estimateHanCount is not defined`相当のエラーで止まることを確認する。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

`app.js`の`ownShantenExcludingCandidate`関数の直前に以下を追加する:

```js
// 簡易役判定+翻数概算(符計算は行わない)。正確な待ちの形までは判定せず、手牌の「形」だけから翻数を見積もる近似値。
// hand13は候補牌を切った後の13枚、doraTileは実際のドラ牌のindex。
function estimateHanCount(hand13, doraTile) {
  let han = 0;

  // タンヤオ: 幺九牌(老頭牌+字牌)を1枚も持っていない
  const hasYaochuu = YAOCHUU.some(i => hand13[i] > 0);
  if (!hasYaochuu) han += 1;

  // 混一色: 使用しているスート(萬子/筒子/索子)が1種類のみ(字牌はいくつ混ざっていてもよい)
  const usedSuits = new Set();
  for (let t = 0; t < 27; t++) if (hand13[t] > 0) usedSuits.add(Math.floor(t / 9));
  if (usedSuits.size === 1) han += 2;

  // 役牌: 三元牌(白發中)のいずれかを2枚以上持っている(対子または刻子)
  for (const dragon of [31, 32, 33]) if (hand13[dragon] >= 2) han += 1;

  // トイトイ寄り: 2枚以上持っている牌種の割合が高い(対子・刻子中心の形)
  const totalKinds = hand13.filter(c => c > 0).length;
  const pairedKinds = hand13.filter(c => c >= 2).length;
  if (totalKinds > 0 && pairedKinds / totalKinds >= 0.6) han += 2;

  // 一盃口: 同一スート内で連続する3つの値がいずれも2枚以上(同じ順子が2組作れる形)
  for (let suitBase = 0; suitBase < 27; suitBase += 9) {
    for (let v = 0; v < 7; v++) {
      const idx = suitBase + v;
      if (hand13[idx] >= 2 && hand13[idx + 1] >= 2 && hand13[idx + 2] >= 2) han += 1;
    }
  }

  // ドラ
  han += hand13[doraTile];

  return han;
}

// 自分の手の価値をLOW(0〜2翻)/MID(3〜4翻)/HIGH(5翻以上)の3段階に分類する。
function estimateOwnValueTier(hand14, candidateTile, doraTile) {
  const hand13 = hand14.slice();
  hand13[candidateTile]--;
  const han = estimateHanCount(hand13, doraTile);
  if (han >= 5) return 'HIGH';
  if (han >= 3) return 'MID';
  return 'LOW';
}
```

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを実行し、`ALL OK`になることを確認する。

- [ ] **Step 5: コミット**

```bash
git add app.js
git commit -m "feat: 簡易役判定+翻数概算のestimateHanCount/estimateOwnValueTierを追加"
```

---

### Task 5: `estimateOpponentValueTier`の実装

**Files:**
- Modify: `app.js`（Task 4の関数群の直後に追加、`window.__registerTests`にテスト追加）

**Interfaces:**
- Produces: `unseenDoraCount(scenario, doraTile)` — 数値。`estimateOpponentValueTier(opponent, unseenDoraCount)` — `'LOW'`/`'MID'`/`'HIGH'`のいずれかの文字列。

- [ ] **Step 1: 失敗するテストを書く(RED)**

Task 4で追加したテストブロックの直後に以下を追加する:

```js
  // unseenDoraCount / estimateOpponentValueTier
  {
    const scenarioForDora = { hand: mkCounts('1m'), opponents: [{ discards: [] }], doraIndicator: 5 };
    assertEqual('unseenDoraCount: 誰も持っていなければ最大4枚未見', unseenDoraCount(scenarioForDora, 20), 4); // doraTile=20(3s、場に全く見えていない)

    const scenarioForDoraSeen = { hand: mkCounts('1m1m'), opponents: [{ discards: [] }], doraIndicator: 5 };
    // 手牌に1mを2枚持っているので、ドラが1mなら未見枚数は4-2=2枚
    assertEqual('unseenDoraCount: 手牌に見えている分は未見枚数から減る', unseenDoraCount(scenarioForDoraSeen, 0), 2);

    assertEqual('estimateOpponentValueTier: 子+未見0枚はLOW', estimateOpponentValueTier({ isDealer: false }, 0), 'LOW');
    assertEqual('estimateOpponentValueTier: 子+未見2枚はLOW', estimateOpponentValueTier({ isDealer: false }, 2), 'LOW');
    assertEqual('estimateOpponentValueTier: 親+未見0枚はLOW', estimateOpponentValueTier({ isDealer: true }, 0), 'LOW');
    assertEqual('estimateOpponentValueTier: 親+未見2枚はMID', estimateOpponentValueTier({ isDealer: true }, 2), 'MID');
    assertEqual('estimateOpponentValueTier: 子+未見3枚はMID', estimateOpponentValueTier({ isDealer: false }, 3), 'MID');
    assertEqual('estimateOpponentValueTier: 親+未見3枚はHIGH', estimateOpponentValueTier({ isDealer: true }, 3), 'HIGH');
  }
```

- [ ] **Step 2: テストを実行して失敗を確認する**

`unseenDoraCount is not defined`相当のエラーで止まることを確認する。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

Task 4で追加した`estimateOwnValueTier`関数の直後に以下を追加する:

```js
// 場に見えていないドラ牌の枚数(=誰かが持っている可能性の代理指標)。特定の相手の手牌を読むものではない近似値。
function unseenDoraCount(scenario, doraTile) {
  const visible = visibleCounts(scenario.hand, scenario.opponents, scenario.doraIndicator);
  return Math.max(0, 4 - visible[doraTile]);
}

// リーチ者の想定打点をLOW/MID/HIGHの3段階で見積もる簡易近似。
// スコア=(親なら+1)+(場の未見ドラ枚数が3以上なら+2、1〜2なら+1、0なら+0)。
function estimateOpponentValueTier(opponent, unseenDora) {
  let score = opponent.isDealer ? 1 : 0;
  score += unseenDora >= 3 ? 2 : unseenDora >= 1 ? 1 : 0;
  if (score >= 3) return 'HIGH';
  if (score === 2) return 'MID';
  return 'LOW';
}
```

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを実行し、`ALL OK`になることを確認する。

- [ ] **Step 5: コミット**

```bash
git add app.js
git commit -m "feat: リーチ者の想定打点を見積もるestimateOpponentValueTierを追加"
```

---

### Task 6: `evaluatePushFold`の刷新(絶対安全判定+打点統合)

**Files:**
- Modify: `app.js`（`evaluatePushFold`関数、`window.__registerTests`内の`evaluatePushFold`関連テスト）

**Interfaces:**
- Consumes: `overallDangerTier`(Task 3で巡目補正込み)、`estimateOwnValueTier`(Task 4)、`estimateOpponentValueTier`/`unseenDoraCount`(Task 5)、`doraTileFromIndicator`(Task 2)
- Produces: `evaluatePushFold(hand14, candidateTile, scenario)`の戻り値`{correctAction, reason}`が打点を反映するようになる。シグネチャは変更しない。

- [ ] **Step 1: 失敗するテストを書く(RED)**

`window.__registerTests`内の既存の`// ownShantenExcludingCandidate / evaluatePushFold`ブロックの末尾（`assertEqual('evaluatePushFold: リーチ0人なら常に降りる...`のような既存の最後のassertの後、ブロックを閉じる`}`の直前）に以下を追加する:

```js
    // 絶対安全判定: 現物なら2シャンテン以上でも常に押す(新規)
    const genbutsuFarShanten = { hand: twoShantenHand14, opponents: [{ discards: [26] }], doraIndicator: 8 }; // 9s(idx26)が現物
    assertEqual('evaluatePushFold: 2シャンテンでも現物なら常に押す', evaluatePushFold(twoShantenHand14, 26, genbutsuFarShanten).correctAction, 'push');

    // 打点統合: 自分の手がHIGH(タンヤオ+ドラ4相当)+相手LOW/MIDなら、1シャンテンでKABE(tier4)でも押す
    const highValueHand14 = mkCounts('1133557799s246s1p'); // 候補1p(idx9)を切ると honitsu+toitoi寄り+ドラ次第でHIGHになる形
    assertEqual('ownShantenExcludingCandidate: 高打点1シャンテン手の確認', ownShantenExcludingCandidate(highValueHand14, 9), 1);

    // 候補1p(idx9)は2p(idx10)が3枚見え=壁(KABE,tier4)。相手は子・未見ドラ3枚(LOW寄りのMID)
    const scenarioHighOwnKabe = {
      hand: highValueHand14,
      opponents: [{ discards: [10, 10, 10], isDealer: false }],
      doraIndicator: 18 // 1s(idx18)→ドラは2s(idx19)
    };
    assertEqual('evaluatePushFold: 自分HIGH+相手LOW/MIDならKABE(tier4)でも押す', evaluatePushFold(highValueHand14, 9, scenarioHighOwnKabe).correctAction, 'push');

    // 同じ手・同じ候補牌でも、相手が親+未見ドラ3枚以上(HIGH)ならしきい値が1段階厳しくなり、KABE(tier4)は降りるが正解になる
    const scenarioHighOwnHighOpp = {
      hand: highValueHand14,
      opponents: [{ discards: [10, 10, 10], isDealer: true }],
      doraIndicator: 18
    };
    assertEqual('evaluatePushFold: 相手もHIGHならしきい値が厳しくなりKABEは降りる', evaluatePushFold(highValueHand14, 9, scenarioHighOwnHighOpp).correctAction, 'fold');
```

- [ ] **Step 2: テストを実行して失敗を確認する**

テストを実行する。`evaluatePushFold: 2シャンテンでも現物なら常に押す`は現状のロジック（2シャンテン以上は常に降りる）のため`expected="push" got="fold"`で失敗するはずである。他の2件も現行の閾値ロジック(tier<=2固定)のままだと期待通りにならないことを確認する。

- [ ] **Step 3: 最小限の実装を書く(GREEN)**

`app.js`内の`evaluatePushFold`関数を:

```js
// 押し引き判定。リーチ0人なら常に押す。テンパイなら常に押す。2シャンテン以上なら常に降りる。
// 1シャンテンなら候補牌の危険度が両筋/中筋(tier2)以下なら押す、それ以外は降りる。
function evaluatePushFold(hand14, candidateTile, scenario) {
  if (scenario.opponents.length === 0) return { correctAction: 'push', reason: 'no-riichi' };
  const ownShanten = ownShantenExcludingCandidate(hand14, candidateTile);
  if (ownShanten <= 0) return { correctAction: 'push', reason: 'tenpai' };
  if (ownShanten >= 2) return { correctAction: 'fold', reason: 'far-shanten' };

  const tier = overallDangerTier(candidateTile, scenario).tier;
  return tier <= DANGER_TIERS.SUJI_BOTH
    ? { correctAction: 'push', reason: '1-shanten-safe-enough' }
    : { correctAction: 'fold', reason: '1-shanten-too-dangerous' };
}
```

以下に置き換える:

```js
// 押し引き判定。リーチ0人なら常に押す。全リーチ者に対し現物/ノーチャンスなら、
// シャンテン数に関わらず常に押す(絶対安全牌のため)。テンパイなら常に押す。
// 2シャンテン以上なら常に降りる。1シャンテンのみ、自分の打点・相手の想定打点を反映したしきい値で判定する。
function evaluatePushFold(hand14, candidateTile, scenario) {
  if (scenario.opponents.length === 0) return { correctAction: 'push', reason: 'no-riichi' };

  const overall = overallDangerTier(candidateTile, scenario);
  if (overall.tier <= DANGER_TIERS.NOCHANCE) return { correctAction: 'push', reason: 'absolutely-safe' };

  const ownShanten = ownShantenExcludingCandidate(hand14, candidateTile);
  if (ownShanten <= 0) return { correctAction: 'push', reason: 'tenpai' };
  if (ownShanten >= 2) return { correctAction: 'fold', reason: 'far-shanten' };

  const doraTile = doraTileFromIndicator(scenario.doraIndicator);
  const ownTier = estimateOwnValueTier(hand14, candidateTile, doraTile);
  const unseenDora = unseenDoraCount(scenario, doraTile);
  const oppTiers = scenario.opponents.map(o => estimateOpponentValueTier(o, unseenDora));
  const oppTier = oppTiers.includes('HIGH') ? 'HIGH' : oppTiers.includes('MID') ? 'MID' : 'LOW';

  const ownAdj = ownTier === 'HIGH' ? 2 : ownTier === 'MID' ? 1 : 0;
  const oppAdj = oppTier === 'HIGH' ? 1 : 0;
  const threshold = Math.min(DANGER_TIERS.MODERATE, Math.max(DANGER_TIERS.SUJI_BOTH, DANGER_TIERS.SUJI_BOTH + ownAdj - oppAdj));

  return overall.tier <= threshold
    ? { correctAction: 'push', reason: '1-shanten-safe-enough' }
    : { correctAction: 'fold', reason: '1-shanten-too-dangerous' };
}
```

- [ ] **Step 4: テストを実行して成功を確認する(GREEN確認)**

テストを実行し、`ALL OK`になることを確認する。特に既存の`evaluatePushFold: 1シャンテン+両筋(tier2)以下は押す`・`evaluatePushFold: 1シャンテン+片筋(tier3)以上は降りる`（`oneShantenHand14`を使う既存テスト）が壊れていないことを重点的に確認する。これらは`ownTier`が`LOW`(該当ハンドはタンヤオ等が成立しない形で1翻程度)、`oppTier`が`MID`(未見ドラ3枚)になり、`threshold=2`のまま変わらないため、既存の期待値通りになるはずである。もし壊れていたら、該当テストの`oneShantenHand14`(`mkCounts('123456789m45p1s9s5s')`)に対する`estimateOwnValueTier`の計算結果を確認し、意図せず`MID`/`HIGH`になっていないか確認する。

- [ ] **Step 5: コミット**

```bash
git add app.js
git commit -m "feat: 押し引き判定に絶対安全判定と打点統合を追加"
```

---

### Task 7: 解説UIの拡張(リーチ者別内訳・巡目表示・筋の前提注記)

**Files:**
- Modify: `app.js`（`renderOpponents`、`renderDangerExplain`、`renderPushFoldExplain`）
- Modify: `index.html`（`dangerRoot`/`rankingRoot`/`pushfoldRoot`の`modeCaption`直後に注記文を追加）

**Interfaces:**
- Consumes: `classifyAgainstOpponent`、`TIER_LABELS`、`reasonLabel`
- Produces: 解説テーブルにリーチ者ごとの階級列が増える。UIの見た目のみの変更のため、`window.__registerTests`への追加は不要(既存パターンとして描画関数はテスト対象外)。

- [ ] **Step 1: `renderOpponents`に巡目表示を追加する**

`app.js`内の`renderOpponents`関数の以下の行を:

```js
    return `<div class="opponentRow"><span class="opponentLabel">リーチ${i + 1}</span><div class="opponentDiscards">${tiles}</div></div>`;
```

以下に置き換える:

```js
    const turnLabel = typeof opp.riichiDiscardIndex === 'number' ? `(${opp.riichiDiscardIndex + 1}巡目)` : '';
    return `<div class="opponentRow"><span class="opponentLabel">リーチ${i + 1}${esc(turnLabel)}</span><div class="opponentDiscards">${tiles}</div></div>`;
```

- [ ] **Step 2: `renderDangerExplain`にリーチ者別の階級内訳列を追加する**

`app.js`内の`renderDangerExplain`関数を:

```js
function renderDangerExplain(candidates, chosenTile) {
  const sorted = candidates.slice().sort((a, b) => a.tier - b.tier);
  const rows = sorted.map(c => {
    const cls = c.isCorrect ? 'correct' : '';
    const mark = c.tile === chosenTile ? '←選択' : '';
    return `<tr class="${cls}"><td>${esc(tileLabel(c.tile))}</td><td>${esc(TIER_LABELS[c.tier])}</td><td>${esc(reasonLabel(c.reason))}</td><td>${esc(mark)}</td></tr>`;
  }).join('');
  $('dangerExplain').innerHTML = `
    <table>
      <thead><tr><th>牌</th><th>階級</th><th>理由</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
```

以下に置き換える（`dangerProblem`はモジュール内で参照可能な既存のグローバル変数なので、リーチ者ごとの個別階級を再計算して列に足す）:

```js
function renderDangerExplain(candidates, chosenTile) {
  const sorted = candidates.slice().sort((a, b) => a.tier - b.tier);
  const allVisible = visibleCounts(dangerProblem.hand, dangerProblem.opponents, dangerProblem.doraIndicator);
  const perOpponentHeaders = dangerProblem.opponents.map((_, i) => `<th>対リーチ${i + 1}</th>`).join('');
  const rows = sorted.map(c => {
    const cls = c.isCorrect ? 'correct' : '';
    const mark = c.tile === chosenTile ? '←選択' : '';
    const perOpponentCells = dangerProblem.opponents.map(opp => {
      const r = classifyAgainstOpponent(c.tile, opp, allVisible);
      return `<td>${esc(TIER_LABELS[r.tier])}</td>`;
    }).join('');
    return `<tr class="${cls}"><td>${esc(tileLabel(c.tile))}</td><td>${esc(TIER_LABELS[c.tier])}</td><td>${esc(reasonLabel(c.reason))}</td>${perOpponentCells}<td>${esc(mark)}</td></tr>`;
  }).join('');
  $('dangerExplain').innerHTML = `
    <table>
      <thead><tr><th>牌</th><th>総合階級</th><th>理由</th>${perOpponentHeaders}<th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
```

**注意:** リーチ者ごとの内訳は「巡目補正前」の`classifyAgainstOpponent`の生の結果を表示する（`overallDangerTier`が内部で使う`applyTurnAdjustment`は適用しない）。これは意図的な設計判断であり、内訳列は「その相手に対する基本的な筋・壁・現物の状態」を示す目的のため、巡目補正は総合階級列にのみ反映すればよい。

- [ ] **Step 3: `renderPushFoldExplain`にもリーチ者別の階級内訳を追加する**

`app.js`内の`renderPushFoldExplain`関数を:

```js
function renderPushFoldExplain(chosenAction) {
  const j = pushfoldProblem.judgment;
  const tierLine = pushfoldProblem.opponents.length
    ? `候補牌の危険度: ${esc(TIER_LABELS[overallDangerTier(pushfoldProblem.candidateTile, pushfoldProblem).tier])}（${esc(reasonLabel(overallDangerTier(pushfoldProblem.candidateTile, pushfoldProblem).reason))}）`
    : 'リーチ者なし';
  $('pushfoldExplain').innerHTML = `
    <p>候補牌: ${esc(tileLabel(pushfoldProblem.candidateTile))}</p>
    <p>あなたの選択: ${esc(chosenAction === 'push' ? '押す' : '降りる')} / 正解: ${esc(j.correctAction === 'push' ? '押す' : '降りる')}</p>
    <p>${tierLine}</p>`;
}
```

以下に置き換える:

```js
function renderPushFoldExplain(chosenAction) {
  const j = pushfoldProblem.judgment;
  let tierLine = 'リーチ者なし';
  if (pushfoldProblem.opponents.length) {
    const overall = overallDangerTier(pushfoldProblem.candidateTile, pushfoldProblem);
    const allVisible = visibleCounts(pushfoldProblem.hand, pushfoldProblem.opponents, pushfoldProblem.doraIndicator);
    const perOpponent = pushfoldProblem.opponents.map((opp, i) => {
      const r = classifyAgainstOpponent(pushfoldProblem.candidateTile, opp, allVisible);
      return `対リーチ${i + 1}: ${esc(TIER_LABELS[r.tier])}`;
    }).join(' / ');
    tierLine = `候補牌の総合危険度: ${esc(TIER_LABELS[overall.tier])}（${esc(reasonLabel(overall.reason))}） [${perOpponent}]`;
  }
  $('pushfoldExplain').innerHTML = `
    <p>候補牌: ${esc(tileLabel(pushfoldProblem.candidateTile))}</p>
    <p>あなたの選択: ${esc(chosenAction === 'push' ? '押す' : '降りる')} / 正解: ${esc(j.correctAction === 'push' ? '押す' : '降りる')}</p>
    <p>${tierLine}</p>`;
}
```

- [ ] **Step 4: 筋の前提に関する注記をUIに追加する**

`index.html`内の3箇所、`<p class="modeCaption">最も安全な牌を1枚クリックしてください。</p>`、`<p class="modeCaption">安全な順にクリックしてください。</p>`、`<p class="modeCaption">候補牌(直前に引いた牌)を押すか降りるか選んでください。</p>`のそれぞれの直後に、以下の1行を追加する:

```html
  <p class="modeCaption">※筋・壁・ノーチャンスは主に両面待ちが対象です。シャンポン・単騎・カンチャン待ちには通用しません。</p>
```

具体的には、危険牌クイズ(`dangerRoot`)は:

```html
  <p class="modeCaption">最も安全な牌を1枚クリックしてください。</p>
  <p class="modeCaption">※筋・壁・ノーチャンスは主に両面待ちが対象です。シャンポン・単騎・カンチャン待ちには通用しません。</p>
  <div class="hand" id="dangerHand"></div>
```

安全度ランキング(`rankingRoot`)は:

```html
  <p class="modeCaption">安全な順にクリックしてください。</p>
  <p class="modeCaption">※筋・壁・ノーチャンスは主に両面待ちが対象です。シャンポン・単騎・カンチャン待ちには通用しません。</p>
  <div class="hand" id="rankingSource"></div>
```

押し引き二択(`pushfoldRoot`)は:

```html
  <p class="modeCaption">候補牌(直前に引いた牌)を押すか降りるか選んでください。</p>
  <p class="modeCaption">※筋・壁・ノーチャンスは主に両面待ちが対象です。シャンポン・単騎・カンチャン待ちには通用しません。</p>
  <div class="hand" id="pushfoldHand"></div>
```

- [ ] **Step 5: `test.html`で回帰確認する**

このタスクはUI描画のみの変更で新規assertは追加しないため、既存テストが`ALL OK`のままであることのみ確認する。

- [ ] **Step 6: ブラウザで目視確認する**

`mcp__Claude_Preview__preview_eval`で`index.html`に遷移し(`window.location.href='/index.html'`)、以下を確認する:

1. `document.querySelector('.modeBtn[data-mode="danger"]').click()`を実行し、`newDangerProblem()`をループ実行してリーチ2人の局面を引き当てる（`dangerProblem.opponents.length === 2`になるまで）。
2. 手牌の牌を1つクリックして解答し、`document.getElementById('dangerExplain').innerHTML`に`対リーチ1`と`対リーチ2`の列が含まれることを確認する。
3. `document.getElementById('dangerOpponents').innerHTML`に`巡目`という文字列が含まれることを確認する。
4. `document.querySelector('.modeCaption')`系の要素に「両面待ちが対象」という注記文が含まれることを`preview_snapshot`または`innerHTML`確認で確かめる。
5. 同様に押し引き二択モードでも`newPushFoldProblem()`をリーチ2人が出るまでループし、回答後に`pushfoldExplain`へ`対リーチ1`が含まれることを確認する。

- [ ] **Step 7: コミット**

```bash
git add app.js index.html
git commit -m "feat: 解説にリーチ者別階級内訳・巡目表示・筋の前提注記を追加"
```

---

### Task 8: 最終検証

**Files:** なし(検証のみ)

- [ ] **Step 1: 全テストがグリーンであることを確認する**

`test.html`を開き、`document.getElementById('out').textContent`に`NG`が1件も無いことを確認する。

- [ ] **Step 2: 4モードすべてをブラウザで一通り操作する**

`index.html`を開き、`何切る`・`危険牌クイズ`・`安全度ランキング`・`押し引き二択`の4モードそれぞれで最低1問ずつ回答し、正誤判定・解説表示・成績更新が正しく動くことを確認する。特に以下を重点確認する:

- 危険牌クイズの解説テーブルに「対リーチN」列が正しい階級を示している。
- 押し引き二択で、同じ危険度の牌でも手牌によって（打点が高いケースと低いケースで）判定が変わりうることを、`newPushFoldProblem()`を複数回実行して結果のバリエーションを目視確認する。
- 安全度ランキング・危険牌クイズのキャプションに筋の前提注記が表示されている。
- リーチ者ラベルに巡目が表示されている。

- [ ] **Step 3: 既存の「何切る」モードに影響が無いことを確認する**

`何切る`モードで難易度セレクタ・字牌トグル・成績表示が従来通り動作することを確認する（今回の変更は`何切る`モードのロジックには一切触れていないため、回帰は起きないはずである）。

- [ ] **Step 4: コミット(最終確認のみで差分が無ければコミット不要)**

差分が発生していなければコミット不要。もし目視確認中にタイポ等の軽微な修正が発生した場合は個別にコミットする。
