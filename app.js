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

document.addEventListener('DOMContentLoaded', initUI);
