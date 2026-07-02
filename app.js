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

function initUI(){
  if (!$('quizRoot')) return;
  $('nextBtn').addEventListener('click', newProblem);
  renderStats(loadStats());
  newProblem();
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

  // stats
  localStorage.removeItem(STATS_KEY);
  const s0 = loadStats();
  assertEqual('初期成績', s0, { attempts:0, correct:0, currentStreak:0, bestStreak:0 });
  saveStats({ attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  const s1 = loadStats();
  assertEqual('保存後の成績', s1, { attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  localStorage.removeItem(STATS_KEY);
};

document.addEventListener('DOMContentLoaded', initUI);
