"use strict";
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

const $ = id => document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function initUI(){
  if (!$('quizRoot')) return;
  $('hand').textContent = '準備中…';
}

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

// テスト用ヘルパ: "123m456p" のような記法を34要素配列に変換する
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

  // 通常形シャンテン
  assertEqual('通常形-和了(4面子1雀頭)', stdShanten(mkCounts('123456789m12355p')), -1);
  assertEqual('通常形-テンパイ単騎待ち', stdShanten(mkCounts('123456789m1235p')), 0);
  assertEqual('通常形-1シャンテン', stdShanten(mkCounts('123456m789p45p1s')), 1);
  assertEqual('通常形-完全孤立(役に立つ塊なし)', stdShanten(mkCounts('147m147p147s1234z')), 8);

  // 七対子・国士無双・統合shanten
  assertEqual('七対子-テンパイ(6対子+1)', chiitoiShanten(mkCounts('1122334455667m')), 0);
  assertEqual('国士無双-テンパイ(13種1枚ずつ)', kokushiShanten(mkCounts('19m19p19s1234567z')), 0);
  assertEqual('国士無双-和了(対子あり)', kokushiShanten(mkCounts('119m19p19s1234567z')), -1);
  assertEqual('統合shanten-和了', shanten(mkCounts('123456789m12355p')), -1);
  assertEqual('統合shanten-完全孤立(七対子側が有利)', shanten(mkCounts('147m147p147s1234z')), 6);

  // ukeire
  const tankiHand = mkCounts('123456789m1235p');
  const uk = ukeire(tankiHand);
  assertEqual('単騎待ちukeire-合計枚数', uk.total, 3);
  assertEqual('単騎待ちukeire-受け入れ牌', uk.accepted, [[13, 3]]); // 13 = 5p (9+5-1)
};

document.addEventListener('DOMContentLoaded', initUI);
