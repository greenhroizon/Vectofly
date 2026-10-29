// VectoFly layer: progress saving, procedural music + SFX, global + local leaderboard, hangar (planes / paints / maps), sky cycle.
var VF = (function(){
  var $ = function(i){ return document.getElementById(i); };
  var KEY = 'vectofly_save_v1', OLD_KEY = 'flyaero_save_v1';
  var CFG = window.VECTOFLY_CONFIG || {};
  var S = {name:'', uid:'', gbest:0, hi:0, coins:0, dist:0, games:0, bestLevel:1, music:true, sfx:true, board:[], gk:'', diff:'hard', wallet:-1, plane:'classic', planes:['classic'], skin:'default', skins:['default'], map:'coast', maps:['coast']};
  // Targets for the local board so it is never empty. They are clearly labelled bots, not real players.
  var BOTS = [{n:'Ace (bot)',s:9000,b:1},{n:'Maverick (bot)',s:5000,b:1},{n:'Skylark (bot)',s:2500,b:1},{n:'Rookie (bot)',s:800,b:1}];
  var shake = 0, lastWarn = 0, mode = 'menu', lastEarned = 0, F = {paused:false}, cg = null, muted = false, runCoins = 0, newBest = false, lastBoard = 0, frameN = 0, legit = 0, playMs = 0, cheated = false, ticket = null;

  // ---------- SAVE (localStorage + CrazyGames cloud data) ----------
  function merge(o){ if (o && typeof o === 'object' && (o.games||0) >= S.games){ for (var k in S) if (o[k] !== undefined) S[k] = o[k]; } }
  function load(){
    try { merge(JSON.parse(localStorage.getItem(KEY))); } catch(e){}
    if (!S.games){ try { merge(JSON.parse(localStorage.getItem(OLD_KEY))); } catch(e){} }   // keep progress from the FlyAero days
  }
  function save(){
    var j = JSON.stringify(S);
    try { localStorage.setItem(KEY, j); } catch(e){}
    try { if (cg) cg.data.setItem(KEY, j); } catch(e){}
  }
  function sdkInit(){
    try {
      if (!window.CrazyGames || !CrazyGames.SDK) return;
      CrazyGames.SDK.init().then(function(){
        cg = CrazyGames.SDK;
        try { var c = cg.data.getItem(KEY); if (c){ merge(JSON.parse(c)); dirty = true; drawPanel('menu'); } } catch(e){}
      }).catch(function(){});
    } catch(e){}
  }
  function withAd(done){
    if (!cg || !cg.ad){ done(); return; }
    var started = false, finished = false;
    var fin = function(){ if (finished) return; finished = true; muted = false; apply(); done(); };
    setTimeout(function(){ if (!started) fin(); }, 2500);   // safety: if no ad starts, just play
    setTimeout(fin, 60000);                                  // safety: an ad that never reports back can never block Play
    try { cg.ad.requestAd('midgame', {adStarted:function(){ started = true; muted = true; apply(); }, adFinished:fin, adError:fin}); } catch(e){ fin(); }
  }

  // ---------- AUDIO (all generated with WebAudio, no files) ----------
  var AC, master, musicG, sfxG, engine, engineG, step = 0, nextT = 0, timer = 0;
  var ROOTS = [45,41,48,43], CH = [[57,60,64,67],[53,57,60,65],[60,64,67,72],[55,59,62,67]];
  function hz(m){ return 440*Math.pow(2,(m-69)/12); }
  function ac(){
    if (!AC){
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      AC = new C(); var comp = AC.createDynamicsCompressor(); master = AC.createGain();
      master.connect(comp); comp.connect(AC.destination);
      musicG = AC.createGain(); sfxG = AC.createGain(); musicG.connect(master); sfxG.connect(master);
      engine = AC.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 60;
      var lp = AC.createBiquadFilter(); lp.frequency.value = 220; engineG = AC.createGain(); engineG.gain.value = 0;
      engine.connect(lp); lp.connect(engineG); engineG.connect(sfxG); engine.start();
      apply();
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function apply(){
    if (!AC) return;
    musicG.gain.value = (S.music && !muted) ? .35 : 0;
    sfxG.gain.value = (S.sfx && !muted) ? .6 : 0;
    var b = $('soundBtn'); if (b) b.className = (S.music || S.sfx) && !muted ? '' : 'off';
  }
  function tone(t,f,d,type,v,dest,slide){
    var o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f,t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide,t+d);
    g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t+d+.02);
  }
  function noise(t,d,v,dest,hp){
    var n = Math.floor(AC.sampleRate*d), b = AC.createBuffer(1,n,AC.sampleRate), a = b.getChannelData(0);
    for (var i=0;i<n;i++) a[i] = Math.random()*2-1;
    var s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp ? 7000 : 900;
    s.buffer = b; g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.001,t+d);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t);
  }
  function lvl(){ return (typeof game !== 'undefined' && game.status === 'playing') ? game.level : 1; }
  function playStep(s,t){
    var bar = Math.floor(s/8)%4, i = s%8, ch = CH[bar], L = lvl();
    tone(t, hz(ch[[0,1,2,3,2,1,2,3][i]]+12), .22, 'square', .05, musicG);
    if (i===0){ ch.forEach(function(m){ tone(t,hz(m),.9*60/tempo()*8/4,'triangle',.05,musicG); }); }
    if (i===0||i===3||i===4||i===6) tone(t, hz(ROOTS[bar]), .25, 'triangle', .2, musicG);
    if (L>=2 && (i===0||i===4)) tone(t, 130, .15, 'sine', .35, musicG, 40);
    if (L>=3 && i%2===1) noise(t,.04,.05,musicG,true);
    if (L>=5 && i===6) tone(t, hz(ch[3]+24), .3, 'sawtooth', .03, musicG);
  }
  function tempo(){ return Math.min(150, 96 + (lvl()-1)*4); }
  function sched(){
    if (!AC) return;
    while (nextT < AC.currentTime + .25){ playStep(step,nextT); nextT += 60/tempo()/2; step++; }
  }
  function musicStart(){ if (!ac() || timer) return; nextT = AC.currentTime + .05; timer = setInterval(sched, 60); }
  function sfx(kind){
    if (!ac()) return; var t = AC.currentTime;
    if (kind==='coin'){ tone(t,880,.08,'square',.18,sfxG); tone(t+.07,1320,.14,'square',.18,sfxG); }
    else if (kind==='hit'){ noise(t,.35,.9,sfxG); tone(t,170,.3,'sawtooth',.3,sfxG,45); }
    else if (kind==='level'){ [523,659,784,1047].forEach(function(f,i){ tone(t+i*.08,f,.15,'triangle',.25,sfxG); }); }
    else if (kind==='fuel'){ tone(t,400,.25,'sawtooth',.2,sfxG,900); tone(t+.1,800,.2,'triangle',.2,sfxG); }
    else if (kind==='warn'){ tone(t,330,.12,'square',.15,sfxG); tone(t+.15,330,.12,'square',.15,sfxG); }
    else if (kind==='over'){ tone(t,440,1,'sawtooth',.3,sfxG,70); }
  }

  // ---------- LEADERBOARD: global (own Node server, or Firebase Realtime Database over REST) + local ----------
  // API_URL / same-origin /api/scores -> server/server.js ; FIREBASE_URL -> Firebase. Neither reachable -> local board only.
  var G = {list:null, state:'idle', at:0, dead:false, err:'', rej:'', visitors:-1};
  function mode_(){ return CFG.FIREBASE_URL ? 'fb' : 'api'; }
  function apiBase(){ return String(CFG.API_URL || '').replace(/\/+$/,''); }
  function gOn(){
    if (!window.fetch || G.dead) return false;
    if (mode_() === 'fb') return true;
    return !!CFG.API_URL || /^https?:$/.test(location.protocol);   // same-origin probe when served over http(s)
  }
  function gUrl(path){ return String(CFG.FIREBASE_URL).replace(/\/+$/,'') + '/' + (CFG.BOARD_PATH || 'scores') + (path || '') + '.json'; }
  function withTimeout(p, ms){ return new Promise(function(res, rej){ var t = setTimeout(function(){ rej(new Error('timeout')); }, ms); p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); }); }); }
  function myKey(){ return mode_() === 'fb' ? S.uid : S.gk; }
  function gFetch(force){
    if (!gOn() || G.state === 'loading') return;
    if (!force && G.list && Date.now() - G.at < 8000) return;
    G.state = 'loading'; if (!G.list) paintBoard();
    var top = CFG.SHOW_TOP || 20, fb = mode_() === 'fb', bust = fb ? '' : '&_=' + Date.now();   // cache-buster: every device always sees fresh scores
    var url = fb ? gUrl('') + '?orderBy=%22s%22&limitToLast=' + top + bust : apiBase() + '/api/scores?limit=' + top + bust;
    withTimeout(fetch(url, {cache:'no-store'}), 9000)
      .then(function(r){ if (!r.ok){ var er = new Error('http ' + r.status); er.status = r.status; return r.text().then(function(t){ try { er.hint = (JSON.parse(t) || {}).hint || ''; } catch(x){} throw er; }); } return r.json(); })
      .then(function(j){
        var arr = [];
        if (fb){
          if (j && typeof j === 'object') for (var k in j){ var e = j[k]; if (e && typeof e.s === 'number' && typeof e.n === 'string') arr.push({n:e.n.slice(0,12), s:Math.floor(e.s), k:k}); }
        } else {
          if (!j || !j.scores){ var en = new Error('not a score server'); en.notJson = true; throw en; }
          if (typeof j.visitors === 'number') G.visitors = j.visitors;
          j.scores.forEach(function(e){ if (e && typeof e.s === 'number') arr.push({n:String(e.n).slice(0,12), s:Math.floor(e.s), k:e.k}); });
        }
        arr.sort(function(a,b){ return b.s - a.s; });
        G.list = arr; G.state = 'ok'; G.err = ''; G.at = Date.now(); paintBoard();
      })
      .catch(function(e){
        // a plain static host has no /api/scores (404 / not JSON): fall back to the local board. Any other error is
        // temporary (server hiccup, bad Redis setup, offline), so keep the World tab and retry on the next refresh.
        if (mode_() === 'api' && !CFG.API_URL && !G.list && e && (e.status === 404 || e.notJson)){ G.dead = true; }
        G.err = (e && e.hint) || ''; G.state = 'err'; G.at = Date.now(); paintBoard();
      });
  }
  function newId(){
    var s = '';
    try { var a = new Uint8Array(12); crypto.getRandomValues(a); for (var i=0;i<a.length;i++) s += (a[i] % 36).toString(36); }
    catch(e){ s = Math.random().toString(36).slice(2,14); }
    return 'p' + s + Date.now().toString(36);
  }
  // anti-cheat: the server hands out a signed single-use ticket when a flight starts and checks the finished run against it
  // counts this device once (server keeps one entry per device id, so reloads never double count)
  function gVisit(){
    if (!gOn() || mode_() === 'fb') return;
    if (!S.uid){ S.uid = newId(); save(); }
    withTimeout(fetch(apiBase() + '/api/scores', {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'visit', id:S.uid})}), 8000)
      .then(function(r){ if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function(j){ if (j && typeof j.visitors === 'number'){ G.visitors = j.visitors; paintBoard(); } })
      .catch(function(){});
  }
  function gStart(){
    ticket = null;
    if (!gOn() || mode_() === 'fb') return;
    if (!S.uid){ S.uid = newId(); save(); }
    withTimeout(fetch(apiBase() + '/api/scores', {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'start', id:S.uid})}), 8000)
      .then(function(r){ if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function(j){ if (j && j.t) ticket = j.t; })
      .catch(function(){});
  }
  function gSubmit(score, dist, level, pills){
    if (!gOn() || score <= 0 || cheated) return;
    if (!S.uid){ S.uid = newId(); save(); }
    if (score < (S.gbest || 0)) return;
    var req;
    if (mode_() === 'fb'){
      req = fetch(gUrl('/' + S.uid), {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({n:(S.name || 'Pilot').slice(0,12), s:score, t:{'.sv':'timestamp'}})})
        .then(function(r){ if (!r.ok) throw new Error('http ' + r.status); });
    } else {
      req = fetch(apiBase() + '/api/scores', {method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', body:JSON.stringify({id:S.uid, name:(S.name || 'Pilot').slice(0,12), score:score, dist:dist, level:level, pills:pills, playMs:Math.round(playMs), diff:S.diff, plane:S.plane, t:ticket})})
        .then(function(r){ if (!r.ok){ var er = new Error('http ' + r.status); er.status = r.status; throw er; } return r.json(); })
        .then(function(j){ if (j && j.k) S.gk = j.k; });
    }
    withTimeout(req, 9000)
      .then(function(){ G.rej = ''; S.gbest = Math.max(S.gbest || 0, score); save(); gFetch(true); })
      .catch(function(e){ if (e && (e.status === 403 || e.status === 422)) G.rej = 'The server did not accept your last score.'; });
  }
  function localAll(){ return S.board.map(function(e){ return {n:e.n,s:e.s}; }).concat(BOTS.map(function(b){ return {n:b.n,s:b.s,b:1}; })).sort(function(a,b){ return b.s-a.s; }); }
  // base list the live in-game board compares against
  function all(){
    if (gOn() && G.list) return G.list.filter(function(e){ return e.k !== myKey(); });
    return localAll();
  }
  function li(r,n,s,cls){
    var e = document.createElement('li'); e.className = cls||'';
    var a = document.createElement('b'); a.textContent = r+'.';
    var b = document.createElement('span'); b.textContent = n;
    var c = document.createElement('i'); c.textContent = s; c.style.fontStyle = 'normal';
    e.appendChild(a); e.appendChild(b); e.appendChild(c); return e;
  }
  function fill(el, list){
    el.innerHTML = '';
    list.forEach(function(x){ el.appendChild(li(x.r,x.n,x.s,(x.you?'you ':'')+(x.b?'bot':''))); });
  }
  function paintBoard(){
    var note = $('lbNote'), el = $('topList'); if (!el) return;
    var lt = $('lbTitle'); if (lt) lt.textContent = gOn() ? 'World Leaderboard' : 'Top Pilots';
    var list, msg = '';
    if (gOn()){
      if (G.list){
        list = G.list.slice(0,8).map(function(x,i){ return {r:i+1, n:x.n, s:x.s, you:!!myKey() && x.k === myKey()}; });
        if (!list.length) msg = 'No scores yet - be the first!';
        else if (S.uid && S.gbest && !G.list.some(function(x){ return myKey() && x.k === myKey(); })) msg = 'Your world best: ' + S.gbest;
        if (G.state === 'err') msg = 'Offline - showing the last scores we got.';
        else if (G.rej) msg = G.rej;
      } else {
        list = []; msg = G.state === 'err' ? (G.err || 'Could not reach the world board. Retrying...') : 'Loading world leaderboard...';
      }
    } else {
      list = localAll().slice(0,8).map(function(x,i){ x.r = i+1; return x; });
    }
    fill(el, list); note.textContent = msg;
    var vc = $('visitors'); if (vc){ vc.style.display = (gOn() && G.visitors >= 0) ? 'flex' : 'none'; vc.innerHTML = '<span class="vdot"></span><b>' + G.visitors.toLocaleString() + '</b> ' + (G.visitors === 1 ? 'pilot has' : 'pilots have') + ' visited'; }
  }
  function drawLive(){
    var cur = {n:S.name||'You', s:F.score(), you:1}, list = all().concat([cur]).sort(function(a,b){ return b.s-a.s || (b.you?1:-1); });
    list.forEach(function(x,i){ x.r = i+1; });
    var me = list.indexOf(cur), shown = list.slice(0,5);
    if (me >= 5) shown = list.slice(0,4).concat([cur]);
    var h = document.querySelector('#live .lh'); if (h) h.textContent = (gOn() && G.list) ? 'World Leaderboard' : 'Live Leaderboard';
    fill($('liveList'), shown);
  }

  // ---------- PANEL (menu + game over) ----------
  function drawPanel(m){
    mode = m; document.body.className = '';
    $('pTitle').textContent = mode==='over' ? 'Game Over' : 'VectoFly';
    $('pSub').textContent = mode==='over'
      ? (cheated ? 'Cheat detected - this run was not counted.' : (game.reason ? game.reason + '  ' : '') + 'Score ' + F.score() + (newBest ? '  -  NEW BEST!' : '  -  Best ' + S.hi) + '  -  +' + lastEarned + ' coins')
      : 'Grab blue pills to repair, catch orange fuel cans, avoid the red ones.';
    $('wallet').textContent = 'Coins: ' + S.wallet + '   |   ' + plane().n + ' on ' + curMap().n;
    var dr = $('diffRow'); dr.innerHTML = '';
    DIFFS.forEach(function(d){ var b = h('button', (S.diff===d.id ? 'on ' : '') + 'd-' + d.id, d.n); b.onclick = function(){ S.diff = d.id; save(); drawPanel(mode); }; dr.appendChild(b); });
    $('diffNote').textContent = 'Score and coins x' + diff().mult;
    $('playBtn').textContent = mode==='over' ? 'Play again' : 'Play';
    $('nameIn').value = S.name || $('nameIn').value;
    paintBoard(); gFetch(false);
    $('stats').textContent = 'Best ' + S.hi + '  |  Pills ' + S.coins + '  |  Flights ' + S.games + '  |  Top level ' + S.bestLevel;
    $('optMusic').checked = S.music; $('optSfx').checked = S.sfx;
    $('panel').className = '';
  }
  var starting = false;
  function begin(){
    if (starting) return;                       // double click / Enter+click / Space+click can't start twice
    if ($('shop').className !== 'hide') return; // never start from behind the hangar
    starting = true;
    F.paused = false; muted = false;
    try { ac(); } catch(e){}
    apply();
    var n = ($('nameIn').value || '').replace(/[<>]/g,'').trim().slice(0,12);
    S.name = n || S.name || 'Pilot' + Math.floor(Math.random()*900+100); save();
    var launched = false;
    var launch = function(){
      if (launched) return; launched = true; starting = false;
      $('panel').className = 'hide'; runCoins = 0; newBest = false; legit = 0; playMs = 0; cheated = false;
      document.body.className = 'playing';
      startGame(); gStart();
      try { musicStart(); if (AC && engineG) engineG.gain.setTargetAtTime(.06, AC.currentTime, .3); } catch(e){}
      try { if (cg) cg.game.gameplayStart(); } catch(e){}
    };
    try { withAd(launch); } catch(e){ launch(); }
    setTimeout(function(){ starting = false; }, 1500);   // last-resort unlock
  }
  function closeShop(){
    $('shop').className = 'hide';
    pvQueue.length = 0;
    if (game.status === 'playing') return;      // never pop the menu over a running game
    starting = false;
    F.paused = false; muted = false; apply();
    if (AC && AC.state === 'suspended') AC.resume();
    drawPanel(mode);
  }

  // ---------- HANGAR: planes (perks), paints (skins), maps ----------
  // perks: magnet (pill pickup range), armor (damage taken multiplier), drain (fuel use multiplier),
  //        coin (coins earned per run multiplier), fuelVal (fuel can refill multiplier)
  // kind = which 3D model (see js/planes.js)
  var PLANES = [
    {id:'paper',n:'Paper Plane',p:100,c:'#f4f4f0',kind:'paper',d:'Folded fun. Uses 15% less fuel.',drain:.85},
    {id:'mustang',n:'Mustang',p:450,c:'#9aa8b8',kind:'warbird',d:'WWII warbird. Armor 15% and magnet x1.2.',armor:.85,magnet:1.2},
    {id:'baron',n:'Red Baron',p:700,c:'#c1272d',kind:'triplane',d:'Three wings. Magnet x1.3 and 1.3x coins.',magnet:1.3,coin:1.3},
    {id:'gyro',n:'Autogyro',p:850,c:'#e8c23a',kind:'gyro',d:'Spinning rotor. Magnet x1.3 and 20% less fuel use.',magnet:1.3,drain:.8},
    {id:'lightning',n:'Lightning',p:1300,c:'#9aa6b8',kind:'twinboom',d:'Twin-boom fighter. Armor 25% and magnet x1.3.',armor:.75,magnet:1.3},
    {id:'liner',n:'Jumbo Liner',p:1700,c:'#e8eef6',kind:'airliner',d:'Airliner. Fuel cans refill 40% more, armor 25%.',fuelVal:1.4,armor:.75},
    {id:'interceptor',n:'Interceptor',p:2200,c:'#5a6a88',kind:'interceptor',d:'Twin-tail jet. Armor 35%, magnet x1.5, 15% less fuel use.',armor:.65,magnet:1.5,drain:.85},
    {id:'balloon',n:'Sky Balloon',p:2900,c:'#ff7a3a',kind:'balloon',d:'Floaty hot-air balloon. 45% less fuel use, magnet x1.6, 1.5x coins.',drain:.55,magnet:1.6,coin:1.5},
    {id:'classic',n:'Classic',p:0,c:'#f25346',kind:'prop',d:'The original. Balanced, no perks.'},
    {id:'falcon',n:'Falcon',p:150,c:'#4aa3e8',kind:'racer',d:'Sleek racer. Magnet: grabs pills from further away.',magnet:1.8},
    {id:'comet',n:'Comet Floatplane',p:250,c:'#2ec4d6',kind:'float',d:'Bush floatplane. Fuel cans refill 50% more.',fuelVal:1.5},
    {id:'tank',n:'Tank Bomber',p:400,c:'#5fa86a',kind:'bomber',d:'Twin-engine heavy. Armor: crashes cause 40% less damage.',armor:.6},
    {id:'viper',n:'Viper',p:600,c:'#c1272d',kind:'jet',d:'Delta-wing jet. Armor 20% and a small magnet.',armor:.8,magnet:1.3},
    {id:'phantom',n:'Phantom Glider',p:800,c:'#8d6ad9',kind:'glider',d:'Electric glider. Uses 30% less fuel.',drain:.7},
    {id:'chopper',n:'Chopper',p:900,c:'#e8793a',kind:'heli',d:'Helicopter. Magnet x1.6 and 10% armor.',magnet:1.6,armor:.9},
    {id:'storm',n:'Thunder Biplane',p:1100,c:'#3d5a98',kind:'biplane',d:'Two wings. Magnet + 15% less fuel use.',magnet:1.4,drain:.85},
    {id:'golden',n:'Golden Jet',p:1500,c:'#e8b93a',kind:'bizjet',d:'Small magnet, armor, less fuel use and 2x coins.',magnet:1.5,armor:.75,drain:.85,coin:2},
    {id:'inferno',n:'Inferno Rocket',p:1900,c:'#ff5a1f',kind:'rocket',d:'Rocket plane. Heavy armor (35% less damage), magnet, 20% less fuel use.',armor:.65,magnet:1.4,drain:.8},
    {id:'stealth',n:'Stealth',p:2600,c:'#33343d',kind:'stealth',d:'Flying wing. Wide magnet, armor 30% and 25% less fuel use.',magnet:1.7,armor:.7,drain:.75},
    {id:'saucer',n:'Saucer',p:3200,c:'#8fb4c8',kind:'ufo',d:'Alien tech. Huge magnet (x2.2) and 1.5x coins.',magnet:2.2,coin:1.5},
    {id:'royal',n:'Royal Zeppelin',p:4000,c:'#7a3cff',kind:'zeppelin',d:'Legend: magnet x2, armor 40%, 30% less fuel, 30% bigger fuel cans, 2.5x coins.',magnet:2,armor:.6,drain:.7,fuelVal:1.3,coin:2.5},
    {id:'shuttle',n:'Space Shuttle',p:5200,c:'#e8e8ee',kind:'shuttle',d:'Mastery: armor 50%, 40% less fuel use, magnet x1.8, 2x coins.',armor:.5,drain:.6,magnet:1.8,coin:2}];
  PLANES.sort(function(a,b){ return a.p - b.p; });
  // paints: solid colour (c) or a pattern (pat) drawn with c / c2 / c3 and wrapped onto the plane
  var SKINS = [{id:'default',n:'Plane color',p:0},
    {id:'sky',n:'Sky',p:50,c:'#68c3c0'},{id:'pink',n:'Pink',p:50,c:'#ff7eb6'},{id:'orange',n:'Orange',p:50,c:'#ff8a1f'},
    {id:'lime',n:'Lime',p:60,c:'#9be03a'},{id:'violet',n:'Violet',p:60,c:'#9b59ff'},{id:'forest',n:'Forest',p:60,c:'#2f8a4a'},
    {id:'navy',n:'Navy',p:60,c:'#1f3a7a'},{id:'teal',n:'Teal',p:60,c:'#16a29a'},{id:'mint',n:'Mint',p:60,c:'#8fe8c0'},
    {id:'black',n:'Midnight',p:80,c:'#2b2b33'},{id:'white',n:'Snow',p:80,c:'#eeeeee'},{id:'crimson',n:'Crimson',p:90,c:'#b01030'},
    {id:'sand',n:'Dune',p:90,c:'#d9b878'},{id:'bronze',n:'Bronze',p:140,c:'#a8743a'},{id:'chrome',n:'Chrome',p:160,c:'#c9ced6'},
    {id:'gold',n:'Gold',p:200,c:'#f2c230'},
    {id:'racing',n:'Racing Stripe',p:120,pat:'stripe',c:'#d6483b',c2:'#ffffff'},
    {id:'bands',n:'Sky Bands',p:120,pat:'bands',c:'#2f6fd0',c2:'#ffffff'},
    {id:'checker',n:'Checkered',p:150,pat:'checker',c:'#1b1b1b',c2:'#f5f5f5'},
    {id:'polka',n:'Polka Dots',p:150,pat:'dots',c:'#ff7eb6',c2:'#ffffff'},
    {id:'zebra',n:'Zebra',p:170,pat:'zebra',c:'#ffffff',c2:'#1b1b1b'},
    {id:'tiger',n:'Tiger',p:170,pat:'tiger',c:'#f09a2a',c2:'#1b1b1b'},
    {id:'shark',n:'Shark',p:180,pat:'shark',c:'#8a95a8',c2:'#f5f5f5'},
    {id:'desertcamo',n:'Desert Camo',p:180,pat:'camo',c:'#c8b27a',c2:'#8d7a4a',c3:'#a8956a'},
    {id:'junglecamo',n:'Jungle Camo',p:180,pat:'camo',c:'#4a6a3a',c2:'#2f4a2a',c3:'#6a8a4a'},
    {id:'arcticcamo',n:'Arctic Camo',p:180,pat:'camo',c:'#e8eef2',c2:'#b8c8d4',c3:'#9fb0c0'},
    {id:'hazard',n:'Hazard',p:200,pat:'hazard',c:'#f2c230',c2:'#1b1b1b'},
    {id:'chevron',n:'Chevron',p:200,pat:'chevron',c:'#1f6a9a',c2:'#ffd24a'},
    {id:'cane',n:'Candy Cane',p:200,pat:'cane',c:'#ffffff',c2:'#d6283b'},
    {id:'starry',n:'Starry Night',p:220,pat:'stars',c:'#1f3a7a',c2:'#ffffff'},
    {id:'sunsetp',n:'Sunset Fade',p:240,pat:'gradient',c:'#ff9a4a',c2:'#7a3cff'},
    {id:'flame',n:'Hot Flames',p:260,pat:'flame',c:'#1b1b1b',c2:'#ff4a1a'},
    {id:'carbon',n:'Carbon Fiber',p:260,pat:'carbon',c:'#17171b',c2:'#2c2c33'},
    {id:'dragon',n:'Dragon Scales',p:280,pat:'scales',c:'#2f8a4a',c2:'#ffd24a'},
    {id:'pixel',n:'Digital',p:280,pat:'digital',c:'#1a2a3a',c2:'#35f0ff',c3:'#7a5aff'},
    {id:'neongrid',n:'Neon Grid',p:300,pat:'grid',c:'#0a1030',c2:'#35f0ff'},
    {id:'galaxy',n:'Galaxy',p:340,pat:'galaxy',c:'#2a1a6a',c2:'#9a5cff'},
    {id:'rainbow',n:'Rainbow',p:400,pat:'rainbow',c:'#ff0000'},
    {id:'coral',n:'Coral',p:60,c:'#ff6f61'},{id:'amber',n:'Amber',p:60,c:'#ffb000'},{id:'ocean',n:'Ocean',p:60,c:'#0e6ba8'},
    {id:'olive',n:'Olive Drab',p:70,c:'#6b7a2a'},{id:'plum',n:'Plum',p:70,c:'#6a2a5a'},{id:'peach',n:'Peach',p:60,c:'#ffb48a'},
    {id:'graphite',n:'Graphite',p:90,c:'#4a4d55'},{id:'copper',n:'Copper',p:140,c:'#b8683a'},{id:'rosegold',n:'Rose Gold',p:180,c:'#e8a89a'},
    {id:'emerald',n:'Emerald',p:150,c:'#12a05a'},{id:'sapphire',n:'Sapphire',p:150,c:'#1d3fa8'},
    {id:'tricolor',n:'Tricolor',p:150,pat:'flag',c:'#ff9933',c2:'#ffffff',c3:'#138808'},
    {id:'oak',n:'Oak Wood',p:160,pat:'wood',c:'#b07a3a',c2:'#6a4018'},
    {id:'leopard',n:'Leopard',p:180,pat:'leopard',c:'#e8b04a',c2:'#2a1a0a'},
    {id:'cow',n:'Dairy',p:170,pat:'cow',c:'#ffffff',c2:'#1b1b1b'},
    {id:'hearts',n:'Hearts',p:180,pat:'hearts',c:'#ff8fb8',c2:'#d6103a'},
    {id:'tartan',n:'Tartan',p:190,pat:'plaid',c:'#b01a2a',c2:'#103a2a',c3:'#f2e8c8'},
    {id:'argyle',n:'Argyle',p:200,pat:'argyle',c:'#2a4a8a',c2:'#e8d8a0'},
    {id:'honey',n:'Honeycomb',p:200,pat:'hex',c:'#f2b21a',c2:'#8a5a0a'},
    {id:'sunburst',n:'Sunburst',p:210,pat:'sunburst',c:'#ffd23a',c2:'#ff7a1a'},
    {id:'waves',n:'Ocean Waves',p:210,pat:'waves',c:'#1f78c8',c2:'#cfeaff'},
    {id:'ice',n:'Ice Crystal',p:220,pat:'ice',c:'#bfe6ff',c2:'#ffffff'},
    {id:'marble',n:'Marble',p:230,pat:'marble',c:'#f2f2f2',c2:'#5a5a6a'},
    {id:'magma',n:'Magma',p:240,pat:'lava',c:'#2a0a0a',c2:'#ff6a1a'},
    {id:'bolt',n:'Lightning',p:240,pat:'bolt',c:'#1a1a4a',c2:'#ffe14a'},
    {id:'circuit',n:'Circuit Board',p:260,pat:'circuit',c:'#0f3a2a',c2:'#5affc0'},
    {id:'swirl',n:'Sunrise Swirl',p:280,pat:'swirl',c:'#ff5a8a',c2:'#ffd24a',c3:'#5a8aff'}];
  // Maps. g = ground type, t = scenery near the flight path, fr = small details in front, farT = far backdrop,
  // pal = 4 sky stages [top,bottom] that the sky moves through as the level rises, sea = ground tint.
  var MAPS = [
    {id:'coast',n:'Sunny Coast',p:0,d:'Calm blue water, sailboats, warm afternoon sky.',sea:'#68c3c0',g:'water',t:['boat','rock','buoy'],fr:['buoy','rock'],farT:'mountain',far:'#8aa0c8',sun:'#fff1b8',pal:[['#e4e0ba','#f7d9aa'],['#f7c9a0','#f09a7b'],['#5b5f97','#c46f8b'],['#1b1f45','#4a3f7a']]},
    {id:'bay',n:'Sunset Bay',p:100,d:'Golden-hour glow over rose water.',sea:'#e0787a',g:'water',t:['boat','rock'],fr:['rock','buoy'],farT:'mountain',far:'#c4687a',sun:'#ffd6a0',pal:[['#ffc48a','#ff8a6b'],['#ff9a76','#c4506b'],['#6a3d7a','#c4506b'],['#2a1840','#6a3d7a']]},
    {id:'tropical',n:'Tropical Lagoon',p:150,d:'Palm islets in a turquoise lagoon.',sea:'#25d0c0',g:'water',t:['palm','rock','boat'],fr:['rock','buoy'],farT:'mountain',far:'#4aa89a',leaf:'#2fa05a',sand:'#f0dfaa',sun:'#fff6c8',pal:[['#bff3ff','#fff1b8'],['#ffd9a0','#ff9f7a'],['#4a6fa8','#d98cb0'],['#10234a','#2c5a8a']]},
    {id:'arctic',n:'Arctic',p:250,d:'Icy plains under a pale polar sky.',sea:'#bfe0ee',g:'snow',t:['ice','rock','pine'],fr:['rock','tuft'],farT:'mountain',far:'#c5d8ec',snow:true,leaf:'#2e6a55',snowy:true,sun:'#ffffff',pal:[['#dff3fb','#b7e0f0'],['#c9e6f5','#e9d8f0'],['#6f8fc4','#b6c9ea'],['#1c2a52','#5a74a8']]},
    {id:'sakura',n:'Cherry Blossom Bay',p:350,d:'Japan in spring: pink blossoms, soft skies.',sea:'#e8a0b8',g:'water',t:['tree','boat','rock'],fr:['bush','rock'],leaf:'#ffb3cf',farT:'mountain',far:'#d9a0c0',sun:'#fff0f4',pal:[['#ffe3ec','#ffc2d4'],['#ffc2d4','#e89ab8'],['#7a5a9a','#e89ab8'],['#241838','#5a3a78']]},
    {id:'neon',n:'Neon Night',p:450,d:'Tokyo-style neon towers glowing over dark water.',sea:'#3b2a8f',g:'water',t:['building'],fr:['buoy','rock'],bld:['#1d1445','#2a1a5e','#161038'],lit:['#ff4fd8','#4ff0ff','#ffe14a'],antenna:true,farT:'skyline',far:'#2a1a5e',sun:'#ff8ae0',stars:true,pal:[['#2a1b5e','#d63a9e'],['#1a1048','#8a2be2'],['#0f0a33','#d63a9e'],['#07051f','#4a1fa8']]},
    {id:'forest',n:'Emerald Isles',p:550,d:'Green island chain, Pacific morning.',sea:'#2f9e74',g:'water',t:['palm','tree','rock'],fr:['rock','buoy'],leaf:'#3cb06a',farT:'mountain',far:'#4a9a78',sun:'#fff6c8',pal:[['#d6f0c8','#a7dba0'],['#e8d98a','#d9885a'],['#3d5a6a','#9a6a8a'],['#0c1a2a','#2a4a5a']]},
    {id:'desert',n:'Desert Dunes',p:700,d:'Sahara heat haze, cacti and amber sand.',sea:'#d9a05b',g:'sand',t:['cactus','rock','mesa'],fr:['rock','tuft'],tuft:'#a89050',rock:'#a88a5a',farT:'dune',far:'#e8b872',sun:'#fff1b8',pal:[['#ffe2a8','#f5b765'],['#f7c27a','#e0834a'],['#8a5a7a','#e0834a'],['#2b1d3d','#8a5a4a']]},
    {id:'storm',n:'Storm Front',p:800,d:'Heavy grey clouds over a dark sea.',sea:'#4a5d73',g:'water',t:['rock','boat'],fr:['rock','buoy'],farT:'mountain',far:'#59697c',cloud:'#9aa4b0',fogN:140,fogF:850,sun:null,pal:[['#aab4c0','#7f8c9a'],['#7f8c9a','#4f5b6a'],['#3a4350','#2a303a'],['#14171d','#2a303a']]},
    {id:'volcano',n:'Volcano',p:1000,d:'Iceland-style lava glow and ash.',sea:'#c2331b',g:'lava',t:['rock','rock','crystal'],crystal:['#ff7a2a','#ffb02a'],rock:'#3a2a28',fr:['rock'],farT:'volcano',far:'#3a2420',sun:'#ff9a50',pal:[['#5a1f1a','#e0622a'],['#3a1210','#c2331b'],['#240a0a','#8a1f12'],['#120505','#5a1410']]},
    {id:'aurora',n:'Aurora Fjord',p:1100,d:'Norway: green lights over a cold fjord.',sea:'#2a6f8f',g:'water',t:['pine','ice','rock'],fr:['rock','tuft'],leaf:'#2e6f55',snowy:true,farT:'mountain',far:'#8ab8c8',snow:true,sun:'#e8fff4',stars:true,pal:[['#bfe8f0','#8fd0c8'],['#6fd0b0','#3a7a9a'],['#2a3a7a','#4aa890'],['#050a20','#1f5a5a']]},
    {id:'candy',n:'Candy Clouds',p:1300,d:'Pastel dreamland of lollipops and crystals.',sea:'#ff8fc7',g:'candy',t:['cane','crystal'],fr:['crystal','tuft'],crystal:['#ff7ad5','#7ad7ff','#ffe14a'],tuft:'#ff9fd0',farT:'mountain',far:'#e8a0e0',sun:'#fff6fb',pal:[['#ffe0f0','#d8f0ff'],['#ffc0e0','#c0d8ff'],['#b080e0','#ff90c0'],['#3a1a6a','#8a4aa8']]},
    {id:'mars',n:'Mars Colony',p:1600,d:'Red planet dust, rovers\' domes and a thin sky.',sea:'#b5532e',g:'dust',t:['rock','dome','rock'],rock:'#8a4a32',fr:['rock'],farT:'mountain',far:'#a85a3a',sun:'#ffc8a0',pal:[['#f0b48a','#d98a5a'],['#d98a5a','#a8502e'],['#5a2a2a','#a8502e'],['#1a0a0e','#4a1a1a']]},
    {id:'space',n:'Deep Space',p:2000,d:'A glowing grid under a violet nebula.',sea:'#2a2a7a',g:'grid',t:['crystal','rock'],crystal:['#7ad7ff','#b07cff','#ff7ad5'],rock:'#4a4a7a',fr:['crystal'],farT:'none',sun:null,stars:true,pal:[['#101040','#3a2a8a'],['#080828','#2a1a6a'],['#04041a','#1a1050'],['#000008','#0a0828']]},
    // --- new maps ---
    {id:'canyon',n:'Red Canyon',p:200,d:'Sandstone mesas and cacti at sunrise.',sea:'#c2623a',g:'sand',t:['mesa','cactus','rock'],fr:['rock','tuft'],tuft:'#9a6a3a',rock:'#9a5a3a',farT:'mountain',far:'#b4583a',sun:'#fff0c0',pal:[['#ffd9a0','#f7b070'],['#ff9a6a','#c4503a'],['#5a3a6a','#c4503a'],['#1a1030','#4a2a4a']]},
    {id:'autumn',n:'Autumn Valley',p:300,d:'Orange maples and rolling fields.',sea:'#c98a2f',g:'grass',t:['tree','tree','bush','rock'],fr:['tuft','bush'],leaf:'#e0702a',tuft:'#b07a2a',farT:'mountain',far:'#a8805a',sun:'#fff0c8',pal:[['#ffe6b0','#f5c080'],['#f7b070','#d97a4a'],['#5a4a7a','#d97a4a'],['#1a1838','#4a3a5a']]},
    {id:'winter',n:'Snow Village',p:380,d:'Frosted pines and fresh powder.',sea:'#e6f1f8',g:'snow',t:['pine','pine','ice','rock'],fr:['rock','tuft'],leaf:'#2e6a4f',snowy:true,farT:'mountain',far:'#b8cbe0',snow:true,sun:'#ffffff',pal:[['#dbe9f5','#f2f6fa'],['#c9d8ee','#e8d4e0'],['#5a6a9a','#b8c0e0'],['#10183a','#3a4a7a']]},
    {id:'savanna',n:'Golden Savanna',p:500,d:'Acacia trees on endless golden grass.',sea:'#b8a24a',g:'grass',t:['acacia','acacia','bush','rock'],fr:['tuft','rock'],leaf:'#8a9a3a',tuft:'#c0a040',farT:'mountain',far:'#c29a5a',sun:'#fff1b8',pal:[['#ffe9a8','#f7c870'],['#ffc070','#e08a4a'],['#7a4a6a','#e08a4a'],['#1c1230','#5a3a4a']]},
    {id:'jungle',n:'Jungle Ruins',p:650,d:'Dense canopy and steamy green air.',sea:'#2f7a3a',g:'grass',t:['tree','palm','tree','bush'],fr:['bush','tuft'],leaf:'#2f9a4a',tuft:'#2f7a3a',farT:'mountain',far:'#3f7a5a',sun:'#f0ffd0',pal:[['#cdeec0','#9ad8a0'],['#f0e29a','#d99a5a'],['#3a5a6a','#9a6a8a'],['#0a1a22','#2a4a4a']]},
    {id:'lavender',n:'Lavender Fields',p:750,d:'Purple meadows in the golden hour.',sea:'#9a78c8',g:'grass',t:['tree','bush','rock'],fr:['tuft','bush'],leaf:'#b48ae0',tuft:'#b48ae0',farT:'mountain',far:'#a690c8',sun:'#fff0fa',pal:[['#ecd8ff','#ffd8ec'],['#ffc8e0','#c8a0e8'],['#6a4a9a','#c88ab8'],['#1c1038','#4a3a7a']]},
    {id:'metro',n:'Metro City',p:900,d:'Fly over a daytime skyline.',sea:'#6f7480',g:'rock',t:['building'],fr:['rock'],bld:['#7a8498','#8a94a8','#6a7488','#9aa4b6'],lit:['#ffe9a0','#cfe8ff'],antenna:true,farT:'skyline',far:'#8a93a8',sun:'#fff6d8',pal:[['#bcd9f0','#e6eef6'],['#f2c9a0','#ee9a7a'],['#4a5a8a','#d0809a'],['#0e1230','#3a3a6a']]},
    {id:'mist',n:'Misty Peaks',p:1200,d:'Pine ridges lost in morning fog.',sea:'#6f8f7a',g:'grass',t:['pine','pine','rock'],fr:['rock','tuft'],leaf:'#2f6a55',tuft:'#5a8a6a',farT:'mountain',far:'#7f9a92',fogN:80,fogF:720,sun:'#f4f8f0',pal:[['#c9d6d4','#e2e8e4'],['#b8c4c8','#d8d4d8'],['#5a6a80','#a0a8b8'],['#141c2a','#3a4658']]},
    {id:'cyber',n:'Cyber Grid',p:1500,d:'Retro-future: neon grid and glass towers.',sea:'#0a3a8a',g:'grid',t:['building'],fr:['crystal'],bld:['#0a1a3a','#102a55','#0c2048'],lit:['#35f0ff','#7a5aff','#ff4fd8'],crystal:['#35f0ff','#7a5aff'],farT:'skyline',far:'#102a55',sun:'#ff7ad5',stars:true,pal:[['#1a0a4a','#2a6aff'],['#10083a','#7a2aff'],['#080426','#1aa0ff'],['#02010f','#0a2a6a']]},
    {id:'lighthouse',n:'Lighthouse Coast',p:360,d:'A red-white lighthouse guards a rocky blue coast.',sea:'#2f7ab8',g:'water',t:['lighthouse','rock','boat','rock'],fr:['rock','buoy'],farT:'mountain',far:'#7f9ac0',sun:'#fff1b8',pal:[['#cfe6f7','#f3ead0'],['#f7c9a0','#e89a7b'],['#4a5a97','#c46f8b'],['#10163a','#3a3f7a']]},
    {id:'tulips',n:'Tulip Fields',p:400,d:'Dutch windmills and rows of colourful tulips.',sea:'#7ac04a',g:'grass',t:['windmill','tulip','tulip','house'],fr:['tulip','tuft'],wall:'#f6f0e4',roofs:['#b0382e','#2f6fd0'],tuft:'#5aa83a',farT:'mountain',far:'#a8c4d8',sun:'#fff6d0',pal:[['#cfe8ff','#f5f0d8'],['#f7d6a0','#ee9f7a'],['#5a6aa0','#d08aa0'],['#101a3a','#3a4a7a']]},
    {id:'greece',n:'Aegean Isles',p:420,d:'Whitewashed villages with blue roofs over a deep blue sea.',sea:'#1f8fd0',g:'water',t:['house','rock','boat','house'],fr:['rock','buoy'],wall:'#ffffff',roofs:['#2f6fd0','#3a8ae0'],farT:'mountain',far:'#b8c8d8',sun:'#fffbe0',pal:[['#bfe6ff','#f2f8ff'],['#f7d6a8','#ee9f7a'],['#4a6aa8','#d28aa8'],['#0c1a3a','#2c4a7a']]},
    {id:'bamboo',n:'Bamboo Valley',p:480,d:'Mist, bamboo groves and a quiet shrine gate.',sea:'#5aa84a',g:'grass',t:['bamboo','bamboo','torii','rock'],fr:['tuft','rock'],tuft:'#4a8a3a',fogN:100,fogF:820,farT:'mountain',far:'#6a9a8a',sun:'#f4ffe0',pal:[['#d4efd8','#eef6e4'],['#e8e0a8','#d9a070'],['#3d5a6a','#9a7a8a'],['#0a1a22','#2a4a4a']]},
    {id:'rice',n:'Rice Terraces',p:520,d:'Emerald paddies, farm huts and trees.',sea:'#8ac04a',g:'grass',t:['house','tree','bush','tuft'],fr:['tuft','bush'],wall:'#e8d9b0',roofs:['#8a5a2a','#a8683a'],leaf:'#3aa04a',tuft:'#6aa83a',farT:'mountain',far:'#7aa88a',sun:'#fff6c8',pal:[['#d8f0c8','#f5f2c0'],['#f7d08a','#e0925a'],['#4a5a7a','#b88a8a'],['#0c1a2a','#2a4a4a']]},
    {id:'salt',n:'Salt Flats',p:580,d:'A blinding white plain that mirrors the sky.',sea:'#f2eee6',g:'sand',t:['rock','tuft','rock'],fr:['tuft','rock'],tuft:'#cfc6b0',rock:'#c8bfb0',farT:'mountain',far:'#c9b9d0',sun:'#ffffff',pal:[['#cfe3f7','#f6f2ee'],['#f7d6c0','#e8b0a0'],['#6a6a9a','#c8a0b8'],['#10163a','#3a3f6a']]},
    {id:'halloween',n:'Haunted Hollow',p:600,d:'Pumpkins, dead trees and a purple night.',sea:'#3a2a4a',g:'grass',t:['deadtree','pumpkin','rock','deadtree'],fr:['pumpkin','tuft'],tuft:'#4a3a5a',rock:'#4a4458',farT:'mountain',far:'#2a1a3a',sun:'#ffe9a0',stars:true,pal:[['#3a1a5a','#c4602a'],['#2a1040','#8a3a5a'],['#150a2a','#5a2a5a'],['#07031a','#3a1a4a']]},
    {id:'xmas',n:'Festive Village',p:650,d:'Snowy cabins, candy canes and frosted pines.',sea:'#f2f6fa',g:'snow',t:['pine','house','cane','pine'],fr:['rock','tuft'],wall:'#e8d2b0',roofs:['#c1433a','#2e7a4a'],leaf:'#2e6a4f',snowy:true,snow:true,farT:'mountain',far:'#b8cbe0',sun:'#ffffff',pal:[['#cfe0f2','#f2f6fa'],['#e8c8d8','#f0d8e0'],['#5a6a9a','#b8c0e0'],['#10183a','#3a4a7a']]},
    {id:'shrine',n:'Shrine Coast',p:780,d:'Red torii gates, pines and boats at golden hour.',sea:'#c0504a',g:'water',t:['torii','pine','boat','rock'],fr:['rock','buoy'],leaf:'#2e6a4f',farT:'mountain',far:'#b0687a',sun:'#ffd6a0',pal:[['#ffc48a','#ff8a6b'],['#ff9a76','#c4506b'],['#6a3d7a','#c4506b'],['#2a1840','#6a3d7a']]},
    {id:'glacier',n:'Glacier Bay',p:880,d:'Towering ice and turquoise meltwater.',sea:'#7fd0e8',g:'water',t:['ice','ice','rock','pine'],fr:['rock','buoy'],leaf:'#2e6a55',snowy:true,snow:true,farT:'mountain',far:'#bcd4ea',sun:'#ffffff',pal:[['#d4eefa','#b4e0f0'],['#c9e6f5','#e9d8f0'],['#6f8fc4','#b6c9ea'],['#1c2a52','#5a74a8']]},
    {id:'swamp',n:'Toxic Swamp',p:950,d:'Green fog, dead trees and bubbling water.',sea:'#5a7a2a',g:'water',t:['deadtree','bush','rock','deadtree'],fr:['bush','rock'],leaf:'#4a6a2a',fogN:90,fogF:650,farT:'mountain',far:'#5a6a3a',sun:'#d8ff9a',pal:[['#b8c890','#d8e0a0'],['#a8b070','#c0a060'],['#3a4a3a','#7a6a5a'],['#0a120a','#243424']]},
    {id:'blackbeach',n:'Black Sand Beach',p:1050,d:'Volcanic shore with palms under a smoking peak.',sea:'#2e2e36',g:'sand',t:['palm','rock','rock','palm'],fr:['rock','tuft'],sand:'#3a3a42',leaf:'#2fa05a',rock:'#4a4a52',tuft:'#4a4a3a',farT:'volcano',far:'#3a3038',sun:'#fff1d0',pal:[['#cfe0f0','#f0e6d8'],['#f5c09a','#e07a5a'],['#4a4a7a','#c0708a'],['#0e1030','#3a3050']]},
    {id:'egypt',n:'Pyramid Plateau',p:1250,d:'Ancient pyramids, palms and gold sand.',sea:'#e8c27a',g:'sand',t:['pyramid','palm','rock','pyramid'],fr:['rock','tuft'],stone:'#e0c27a',sand:'#f0dfaa',leaf:'#3a9a4a',tuft:'#a89050',rock:'#a88a5a',farT:'dune',far:'#eac07a',sun:'#fff1b8',pal:[['#ffe2a8','#f5c070'],['#f7c27a','#e0834a'],['#8a5a7a','#e0834a'],['#2b1d3d','#8a5a4a']]},
    {id:'kingdom',n:'Medieval Kingdom',p:1400,d:'Stone castles, villages and green hills.',sea:'#5aa04a',g:'grass',t:['castle','tree','house','tree'],fr:['tuft','bush'],stone:'#b9b2a6',wall:'#e8d9b0',roofs:['#b0382e','#8a4a2a'],leaf:'#4a9a4a',tuft:'#4a8a3a',farT:'mountain',far:'#8aa0c8',sun:'#fff6c8',pal:[['#cfe6ff','#f2f0d8'],['#f5d29a','#e8925a'],['#5a5a8a','#c88a9a'],['#101030','#3a3a5a']]},
    {id:'moonsea',n:'Moonlit Sea',p:1650,d:'Always night: a silver moon over black water.',sea:'#1a3a6a',g:'water',t:['boat','rock','buoy'],fr:['rock','buoy'],farT:'mountain',far:'#1a2a4a',sun:'#f4f6ff',stars:true,pal:[['#050a24','#1a2f5a'],['#040820','#162a52'],['#030618','#10224a'],['#02040f','#0a1838']]},
    {id:'moon',n:'Moon Base',p:2400,d:'Grey regolith, craters and the Earth above.',sea:'#8d8f98',g:'dust',t:['rock','rock','dome'],rock:'#6d6f78',fr:['rock'],farT:'mountain',far:'#6a6c78',sun:null,stars:true,earth:true,pal:[['#000005','#0a0a18'],['#000005','#0a0a18'],['#000003','#06060f'],['#000000','#030308']]}];
  MAPS.sort(function(a,b){ return a.p - b.p; });
  SKINS.sort(function(a,b){ return (a.id==='default'?-1:b.id==='default'?1:a.p-b.p); });
  // difficulty: e = damage per spike, c = damage a pill repairs, tol = spike hit size, v0/vmax/vper = speed start / top / ramp,
  // sp = [first gap, smallest gap, shrink per level], wave = spikes per wave at level 1, fuel = fuel burn, mult = score & coin reward multiplier
  var DIFFS = [
    {id:'easy',n:'Easy',e:10,c:3,tol:10,v0:.00035,vmax:.0008,vper:.00000008,sp:[62,40,2],wave:1,fuel:.06,mult:1},
    {id:'medium',n:'Medium',e:15,c:3,tol:10,v0:.0004,vmax:.00095,vper:.0000001,sp:[55,36,2.2],wave:1,fuel:.068,mult:1.25},
    {id:'hard',n:'Hard',e:20,c:2,tol:11,v0:.00044,vmax:.0011,vper:.00000012,sp:[48,30,2.5],wave:2,fuel:.075,mult:1.5},
    {id:'hell',n:'Hell',e:25,c:1.5,tol:12,v0:.00055,vmax:.0015,vper:.0000002,sp:[40,24,2.5],wave:3,fuel:.09,mult:2}];
  function diff(){ return byId(DIFFS, S.diff); }
  var tab = 'planes', dirty = true;
  function byId(a,id){ for (var i=0;i<a.length;i++) if (a[i].id===id) return a[i]; return a[0]; }
  function plane(){ return byId(PLANES,S.plane); }
  function curMap(){ return byId(MAPS,S.map); }
  function skin(){ return S.skin==='default' ? null : byId(SKINS,S.skin); }
  var builtFor = '';
  function applyLook(){
    if (typeof airplane==='undefined' || !airplane || typeof scene==='undefined' || !scene || typeof World==='undefined') return false;
    var pl = plane(), sk = skin(), mp = curMap(), key = pl.id + '|' + (sk ? sk.id : '') + '|' + mp.id;
    if (key !== builtFor){
      var mapChanged = builtFor.split('|')[2] !== mp.id, planeChanged = builtFor.split('|').slice(0,2).join('|') !== pl.id + '|' + (sk ? sk.id : '');
      builtFor = key;
      if (planeChanged || !airplane.kind) setPlaneModel(pl.kind, sk, pl.c);
      if (mapChanged){ World.setMap(mp); hemisphereLight.groundColor.set(mp.sea).multiplyScalar(.5); }
    }
    cur = mp.pal[0].map(rgb); return true;
  }
  F.applyPerks = function(){
    var p = plane(), d = diff();
    game.ennemyValue = d.e; game.coinValue = d.c; game.ennemyDistanceTolerance = d.tol;
    game.initSpeed = game.baseSpeed = game.targetBaseSpeed = d.v0; game.maxBaseSpeed = d.vmax; game.speedPerMeter = d.vper;
    game.spawnStart = game.distanceForEnnemiesSpawn = d.sp[0]; game.spawnMin = d.sp[1]; game.spawnStep = d.sp[2]; game.waveBase = d.wave; game.fuelBase = d.fuel;
    game.coinDistanceTolerance *= (p.magnet||1); game.ennemyValue *= (p.armor||1); game.fuelEff *= (p.drain||1); game.fuelValue *= (p.fuelVal||1);
  };
  function toast(txt,col){ var e = $('toast'); if (!e) return; e.textContent = txt; e.style.color = col; e.className = ''; void e.offsetWidth; e.className = 'pop'; }
  function h(tag,cls,txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt!==undefined) e.textContent = txt; return e; }

  // ---- hangar previews: each plane / paint is rendered once with a small offscreen WebGL renderer ----
  var PV = null, pvCache = {}, pvQueue = [], pvBusy = false;
  function pvInit(){
    if (PV) return PV.ok;
    PV = {ok:false};
    try {
      var r = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
      r.setSize(220,132); r.setClearColor(0x000000, 0);
      var s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xe8f0ff,0x8a7058,.95));
      var dl = new THREE.DirectionalLight(0xfff2dc,.95); dl.position.set(90,170,140); s.add(dl);
      var c = new THREE.PerspectiveCamera(30, 220/132, 1, 3000); c.position.set(0,26,330); c.lookAt(new THREE.Vector3(0,0,0));
      PV = {ok:true, r:r, s:s, c:c};
    } catch(e){}
    return PV.ok;
  }
  function pvRender(kind, spec, base){
    var a = PB.build(kind, spec, base), m = a.mesh;
    m.rotation.set(.14, -.62, 0);
    PV.s.add(m); m.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(m), size = box.size(), ctr = box.center();
    var k = Math.min(215 / Math.max(size.x,1), 112 / Math.max(size.y,1));
    m.scale.set(k,k,k); m.updateMatrixWorld(true);
    box.setFromObject(m); ctr = box.center(); m.position.sub(ctr);
    PV.r.render(PV.s, PV.c);
    var url = PV.r.domElement.toDataURL('image/png');
    PV.s.remove(m);
    return url;
  }
  function pvRequest(key, el, kind, spec, base){
    if (pvCache[key]){ el.style.backgroundImage = 'url(' + pvCache[key] + ')'; return; }
    pvQueue.push({key:key, el:el, kind:kind, spec:spec, base:base}); pvPump();
  }
  function pvPump(){
    if (pvBusy || !pvQueue.length) return;
    pvBusy = true;
    setTimeout(function(){
      var j = pvQueue.shift(); pvBusy = false;
      if (j && pvInit()){
        try { pvCache[j.key] = pvRender(j.kind, j.spec, j.base); if (j.el.isConnected !== false) j.el.style.backgroundImage = 'url(' + pvCache[j.key] + ')'; } catch(e){}
      }
      pvPump();
    }, 12);
  }

  function openShop(t){ tab = t; $('panel').className = 'hide'; $('shop').className = ''; drawShop(); }
  function drawShop(){
    pvQueue.length = 0;
    $('wallet2').textContent = 'Coins: ' + S.wallet;
    var ht = document.querySelector('#shop h2'); if (ht) ht.textContent = tab==='maps' ? 'Maps' : tab==='skins' ? 'Paint shop' : 'Hangar';
    var tabs = $('shopTabs'); tabs.innerHTML = '';
    [['planes','Planes'],['skins','Paints'],['maps','Maps']].forEach(function(t){
      var b = h('button', tab===t[0] ? 'on' : '', t[1]); b.onclick = function(){ tab = t[0]; drawShop(); }; tabs.appendChild(b);
    });
    var g = $('grid'); g.innerHTML = '';
    var items = tab==='planes' ? PLANES : tab==='skins' ? SKINS : MAPS;
    var key = tab==='planes' ? 'plane' : tab==='skins' ? 'skin' : 'map', ownKey = key + 's';
    var curSkin = skin(), curPlane = plane();
    items.forEach(function(it){
      var c = h('div', 'card' + (S[key]===it.id ? ' sel' : '')), sw = h('div','sw');
      if (tab==='maps'){
        sw.style.background = 'linear-gradient('+it.pal[0][0]+','+it.pal[0][1]+' 58%,'+it.sea+' 58%)';
      } else {
        sw.className = 'sw pv';
        if (tab==='planes'){
          sw.style.backgroundColor = 'rgba(255,255,255,.35)';
          pvRequest('p|'+it.id+'|'+(curSkin?curSkin.id:''), sw, it.kind, curSkin, it.c);
        } else {
          var spec = it.id==='default' ? null : it;
          pvRequest('s|'+it.id+'|'+curPlane.id, sw, curPlane.kind, spec, curPlane.c);
        }
      }
      c.appendChild(sw); c.appendChild(h('b','',it.n)); if (it.d) c.appendChild(h('div','d',it.d));
      var owned = S[ownKey].indexOf(it.id) > -1, b;
      if (owned){
        b = h('button','', S[key]===it.id ? 'Selected' : 'Select'); b.disabled = S[key]===it.id;
        b.onclick = function(){ S[key] = it.id; dirty = true; save(); drawShop(); };
      } else if (S.wallet >= it.p){
        b = h('button','','Buy ' + it.p);
        b.onclick = function(){ S.wallet -= it.p; S[ownKey].push(it.id); S[key] = it.id; dirty = true; save(); drawShop(); };
      } else { b = h('button','','Need ' + it.p); b.disabled = true; }
      c.appendChild(b); g.appendChild(c);
    });
  }

  // ---------- GAME HOOKS ----------
  F.score = function(){ return (typeof game === 'undefined') ? 0 : Math.floor((Math.floor(legit) + runCoins*5) * diff().mult); };
  // called by game.js every frame with the distance flown: our own copy of the distance + the time actually played
  F.tick = function(dd, dt){
    if (cheated) return;
    legit += dd; playMs += dt;
    if (Math.abs(game.distance - legit) > 2) F.cheat('distance');
    else if (dd > dt * .14 || game.baseSpeed > game.maxBaseSpeed * 1.05) F.cheat('speed');
  };
  F.cheat = function(why){
    if (cheated || game.status !== 'playing') return;
    cheated = true;
    try { console.warn('VectoFly: run stopped (' + why + ')'); } catch(e){}
    endRun('Cheat detected - run not counted.');
  };
  F.onCoin = function(){ runCoins++; sfx('coin'); };
  F.onHit = function(){ sfx('hit'); shake = 14; };
  F.onFuel = function(){ sfx('fuel'); toast('+FUEL','#f4a63a'); };
  F.onLevel = function(l){ sfx('level'); toast('LEVEL ' + l,'#68c3c0'); };
  F.onGameOver = function(){
    var sc = F.score(); sfx('over');
    if (cheated){ lastEarned = 0; newBest = false; if (engineG) engineG.gain.setTargetAtTime(0, AC.currentTime, .2); save(); try { if (cg) cg.game.gameplayStop(); } catch(e){} return; }
    lastEarned = Math.floor((runCoins*(plane().coin||1) + sc/200) * diff().mult); S.wallet += lastEarned;
    if (engineG) engineG.gain.setTargetAtTime(0, AC.currentTime, .2);
    S.games++; S.coins += runCoins; S.dist += Math.floor(game.distance); S.bestLevel = Math.max(S.bestLevel, game.level);
    if (sc > S.hi){ S.hi = sc; newBest = true; }
    if (sc > 0){ S.board.push({n:S.name||'Pilot', s:sc, d:Date.now()}); S.board.sort(function(a,b){ return b.s-a.s; }); S.board = S.board.slice(0,20); }
    save();
    gSubmit(sc, Math.floor(legit), game.level, runCoins);
    try { if (cg) cg.game.gameplayStop(); } catch(e){}
  };
  F.showGameOver = function(){ drawPanel('over'); };

  // sky cycles day -> sunset -> dusk -> night as levels rise
  function rgb(h){ return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]; }
  var cur = MAPS[0].pal[0].map(rgb), bright = 1;
  var STAGE_LIGHT = [1, .92, .68, .42], STAGE_SUN = [210, 120, 36, 200];
  F.onFrame = function(){
    frameN++;
    if (dirty && applyLook()) dirty = false;
    var L = (typeof game !== 'undefined') ? game.level : 1, mp = curMap(), st = Math.floor((L-1)/3)%4, tg = mp.pal[st].map(rgb);
    for (var i=0;i<2;i++) for (var k=0;k<3;k++) cur[i][k] += (tg[i][k]-cur[i][k])*.01;
    bright += (STAGE_LIGHT[st] - bright)*.01;
    if (frameN%6===0){
      var c0 = cur[0].map(Math.round), c1 = cur[1].map(Math.round);
      // sky gradient reaches the horizon colour exactly at the horizon line (screen centre), so ground fog blends in seamlessly
      $('gameHolder').style.background = 'linear-gradient(rgb('+c0+'),rgb('+c1+') 50%,rgb('+c1+'))';
      if (typeof scene !== 'undefined'){ scene.fog.color.setRGB(c1[0]/255,c1[1]/255,c1[2]/255); hemisphereLight.color.setRGB(.55+c0[0]/255*.45, .55+c0[1]/255*.45, .55+c0[2]/255*.45); }
      hemisphereLight.intensity = .14 + .42*bright; shadowLight.intensity = .12 + .66*bright;
      var sun = $('sun'), night = st === 3;
      if (mp.sun){
        sun.style.display = 'block'; sun.style.marginTop = (-42 - STAGE_SUN[st]) + 'px';
        sun.style.background = night ? 'radial-gradient(circle,#f4f6ff 0,#dfe6ff 40%,rgba(200,210,255,0) 70%)' : 'radial-gradient(circle,#fffbe8 0,'+mp.sun+' 45%,rgba(255,225,150,0) 72%)';
        sun.style.boxShadow = night ? '0 0 60px 18px rgba(200,215,255,.35)' : '0 0 90px 40px rgba(255,235,170,.5)';
        sun.style.width = sun.style.height = (night ? 56 : 84) + 'px'; sun.style.marginLeft = (night ? -28 : -42) + 'px';
      } else sun.style.display = 'none';
      $('stars').style.opacity = (mp.stars || night) ? 1 : (st === 2 ? .35 : 0);
      $('earth').style.opacity = mp.earth ? 1 : 0;
    }
    if (typeof camera !== 'undefined'){ if (shake > .3){ camera.position.x = (Math.random()-.5)*shake; shake *= .9; } else camera.position.x = 0; }
    if (game.status !== 'playing') return;
    if (game.damage > 70 && Date.now()-lastWarn > 1100){ lastWarn = Date.now(); sfx('warn'); }
    else if (game.fuel < 30 && Date.now()-lastWarn > 1100){ lastWarn = Date.now(); sfx('warn'); }
    // keyboard steering (arrows / WASD) feeds the same mousePos the mouse uses
    var dx = (keys[39]||keys[68]||pad.r?1:0)-(keys[37]||keys[65]||pad.l?1:0), dy = (keys[38]||keys[87]||pad.u?1:0)-(keys[40]||keys[83]||pad.d?1:0);
    if (dx||dy) mousePos = {x:Math.max(-1,Math.min(1,mousePos.x+dx*.03)), y:Math.max(-1,Math.min(1,mousePos.y+dy*.04))};
    if (engine) engine.frequency.value = 40 + game.speed*70000;
    if (Date.now()-lastBoard > 250){ lastBoard = Date.now(); drawLive(); }
  };

  // ---------- INPUT / LIFECYCLE ----------
  var keys = {}, pad = {u:0,d:0,l:0,r:0};
  F.padHeld = function(){ return !!(pad.u || pad.d || pad.l || pad.r); };
  function initPad(){
    var el = $('ctl'); if (!el) return;
    var btns = el.querySelectorAll('button[data-k]');
    Array.prototype.forEach.call(btns, function(b){
      var k = b.getAttribute('data-k'), ids = {};
      function on(e){ e.preventDefault(); ids[e.pointerId] = 1; pad[k] = 1; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch(x){} }
      function off(e){ delete ids[e.pointerId]; if (!Object.keys(ids).length){ pad[k] = 0; b.classList.remove('down'); } }
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    });
    window.addEventListener('blur', function(){ pad.u = pad.d = pad.l = pad.r = 0; Array.prototype.forEach.call(btns, function(b){ b.classList.remove('down'); }); });
  }
  function setPause(p){
    F.paused = p && game.status === 'playing';   // menus and shops are never paused
    muted = p; apply();
    if (AC){ if (p) AC.suspend(); else AC.resume(); }
    try { if (cg && game.status==='playing') p ? cg.game.gameplayStop() : cg.game.gameplayStart(); } catch(e){}
    if (F.paused) toast('PAUSED - tap to resume','#fff6e2');
  }
  function init(){
    load(); if (S.wallet < 0) S.wallet = S.coins; drawPanel('menu'); sdkInit(); drawLive(); initPad(); gVisit();
    // keep the world board fresh on every device: poll while the page is visible, refresh the moment you come back
    setInterval(function(){ if (!document.hidden) gFetch(true); }, 10000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) gFetch(true); });
    window.addEventListener('online', function(){ G.dead = false; gFetch(true); });
    window.addEventListener('focus', function(){ gFetch(true); });
    $('playBtn').onclick = begin;
    $('hangarBtn').onclick = function(){ openShop('planes'); };
    $('mapsBtn').onclick = function(){ openShop('maps'); };
    $('backBtn').onclick = closeShop;
    $('optMusic').onchange = function(){ S.music = this.checked; apply(); save(); };
    $('optSfx').onchange = function(){ S.sfx = this.checked; apply(); save(); };
    $('soundBtn').onclick = function(){ var on = !(S.music||S.sfx); S.music = S.sfx = on; apply(); save(); $('optMusic').checked = $('optSfx').checked = on; };
    document.addEventListener('keydown', function(e){
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') { if (e.keyCode===13){ e.preventDefault(); begin(); } return; }
      keys[e.keyCode] = 1;
      // stop page scrolling while flying, but never cancel the native press of a focused menu button
      if ([32,37,38,39,40].indexOf(e.keyCode) > -1 && !(e.target && e.target.tagName === 'BUTTON' && e.target.id !== 'playBtn')) e.preventDefault();
      if (e.keyCode===32 || e.keyCode===13){
        if (e.repeat) return;
        var t = e.target, isBtn = t && t.tagName === 'BUTTON' && t.id !== 'playBtn';
        // Space/Enter on a focused Hangar / Maps / Back / shop button must press THAT button, not start the game
        if (!isBtn && $('panel').className !== 'hide' && $('shop').className === 'hide'){ e.preventDefault(); if (t && t.blur) t.blur(); begin(); }
      }
      else if (e.keyCode===80) setPause(!F.paused);
      else if (e.keyCode===77){ $('soundBtn').onclick(); }
    });
    document.addEventListener('keyup', function(e){ keys[e.keyCode] = 0; if (e.keyCode===32 && e.target && e.target.id==='playBtn') e.preventDefault(); });
    document.addEventListener('visibilitychange', function(){ if (document.hidden) setPause(true); else if (!F.paused) setPause(false); });
    window.addEventListener('pageshow', function(){ if (!F.paused) setPause(false); });
    window.addEventListener('blur', function(){ if (game.status==='playing') setPause(true); });
    window.addEventListener('focus', function(){ if (!document.hidden && !F.paused) setPause(false); });  // a paused game waits for a tap
    document.addEventListener('mousedown', function(e){ if (F.paused && e.target.tagName==='CANVAS') setPause(false); });
    document.addEventListener('touchstart', function(e){ if (F.paused && e.target.tagName==='CANVAS') setPause(false); }, false);
  }
  window.addEventListener('load', init, false);
  return F;
})();
