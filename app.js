"use strict";
const $ = id => document.getElementById(id);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function initUI(){
  if (!$('quizRoot')) return;
  $('hand').textContent = '準備中…';
}

document.addEventListener('DOMContentLoaded', initUI);
