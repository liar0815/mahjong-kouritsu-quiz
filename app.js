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
let includeHonors = false;
let answered = false;

function newProblem(){
  answered = false;
  $('feedback').textContent = '';
  $('feedback').className = 'feedback';
  $('explain').innerHTML = '';
  $('nextBtn').style.display = 'none';
  currentProblem = generateProblem(mulberry32(Date.now() ^ (Math.random()*1e9)), currentDifficulty, includeHonors);
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
  document.querySelectorAll('.diffBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDifficulty = btn.dataset.diff;
      document.querySelectorAll('.diffBtn').forEach(b => b.classList.toggle('active', b === btn));
      newProblem();
    });
  });
  document.querySelector('.diffBtn[data-diff="all"]').classList.add('active');
  $('honorToggle').addEventListener('change', () => {
    includeHonors = $('honorToggle').checked;
    newProblem();
  });
  renderStats(loadStats());
  newProblem();

  document.querySelectorAll('.modeBtn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
  $('dangerNextBtn').addEventListener('click', newDangerProblem);
  $('rankingNextBtn').addEventListener('click', newRankingProblem);
  $('rankingResetBtn').addEventListener('click', resetRanking);
  $('pushfoldNextBtn').addEventListener('click', newPushFoldProblem);
  document.querySelectorAll('#pushfoldButtons button').forEach(btn => {
    btn.addEventListener('click', () => onPushFoldChoice(btn.dataset.action));
  });
  renderDangerStats(loadStats(DANGER_STATS_KEY));
  renderRankingStats(loadStats(RANKING_STATS_KEY));
  renderPushFoldStats(loadStats(PUSHFOLD_STATS_KEY));
  switchMode('kiru');
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

// 牌山からランダムに14枚を引く(Fisher-Yatesシャッフルの先頭14枚を採用)。
// includeHonors=falseの場合、字牌(27-33)を山に含めない(27種×4枚=108枚から抽選)。
function drawRandomHand(rng, includeHonors) {
  const tileKinds = includeHonors ? TILE_COUNT : 27;
  const pool = [];
  for (let t = 0; t < tileKinds; t++) for (let k = 0; k < 4; k++) pool.push(t);
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
function generateProblem(rng, difficulty, includeHonors) {
  for (;;) {
    const hand = drawRandomHand(rng, includeHonors);
    const discardOptions = evaluateDiscards(hand);
    const bestShanten = Math.min(...discardOptions.map(o => o.shantenAfter));
    if (difficulty === 'all') return { hand, discardOptions, bestShanten };
    if (difficulty === 'tenpai' && bestShanten <= 1) return { hand, discardOptions, bestShanten };
    if (difficulty === 'mid' && bestShanten >= 2 && bestShanten <= 3) return { hand, discardOptions, bestShanten };
  }
}

// ==================== 放銃回避トレーニング: 危険度判定エンジン ====================

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

// idxを{suit, v}に変換する。字牌はsuit:null。
function tileSuitAndValue(idx) {
  if (idx < 9) return { suit: 'm', v: idx + 1 };
  if (idx < 18) return { suit: 'p', v: idx - 9 + 1 };
  if (idx < 27) return { suit: 's', v: idx - 18 + 1 };
  return { suit: null, v: null };
}

// 自分の手牌＋全リーチ者の捨て牌＋ドラ表示牌を合算した「場に見えている枚数」配列(34要素)を作る。
function visibleCounts(hand, opponents, doraIndicator) {
  const v = hand.slice();
  for (const opp of opponents) for (const t of opp.discards) v[t]++;
  v[doraIndicator]++;
  return v;
}

// vを待つ両面搭子の2形((v-2,v-1)と(v+1,v+2))それぞれについて、
// 構成牌のどちらかが4枚見えていれば「その搭子は場に存在しえない」と判定する。
// 範囲外(存在しない搭子)は最初から無いものとして自動的に死亡扱いにする。
function isNoChance(tile, allVisible) {
  const { suit, v } = tileSuitAndValue(tile);
  if (suit === null) return false;
  const base = tile - (v - 1);
  const dead = (a, b) => {
    if (a < 1 || b > 9) return true;
    return allVisible[base + a - 1] >= 4 || allVisible[base + b - 1] >= 4;
  };
  return dead(v + 1, v + 2) && dead(v - 2, v - 1);
}

// isNoChanceと同じ2搭子モデルで、どちらかの搭子の構成牌がちょうど3枚見えている(ノーチャンスの一歩手前)場合を壁と判定する。
function isKabe(tile, allVisible) {
  const { suit, v } = tileSuitAndValue(tile);
  if (suit === null) return false;
  const base = tile - (v - 1);
  const kabeDead = (a, b) => {
    if (a < 1 || b > 9) return false;
    return allVisible[base + a - 1] === 3 || allVisible[base + b - 1] === 3;
  };
  return kabeDead(v + 1, v + 2) || kabeDead(v - 2, v - 1);
}

// 1人のリーチ者に対する単一牌の危険度階級を判定する。{tier, reason}を返す。
// 判定順序(安全側から): 現物 → ノーチャンス → 両筋/片筋 → 壁 → 無地/字牌の視認枚数。
function classifyAgainstOpponent(tile, opponent, allVisible) {
  const discardSet = opponent.discards;
  if (discardSet.includes(tile)) return { tier: DANGER_TIERS.GENBUTSU, reason: 'genbutsu' };

  const { suit, v } = tileSuitAndValue(tile);

  if (suit === null) {
    const seen = allVisible[tile];
    if (seen >= 3) return { tier: DANGER_TIERS.SUJI_ONE, reason: 'honor-visible3' };
    if (seen >= 1) return { tier: DANGER_TIERS.MODERATE, reason: 'honor-visible-low' };
    return { tier: DANGER_TIERS.DANGEROUS, reason: 'honor-shonpai' };
  }

  if (isNoChance(tile, allVisible)) return { tier: DANGER_TIERS.NOCHANCE, reason: 'nochance' };

  const base = tile - (v - 1);
  const partners = [];
  if (v - 3 >= 1) partners.push(base + (v - 3) - 1);
  if (v + 3 <= 9) partners.push(base + (v + 3) - 1);
  const partnersGenbutsu = partners.filter(p => discardSet.includes(p)).length;

  if (partners.length === 2 && partnersGenbutsu === 2) return { tier: DANGER_TIERS.SUJI_BOTH, reason: 'suji-both' };
  if (partnersGenbutsu >= 1) return { tier: DANGER_TIERS.SUJI_ONE, reason: 'suji-one' };

  if (isKabe(tile, allVisible)) return { tier: DANGER_TIERS.KABE, reason: 'kabe' };

  const d = Math.min(v - 1, 9 - v);
  return d >= 3 ? { tier: DANGER_TIERS.DANGEROUS, reason: 'middle' } : { tier: DANGER_TIERS.MODERATE, reason: 'terminal-ish' };
}

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

// 一つの牌山プールから、自分の手牌14枚→各リーチ者の捨て牌→ドラ表示牌の順に逐次スライスする。
// drawRandomHandと同じシャッフル方式だが、手牌以外も同じ山から消費するため独立した関数とする。
function drawSafetyScenario(rng, includeHonors) {
  const tileKinds = includeHonors ? TILE_COUNT : 27;
  const pool = [];
  for (let t = 0; t < tileKinds; t++) for (let k = 0; k < 4; k++) pool.push(t);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let cursor = 0;
  const hand = new Array(TILE_COUNT).fill(0);
  for (let i = 0; i < 14; i++) hand[pool[cursor++]]++;

  // 0/1/2人のリーチ者数を重み付きランダムで決定: 0人=40%, 1人=40%, 2人=20%
  const roll = rng();
  const riichiCount = roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2;

  const opponents = [];
  for (let r = 0; r < riichiCount; r++) {
    const discardLen = 6 + Math.floor(rng() * 7); // 6〜12枚
    const discards = [];
    for (let i = 0; i < discardLen && cursor < pool.length; i++) discards.push(pool[cursor++]);
    const riichiDiscardIndex = Math.floor(rng() * discards.length); // リーチ宣言時に切った牌の位置
    opponents.push({ discards, riichiDiscardIndex });
  }

  const doraIndicator = cursor < pool.length ? pool[cursor++] : pool[0];
  return { hand, opponents, doraIndicator, riichiCount };
}

// 危険牌クイズ用の問題を生成する。リーチ0人だと出題として無意味なため再抽選する。
function generateDangerQuizProblem(rng, includeHonors) {
  for (;;) {
    const scenario = drawSafetyScenario(rng, includeHonors);
    if (scenario.opponents.length === 0) continue;
    const candidates = [];
    for (let t = 0; t < TILE_COUNT; t++) {
      if (scenario.hand[t] === 0) continue;
      const result = overallDangerTier(t, scenario);
      candidates.push({ tile: t, tier: result.tier, reason: result.reason, isCorrect: false });
    }
    const minTier = Math.min(...candidates.map(c => c.tier));
    for (const c of candidates) c.isCorrect = c.tier === minTier;
    return { ...scenario, candidates };
  }
}

// 手牌から5種類の牌をランダムに選ぶ。選んだ牌の階級が全て同一だと出題として無意味なため、
// 最大10回まで選び直し、2種類以上の階級が混ざる組み合わせを優先する(それでも揃わなければそのまま採用)。
function pickRankingTiles(scenario, rng) {
  const kinds = [];
  for (let t = 0; t < TILE_COUNT; t++) if (scenario.hand[t] > 0) kinds.push(t);

  const pickOnce = () => {
    const pool = kinds.slice();
    const picked = [];
    for (let i = 0; i < 5 && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  };

  let picked = pickOnce();
  for (let attempt = 0; attempt < 10; attempt++) {
    const tiers = new Set(picked.map(t => overallDangerTier(t, scenario).tier));
    if (tiers.size >= 2) break;
    picked = pickOnce();
  }
  return picked;
}

// ユーザーの並び順の階級列が非減少かどうかを判定する。同階級同士の順序は自由。
// 逆転が起きた隣接ペアのインデックス(i-1とiの間で逆転していればi)も返す。
function checkSafetyRanking(userOrder, scenario) {
  const tierOf = t => overallDangerTier(t, scenario).tier;
  const wrongPairIndices = [];
  for (let i = 1; i < userOrder.length; i++) {
    if (tierOf(userOrder[i]) < tierOf(userOrder[i - 1])) wrongPairIndices.push(i);
  }
  return { isCorrect: wrongPairIndices.length === 0, wrongPairIndices };
}

// 安全度ランキング用の問題を生成する。リーチ0人だと階級差が無く出題として無意味なため再抽選する。
function generateRankingProblem(rng, includeHonors) {
  for (;;) {
    const scenario = drawSafetyScenario(rng, includeHonors);
    if (scenario.opponents.length === 0) continue;
    const tiles = pickRankingTiles(scenario, rng);
    return { ...scenario, tiles };
  }
}

// candidateTileを切った13枚での自分のシャンテン数(押し引き判断の基準)。
function ownShantenExcludingCandidate(hand14, candidateTile) {
  const c13 = hand14.slice();
  c13[candidateTile]--;
  return shanten(c13);
}

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

// 押し引き二択用の問題を生成する。手牌からランダムに1枚を「直前の自摸」として選ぶ。
function generatePushFoldProblem(rng, includeHonors) {
  const scenario = drawSafetyScenario(rng, includeHonors);
  const kinds = [];
  for (let t = 0; t < TILE_COUNT; t++) if (scenario.hand[t] > 0) kinds.push(t);
  const candidateTile = kinds[Math.floor(rng() * kinds.length)];
  const judgment = evaluatePushFold(scenario.hand, candidateTile, scenario);
  return { ...scenario, candidateTile, judgment };
}

// handを牌カードとしてcontainerId(既定'hand')に描画する。onTileClickはカードクリック時に(tileIndex, cardElement)を渡して呼ばれる。
function renderHand(hand, onTileClick, containerId = 'hand') {
  const container = $(containerId);
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

// ==================== 放銃回避トレーニング: 描画・状態・UI配線 ====================

const REASON_LABELS = {
  'genbutsu': '現物', 'nochance': 'ノーチャンス', 'suji-both': '両筋・中筋', 'suji-one': '片筋', 'kabe': '壁',
  'honor-visible3': '字牌(3枚以上見え)', 'honor-visible-low': '字牌(視認少)', 'honor-shonpai': '字牌(生牌)',
  'middle': '無地(中央寄り)', 'terminal-ish': '無地(端寄り)', 'no-riichi': 'リーチ者なし'
};
function reasonLabel(reason) { return REASON_LABELS[reason] || reason; }

const DANGER_STATS_KEY = 'mahjong_danger_stats';
const RANKING_STATS_KEY = 'mahjong_ranking_stats';
const PUSHFOLD_STATS_KEY = 'mahjong_pushfold_stats';

// リーチ者ごとの捨て牌一覧とドラ表示牌をcontainerIdに描画する。リーチ0人なら「リーチ者なし」を表示する。
function renderOpponents(containerId, opponents, doraIndicator) {
  const container = $(containerId);
  if (opponents.length === 0) {
    container.innerHTML = '<p class="modeCaption">リーチ者なし</p>';
    return;
  }
  const rows = opponents.map((opp, i) => {
    const tiles = opp.discards.map((t, idx) => {
      const riichiClass = idx === opp.riichiDiscardIndex ? ' riichi' : '';
      const riichiTitle = idx === opp.riichiDiscardIndex ? '(リーチ宣言牌) ' : '';
      return `<div class="tile tiny ${tileSuitClass(t)}${riichiClass}" title="${riichiTitle}${esc(tileLabel(t))}">${tileGlyph(t)}</div>`;
    }).join('');
    return `<div class="opponentRow"><span class="opponentLabel">リーチ${i + 1}</span><div class="opponentDiscards">${tiles}</div></div>`;
  }).join('');
  const dora = `<div class="doraIndicator">ドラ表示: <div class="tile tiny ${tileSuitClass(doraIndicator)}" title="${esc(tileLabel(doraIndicator))}">${tileGlyph(doraIndicator)}</div></div>`;
  container.innerHTML = rows + dora;
}

// ---- 危険牌クイズ ----
let dangerProblem = null;
let dangerAnswered = false;

function newDangerProblem() {
  dangerAnswered = false;
  $('dangerFeedback').textContent = '';
  $('dangerFeedback').className = 'feedback';
  $('dangerExplain').innerHTML = '';
  $('dangerNextBtn').style.display = 'none';
  dangerProblem = generateDangerQuizProblem(mulberry32(Date.now() ^ (Math.random() * 1e9)), true);
  renderOpponents('dangerOpponents', dangerProblem.opponents, dangerProblem.doraIndicator);
  renderHand(dangerProblem.hand, onDangerTileClick, 'dangerHand');
}

function onDangerTileClick(tile, el) {
  if (dangerAnswered) return;
  dangerAnswered = true;
  const chosen = dangerProblem.candidates.find(c => c.tile === tile);
  const isCorrect = chosen.isCorrect;

  document.querySelectorAll('#dangerHand .tile').forEach(node => {
    const t = Number(node.dataset.tile);
    const opt = dangerProblem.candidates.find(c => c.tile === t);
    if (opt && opt.isCorrect) node.classList.add('correct');
    node.classList.add('disabled');
  });
  if (!isCorrect) el.classList.add('wrong');

  $('dangerFeedback').textContent = isCorrect ? '正解！' : '不正解…';
  $('dangerFeedback').className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
  renderDangerExplain(dangerProblem.candidates, tile);
  $('dangerNextBtn').style.display = '';

  const stats = loadStats(DANGER_STATS_KEY);
  stats.attempts++;
  if (isCorrect) {
    stats.correct++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats, DANGER_STATS_KEY);
  renderDangerStats(stats);
}

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

function renderDangerStats(stats) {
  const rate = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
  $('dangerStatsBar').textContent =
    `出題数: ${stats.attempts} / 正解数: ${stats.correct} / 正答率: ${rate}% / 連続正解: ${stats.currentStreak} (自己ベスト ${stats.bestStreak})`;
}

// ---- 安全度ランキング ----
let rankingProblem = null;
let rankingOrder = [];
let rankingAnswered = false;

function newRankingProblem() {
  rankingAnswered = false;
  rankingOrder = [];
  $('rankingFeedback').textContent = '';
  $('rankingFeedback').className = 'feedback';
  $('rankingExplain').innerHTML = '';
  $('rankingNextBtn').style.display = 'none';
  rankingProblem = generateRankingProblem(mulberry32(Date.now() ^ (Math.random() * 1e9)), true);
  renderOpponents('rankingOpponents', rankingProblem.opponents, rankingProblem.doraIndicator);
  renderRankingSource();
  renderRankingOrder();
}

function renderRankingSource() {
  const container = $('rankingSource');
  container.innerHTML = '';
  rankingProblem.tiles.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tile ' + tileSuitClass(t);
    el.textContent = tileGlyph(t);
    el.title = esc(tileLabel(t));
    el.dataset.tile = String(t);
    if (rankingOrder.includes(t)) el.classList.add('disabled');
    el.addEventListener('click', () => onRankingTileClick(t));
    container.appendChild(el);
  });
}

function renderRankingOrder() {
  const filled = rankingOrder.map(t => `<div class="rankingSlot filled tile tiny ${tileSuitClass(t)}">${tileGlyph(t)}</div>`).join('');
  const empty = new Array(rankingProblem.tiles.length - rankingOrder.length).fill('<div class="rankingSlot"></div>').join('');
  $('rankingOrder').innerHTML = filled + empty;
}

function onRankingTileClick(tile) {
  if (rankingAnswered || rankingOrder.includes(tile)) return;
  rankingOrder.push(tile);
  renderRankingSource();
  renderRankingOrder();
  if (rankingOrder.length === rankingProblem.tiles.length) finishRanking();
}

function resetRanking() {
  if (rankingAnswered) return;
  rankingOrder = [];
  renderRankingSource();
  renderRankingOrder();
}

function finishRanking() {
  rankingAnswered = true;
  const result = checkSafetyRanking(rankingOrder, rankingProblem);
  $('rankingFeedback').textContent = result.isCorrect ? '正解！' : '不正解…';
  $('rankingFeedback').className = 'feedback ' + (result.isCorrect ? 'correct' : 'wrong');
  renderRankingExplain(result);
  $('rankingNextBtn').style.display = '';

  const stats = loadStats(RANKING_STATS_KEY);
  stats.attempts++;
  if (result.isCorrect) {
    stats.correct++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats, RANKING_STATS_KEY);
  renderRankingStats(stats);
}

function renderRankingExplain(result) {
  const rows = rankingOrder.map((t, i) => {
    const tier = overallDangerTier(t, rankingProblem).tier;
    const cls = result.wrongPairIndices.includes(i) ? 'wrong-pair' : '';
    return `<tr class="${cls}"><td>${i + 1}</td><td>${esc(tileLabel(t))}</td><td>${esc(TIER_LABELS[tier])}</td></tr>`;
  }).join('');
  $('rankingExplain').innerHTML = `
    <table>
      <thead><tr><th>順番</th><th>牌</th><th>階級</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRankingStats(stats) {
  const rate = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
  $('rankingStatsBar').textContent =
    `出題数: ${stats.attempts} / 正解数: ${stats.correct} / 正答率: ${rate}% / 連続正解: ${stats.currentStreak} (自己ベスト ${stats.bestStreak})`;
}

// ---- 押し引き二択 ----
let pushfoldProblem = null;
let pushfoldAnswered = false;

function newPushFoldProblem() {
  pushfoldAnswered = false;
  $('pushfoldFeedback').textContent = '';
  $('pushfoldFeedback').className = 'feedback';
  $('pushfoldExplain').innerHTML = '';
  $('pushfoldNextBtn').style.display = 'none';
  pushfoldProblem = generatePushFoldProblem(mulberry32(Date.now() ^ (Math.random() * 1e9)), true);
  renderOpponents('pushfoldOpponents', pushfoldProblem.opponents, pushfoldProblem.doraIndicator);
  renderPushFoldHand();
}

function renderPushFoldHand() {
  const container = $('pushfoldHand');
  container.innerHTML = '';
  for (let t = 0; t < TILE_COUNT; t++) {
    for (let k = 0; k < pushfoldProblem.hand[t]; k++) {
      const el = document.createElement('div');
      el.className = 'tile ' + tileSuitClass(t) + (t === pushfoldProblem.candidateTile ? ' candidate' : '');
      el.textContent = tileGlyph(t);
      el.title = esc(tileLabel(t));
      container.appendChild(el);
    }
  }
}

function onPushFoldChoice(action) {
  if (pushfoldAnswered) return;
  pushfoldAnswered = true;
  const isCorrect = action === pushfoldProblem.judgment.correctAction;

  $('pushfoldFeedback').textContent = isCorrect ? '正解！' : '不正解…';
  $('pushfoldFeedback').className = 'feedback ' + (isCorrect ? 'correct' : 'wrong');
  renderPushFoldExplain(action);
  $('pushfoldNextBtn').style.display = '';

  const stats = loadStats(PUSHFOLD_STATS_KEY);
  stats.attempts++;
  if (isCorrect) {
    stats.correct++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats, PUSHFOLD_STATS_KEY);
  renderPushFoldStats(stats);
}

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

function renderPushFoldStats(stats) {
  const rate = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
  $('pushfoldStatsBar').textContent =
    `出題数: ${stats.attempts} / 正解数: ${stats.correct} / 正答率: ${rate}% / 連続正解: ${stats.currentStreak} (自己ベスト ${stats.bestStreak})`;
}

// ---- モード切替 ----
const MODE_TITLES = {
  kiru: ['🀄 牌効率クイズ（何切る）', '14枚の手牌から、シャンテン数を進めつつ受け入れ枚数が最大になる1枚を選んでください。'],
  danger: ['🀄 危険牌クイズ', 'リーチ者の捨て牌を見て、最も安全な牌を選んでください。'],
  ranking: ['🀄 安全度ランキング', '手牌の中から、安全な順にクリックしてください。'],
  pushfold: ['🀄 押し引き二択', '候補牌を押すべきか、降りるべきか判断してください。']
};

function switchMode(mode) {
  document.body.dataset.mode = mode;
  $('pageTitle').textContent = MODE_TITLES[mode][0];
  $('pageDesc').textContent = MODE_TITLES[mode][1];
  document.querySelectorAll('.modeBtn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('quizRoot').style.display = mode === 'kiru' ? '' : 'none';
  $('dangerRoot').style.display = mode === 'danger' ? '' : 'none';
  $('rankingRoot').style.display = mode === 'ranking' ? '' : 'none';
  $('pushfoldRoot').style.display = mode === 'pushfold' ? '' : 'none';
  $('diffBar').style.display = mode === 'kiru' ? '' : 'none';
  $('honorToggleLabel').style.display = mode === 'kiru' ? '' : 'none';

  if (mode === 'danger' && !dangerProblem) newDangerProblem();
  if (mode === 'ranking' && !rankingProblem) newRankingProblem();
  if (mode === 'pushfold' && !pushfoldProblem) newPushFoldProblem();
}

const STATS_KEY = 'mahjong_kiru_stats';

function loadStats(key = STATS_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { attempts: 0, correct: 0, currentStreak: 0, bestStreak: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { attempts: 0, correct: 0, currentStreak: 0, bestStreak: 0 };
  }
}

function saveStats(stats, key = STATS_KEY) {
  localStorage.setItem(key, JSON.stringify(stats));
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
  const hand = drawRandomHand(rngHand, true);
  assertEqual('drawRandomHandは合計14枚', hand.reduce((a,b)=>a+b,0), 14);
  assertEqual('drawRandomHandは各牌最大4枚', hand.every(v => v <= 4), true);

  const handNoHonors = drawRandomHand(mulberry32(42), false);
  assertEqual('drawRandomHand(includeHonors=false)は字牌を含まない', handNoHonors.slice(27).every(v => v === 0), true);

  const probAll = generateProblem(mulberry32(7), 'all', true);
  assertEqual('generateProblem(all)は14枚', probAll.hand.reduce((a,b)=>a+b,0), 14);

  const probTenpai = generateProblem(mulberry32(7), 'tenpai', true);
  assertEqual('generateProblem(tenpai)はbestShantenが0か1', probTenpai.bestShanten <= 1, true);

  const probMid = generateProblem(mulberry32(7), 'mid', true);
  assertEqual('generateProblem(mid)はbestShantenが2か3', probMid.bestShanten >= 2 && probMid.bestShanten <= 3, true);

  // stats
  localStorage.removeItem(STATS_KEY);
  const s0 = loadStats();
  assertEqual('初期成績', s0, { attempts:0, correct:0, currentStreak:0, bestStreak:0 });
  saveStats({ attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  const s1 = loadStats();
  assertEqual('保存後の成績', s1, { attempts:1, correct:1, currentStreak:1, bestStreak:1 });
  localStorage.removeItem(STATS_KEY);

  // 危険度判定エンジン: tileSuitAndValue / visibleCounts
  assertEqual('tileSuitAndValue(0) 1m', tileSuitAndValue(0), { suit: 'm', v: 1 });
  assertEqual('tileSuitAndValue(8) 9m', tileSuitAndValue(8), { suit: 'm', v: 9 });
  assertEqual('tileSuitAndValue(9) 1p', tileSuitAndValue(9), { suit: 'p', v: 1 });
  assertEqual('tileSuitAndValue(27) 字牌はsuit:null', tileSuitAndValue(27), { suit: null, v: null });

  const vcHand = mkCounts('1m');
  const vc = visibleCounts(vcHand, [{ discards: [0, 1] }], 2);
  assertEqual('visibleCounts: 手牌+捨て牌+ドラ表示牌を合算(1m)', vc[0], 2); // 手牌1+捨て牌1
  assertEqual('visibleCounts: 捨て牌のみの牌(2m)', vc[1], 1);
  assertEqual('visibleCounts: ドラ表示牌のみの牌(3m)', vc[2], 1);

  // isNoChance / isKabe
  {
    // 5m(idx4)を中心に、両側の搭子(3m4m / 6m7m)を検証する
    const allVisibleBoth4 = new Array(TILE_COUNT).fill(0);
    allVisibleBoth4[3] = 4; // 4mが4枚見え(3m4m搭子が死亡)
    allVisibleBoth4[5] = 4; // 6mが4枚見え(6m7m搭子が死亡)
    assertEqual('isNoChance: 両側の搭子が死んでいれば5mはノーチャンス', isNoChance(4, allVisibleBoth4), true);

    const allVisibleOneSide = new Array(TILE_COUNT).fill(0);
    allVisibleOneSide[5] = 4; // 6mのみ4枚見え(片側の搭子のみ死亡)
    assertEqual('isNoChance: 片側の搭子しか死んでいなければ5mはノーチャンスではない', isNoChance(4, allVisibleOneSide), false);

    const allVisibleKabe = new Array(TILE_COUNT).fill(0);
    allVisibleKabe[5] = 3; // 6mが3枚見え(壁)
    assertEqual('isKabe: 搭子構成牌が3枚見えなら壁', isKabe(4, allVisibleKabe), true);
    assertEqual('isKabe相当の枚数ではノーチャンスにならない(境界確認)', isNoChance(4, allVisibleKabe), false);

    // 端牌1m(idx0): 搭子は(2m,3m)側のみ存在
    const allVisibleTerminalDead = new Array(TILE_COUNT).fill(0);
    allVisibleTerminalDead[1] = 4; // 2mが4枚見え
    assertEqual('isNoChance: 端牌1mは唯一の搭子(2m3m)が死んでいればノーチャンス', isNoChance(0, allVisibleTerminalDead), true);

    const allVisibleTerminalAlive = new Array(TILE_COUNT).fill(0);
    assertEqual('isNoChance: 端牌1mは搭子が生きていればノーチャンスではない', isNoChance(0, allVisibleTerminalAlive), false);
  }

  // classifyAgainstOpponent
  {
    const empty = new Array(TILE_COUNT).fill(0);

    // 現物
    const opp1 = { discards: [13] }; // 5p
    assertEqual('classify: 現物', classifyAgainstOpponent(13, opp1, empty).tier, DANGER_TIERS.GENBUTSU);

    // 両筋(5m=idx4, 相方2m=idx1と8m=idx7が両方現物)
    const oppSujiBoth = { discards: [1, 7] };
    assertEqual('classify: 両筋', classifyAgainstOpponent(4, oppSujiBoth, empty).tier, DANGER_TIERS.SUJI_BOTH);

    // 片筋(2mのみ現物)
    const oppSujiOne = { discards: [1] };
    assertEqual('classify: 片筋', classifyAgainstOpponent(4, oppSujiOne, empty).tier, DANGER_TIERS.SUJI_ONE);

    // ノーチャンスと筋が同時成立する場合はノーチャンスが優先される
    // 5m(idx4)についてノーチャンス成立(4m,6mが4枚見え)、かつ相方2m/8mも現物にしてsuji_bothの条件も満たす
    const allVisibleCombo = new Array(TILE_COUNT).fill(0);
    allVisibleCombo[3] = 4; // 4m
    allVisibleCombo[5] = 4; // 6m
    const oppCombo = { discards: [1, 7] }; // 2m, 8m(両筋も成立)
    assertEqual('classify: ノーチャンスと両筋が同時成立ならノーチャンス優先', classifyAgainstOpponent(4, oppCombo, allVisibleCombo).tier, DANGER_TIERS.NOCHANCE);

    // 無地端牌(1m)と無地中央(5m)
    assertEqual('classify: 無地端牌1mは中危険', classifyAgainstOpponent(0, { discards: [] }, empty).tier, DANGER_TIERS.MODERATE);
    assertEqual('classify: 無地中央5mは高危険', classifyAgainstOpponent(4, { discards: [] }, empty).tier, DANGER_TIERS.DANGEROUS);

    // 壁(kabe)は片筋より一段階危険側の独立tierになる(片筋は現物という確定情報、壁は3枚見えの確率的情報のため)
    const allVisibleKabeOnly = new Array(TILE_COUNT).fill(0);
    allVisibleKabeOnly[5] = 3; // 6mが3枚見え(壁)
    assertEqual('classify: 壁は片筋と別tier(KABE)', classifyAgainstOpponent(4, { discards: [] }, allVisibleKabeOnly).tier, DANGER_TIERS.KABE);

    // 字牌(東=idx27)の視認枚数による階級
    const honorVisible3 = new Array(TILE_COUNT).fill(0); honorVisible3[27] = 3;
    const honorVisible1 = new Array(TILE_COUNT).fill(0); honorVisible1[27] = 1;
    const honorVisible0 = new Array(TILE_COUNT).fill(0);
    assertEqual('classify: 字牌視認3枚', classifyAgainstOpponent(27, { discards: [] }, honorVisible3).tier, DANGER_TIERS.SUJI_ONE);
    assertEqual('classify: 字牌視認1枚', classifyAgainstOpponent(27, { discards: [] }, honorVisible1).tier, DANGER_TIERS.MODERATE);
    assertEqual('classify: 字牌生牌(視認0枚)', classifyAgainstOpponent(27, { discards: [] }, honorVisible0).tier, DANGER_TIERS.DANGEROUS);
  }

  // overallDangerTier
  {
    const scenarioNoRiichi = { opponents: [], hand: mkCounts('1m'), doraIndicator: 1 };
    assertEqual('overallDangerTier: リーチ0人なら常に安全', overallDangerTier(0, scenarioNoRiichi).tier, DANGER_TIERS.GENBUTSU);

    // リーチAには現物(5m=idx4で安全)、リーチBには無情報(中央牌で高危険)。最悪(最大)階級が採用される
    const scenarioMulti = {
      hand: mkCounts('1p'),
      opponents: [{ discards: [4] }, { discards: [] }],
      doraIndicator: 9 // 1p(idx9)
    };
    assertEqual('overallDangerTier: 複数リーチで最悪階級が採用される', overallDangerTier(4, scenarioMulti).tier, DANGER_TIERS.DANGEROUS);
  }

  // drawSafetyScenario
  {
    const scenario = drawSafetyScenario(mulberry32(123), true);
    assertEqual('drawSafetyScenario: 手牌は合計14枚', scenario.hand.reduce((a, b) => a + b, 0), 14);
    assertEqual('drawSafetyScenario: 各牌4枚以下', scenario.hand.every(v => v <= 4), true);
    assertEqual('drawSafetyScenario: riichiCountは0〜2', [0, 1, 2].includes(scenario.riichiCount), true);
    assertEqual('drawSafetyScenario: opponents数はriichiCountと一致', scenario.opponents.length, scenario.riichiCount);

    // 手牌+全捨て牌+ドラ表示牌を合算しても4枚を超えない(複数シードで確認)
    let overLimit = false;
    for (let seed = 0; seed < 30; seed++) {
      const s = drawSafetyScenario(mulberry32(seed), true);
      const vis = visibleCounts(s.hand, s.opponents, s.doraIndicator);
      if (vis.some(v => v > 4)) overLimit = true;
      if (s.opponents.some(o => o.discards.length < 6 || o.discards.length > 12)) overLimit = true;
    }
    assertEqual('drawSafetyScenario: 視認枚数は常に4枚以下・捨て牌は6〜12枚', overLimit, false);

    // リーチ宣言牌は捨て牌配列内の有効なインデックスとして各リーチ者に付与される
    let riichiIndexInvalid = false;
    for (let seed = 0; seed < 30; seed++) {
      const s = drawSafetyScenario(mulberry32(seed), true);
      for (const opp of s.opponents) {
        if (typeof opp.riichiDiscardIndex !== 'number' || opp.riichiDiscardIndex < 0 || opp.riichiDiscardIndex >= opp.discards.length) riichiIndexInvalid = true;
      }
    }
    assertEqual('drawSafetyScenario: riichiDiscardIndexは捨て牌配列内の有効な位置', riichiIndexInvalid, false);
  }

  // generateDangerQuizProblem
  {
    let alwaysHasRiichi = true;
    let allCorrectSameTier = true;
    for (let seed = 0; seed < 20; seed++) {
      const problem = generateDangerQuizProblem(mulberry32(seed), true);
      if (problem.opponents.length === 0) alwaysHasRiichi = false;
      const correctTiers = problem.candidates.filter(c => c.isCorrect).map(c => c.tier);
      const uniqueTiers = new Set(correctTiers);
      if (uniqueTiers.size !== 1) allCorrectSameTier = false;
      if (correctTiers.length === 0) allCorrectSameTier = false;
    }
    assertEqual('generateDangerQuizProblem: リーチ0人にはならない', alwaysHasRiichi, true);
    assertEqual('generateDangerQuizProblem: isCorrectは全て同一最小階級', allCorrectSameTier, true);
  }

  // checkSafetyRanking
  {
    // tile13(5p)=現物(tier0), tile0/9/18=無地端牌(tier4), tile4(5m)=無地中央(tier5)
    const scenario = { hand: mkCounts('1m5m1p5p1s'), opponents: [{ discards: [13] }], doraIndicator: 20 };
    const goodOrder = [13, 0, 9, 18, 4]; // tier: 0,4,4,4,5 = 非減少
    const badOrder = [4, 13, 0, 9, 18]; // tier: 5,0,4,4,4 = index1で逆転

    const goodResult = checkSafetyRanking(goodOrder, scenario);
    assertEqual('checkSafetyRanking: 非減少な並びは正解', goodResult.isCorrect, true);
    assertEqual('checkSafetyRanking: 正解時はwrongPairIndicesが空', goodResult.wrongPairIndices, []);

    const badResult = checkSafetyRanking(badOrder, scenario);
    assertEqual('checkSafetyRanking: 逆転がある並びは不正解', badResult.isCorrect, false);
    assertEqual('checkSafetyRanking: 逆転したペアのインデックスを返す', badResult.wrongPairIndices, [1]);
  }

  // pickRankingTiles / generateRankingProblem
  {
    let alwaysHasRiichi = true;
    let alwaysFiveOrFewer = true;
    for (let seed = 0; seed < 20; seed++) {
      const problem = generateRankingProblem(mulberry32(seed), true);
      if (problem.opponents.length === 0) alwaysHasRiichi = false;
      if (problem.tiles.length > 5) alwaysFiveOrFewer = false;
    }
    assertEqual('generateRankingProblem: リーチ0人にはならない', alwaysHasRiichi, true);
    assertEqual('generateRankingProblem: 選出牌は5種以下', alwaysFiveOrFewer, true);
  }

  // ownShantenExcludingCandidate / evaluatePushFold
  {
    // テンパイケース: 123456789m12356pの14枚から5p(idx13)を切ればテンパイ(shanten0)
    const tenpaiHand14 = mkCounts('123456789m12356p');
    assertEqual('ownShantenExcludingCandidate: テンパイ', ownShantenExcludingCandidate(tenpaiHand14, 13), 0);
    const tenpaiScenario = { hand: tenpaiHand14, opponents: [{ discards: [] }], doraIndicator: 26 };
    assertEqual('evaluatePushFold: テンパイなら常に押す', evaluatePushFold(tenpaiHand14, 13, tenpaiScenario).correctAction, 'push');

    // 1シャンテンケース: 123456789m45p1s9sの13枚+候補5s(idx22)
    const oneShantenHand14 = mkCounts('123456789m45p1s9s5s');
    assertEqual('ownShantenExcludingCandidate: 1シャンテン', ownShantenExcludingCandidate(oneShantenHand14, 22), 1);

    // 候補5sの相方(2s=idx19, 8s=idx25)が両方現物→両筋(tier2)→押すが正解
    const scenarioSujiBoth = { hand: oneShantenHand14, opponents: [{ discards: [19, 25] }], doraIndicator: 26 };
    assertEqual('evaluatePushFold: 1シャンテン+両筋(tier2)以下は押す', evaluatePushFold(oneShantenHand14, 22, scenarioSujiBoth).correctAction, 'push');

    // 候補5sの相方が片方(2sのみ)現物→片筋(tier3)→降りるが正解
    const scenarioSujiOne = { hand: oneShantenHand14, opponents: [{ discards: [19] }], doraIndicator: 26 };
    assertEqual('evaluatePushFold: 1シャンテン+片筋(tier3)以上は降りる', evaluatePushFold(oneShantenHand14, 22, scenarioSujiOne).correctAction, 'fold');

    // 2シャンテンケース: 123456789m1p4p7p1s(13枚、3面子+孤立牌4枚)+候補9s(idx26)
    const twoShantenHand14 = mkCounts('123456789m1p4p7p1s9s');
    assertEqual('ownShantenExcludingCandidate: 2シャンテン', ownShantenExcludingCandidate(twoShantenHand14, 26), 2);

    const scenarioRiichi = { hand: twoShantenHand14, opponents: [{ discards: [] }], doraIndicator: 8 };
    assertEqual('evaluatePushFold: 2シャンテン+リーチありは常に降りる', evaluatePushFold(twoShantenHand14, 26, scenarioRiichi).correctAction, 'fold');

    const scenarioNoRiichi = { hand: twoShantenHand14, opponents: [], doraIndicator: 8 };
    assertEqual('evaluatePushFold: リーチ0人ならシャンテンによらず押す', evaluatePushFold(twoShantenHand14, 26, scenarioNoRiichi).correctAction, 'push');
  }

  // generatePushFoldProblem
  {
    let allHaveJudgment = true;
    for (let seed = 0; seed < 10; seed++) {
      const problem = generatePushFoldProblem(mulberry32(seed), true);
      if (problem.judgment.correctAction !== 'push' && problem.judgment.correctAction !== 'fold') allHaveJudgment = false;
      if (problem.hand[problem.candidateTile] === 0) allHaveJudgment = false;
    }
    assertEqual('generatePushFoldProblem: 常に押す/降りるの判定を持つ', allHaveJudgment, true);
  }

  // loadStats/saveStatsのkey引数(既存の引数省略時の後方互換も確認)
  {
    const customKey = 'mahjong_danger_stats';
    localStorage.removeItem(customKey);
    localStorage.removeItem(STATS_KEY);

    saveStats({ attempts: 1, correct: 1, currentStreak: 1, bestStreak: 1 }); // key省略=既存キー
    saveStats({ attempts: 9, correct: 5, currentStreak: 2, bestStreak: 3 }, customKey);

    assertEqual('saveStats: key省略時は既存キーに保存される', loadStats(), { attempts: 1, correct: 1, currentStreak: 1, bestStreak: 1 });
    assertEqual('saveStats: key指定時は別キーに保存される', loadStats(customKey), { attempts: 9, correct: 5, currentStreak: 2, bestStreak: 3 });

    localStorage.removeItem(customKey);
    localStorage.removeItem(STATS_KEY);
  }
};

document.addEventListener('DOMContentLoaded', initUI);
