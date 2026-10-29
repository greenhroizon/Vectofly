// VectoFly - plane models + paint textures. Same low-poly look as the original, many different aircraft types.
// Nose points to +x, wings run along z, up is +y. Every model returns {propeller, pilot, tick, tail}.
var PB = (function(){
  var DARK = 0x23190f, BROWN = 0x59332e, WHITE = 0xd8d0d1, STEEL = 0x6b6f78, BRONZE = 0x8a6a3a;
  var texCache = {};

  function mat(c, o){
    var p = {color:c, shading:THREE.FlatShading};
    if (o) for (var k in o) p[k] = o[k];
    return new THREE.MeshPhongMaterial(p);
  }
  function glass(c){ return mat(c || 0x9fd8e8, {transparent:true, opacity:.5, shininess:120, specular:0xffffff}); }
  function glow(c){ return new THREE.MeshBasicMaterial({color:c}); }
  function add(p, m, geo, x, y, z){
    var me = new THREE.Mesh(geo, m);
    me.position.set(x||0, y||0, z||0); me.castShadow = true; me.receiveShadow = true; p.add(me); return me;
  }
  function box(p, w,h,d, m, x,y,z){ return add(p, m, new THREE.BoxGeometry(w,h,d), x,y,z); }
  // cylinder / cone along an axis ('x' nose = +x end = radius r1, 'y' default, 'z')
  function cyl(p, r1,r2,len, seg, m, x,y,z, ax){
    var me = add(p, m, new THREE.CylinderGeometry(r1,r2,len,seg||10), x,y,z);
    if (ax === 'x') me.rotation.z = -Math.PI/2; else if (ax === 'z') me.rotation.x = Math.PI/2;
    return me;
  }
  function sph(p, sx,sy,sz, m, x,y,z, seg){
    var me = add(p, m, new THREE.SphereGeometry(1, seg||10, Math.max(6, (seg||10)-2)), x,y,z);
    me.scale.set(sx,sy,sz); return me;
  }
  // swept, tapered wing: root chord, tip chord, span (z), sweep back at tip, thickness
  function wing(p, root, tip, span, sweep, thick, m, x,y,z, dihedral){
    var g = new THREE.BoxGeometry(root, thick, span, 1,1,2);
    for (var i=0;i<g.vertices.length;i++){
      var v = g.vertices[i], k = Math.abs(v.z)/(span/2);
      v.x = v.x*(1 - k*(1 - tip/root)) - k*sweep;
      v.y += k*(dihedral||0);
    }
    return add(p, m, g, x,y,z);
  }
  // tapered vertical fin (grows upward from y)
  function fin(p, h, root, tip, sweep, thick, m, x,y,z){
    var g = new THREE.BoxGeometry(root, h, thick, 1,2,1);
    for (var i=0;i<g.vertices.length;i++){
      var v = g.vertices[i], k = (v.y + h/2)/h;
      v.x = v.x*(1 - k*(1 - tip/root)) - k*sweep;
    }
    return add(p, m, g, x, y + h/2, z);
  }
  function wheel(p, x,y,z, r, w){ return cyl(p, r,r,w||4, 10, mat(DARK), x,y,z,'z'); }
  function strut(p, x,y,z, h, m){ return box(p, 3,h,3, m || mat(STEEL), x,y,z); }
  function propeller(p, x, len){
    var pr = new THREE.Object3D();
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(1.5,len||70,8), mat(DARK)); b1.castShadow = true;
    var b2 = b1.clone(); b2.rotation.x = Math.PI/2;
    var hub = new THREE.Mesh(new THREE.BoxGeometry(8,9,9), mat(BROWN));
    pr.add(b1); pr.add(b2); pr.add(hub); pr.position.set(x,0,0); p.add(pr); return pr;
  }
  function pilot(p, x,y,z, s){
    var pl = new Pilot(); pl.mesh.position.set(x,y,z); var k = s||1; pl.mesh.scale.set(k,k,k); p.add(pl.mesh); return pl;
  }

  // ---------- PAINT: solid colour or a procedural pattern texture ----------
  function Paint(spec, base){ this.spec = spec; this.base = base; }
  Paint.prototype.m = function(o){
    var m = mat(0xffffff, {shininess:60, specular:0x4a4a4a});
    if (o) for (var k in o) m[k] = o[k];
    var s = this.spec;
    if (s && s.pat && s.pat !== 'solid'){ m.map = paintTex(s); m.color.setHex(0xffffff); }
    else m.color.set((s && s.c) ? s.c : this.base);
    return m;
  };
  var PAT = {};
  PAT.stripe = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; c.fillRect(S*.38,0,S*.24,S); c.fillRect(S*.30,0,S*.03,S); c.fillRect(S*.67,0,S*.03,S); };
  PAT.bands = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; c.fillRect(0,S*.2,S,S*.12); c.fillRect(0,S*.6,S,S*.2); };
  PAT.checker = function(c, S, a, b){ var n = 8, w = S/n; for (var i=0;i<n;i++) for (var j=0;j<n;j++){ c.fillStyle = (i+j)%2 ? b : a; c.fillRect(i*w,j*w,w,w); } };
  PAT.camo = function(c, S, a, b, d){
    c.fillStyle = a; c.fillRect(0,0,S,S); var cols = [b, d || b], r = 12;
    for (var i=0;i<46;i++){ c.fillStyle = cols[i%2]; var x = Math.random()*S, y = Math.random()*S, w = 18+Math.random()*40, h = 12+Math.random()*26;
      for (var ox=-S; ox<=S; ox+=S) for (var oy=-S; oy<=S; oy+=S){ c.beginPath(); c.ellipse ? c.ellipse(x+ox,y+oy,w,h,Math.random()*3,0,7) : c.arc(x+ox,y+oy,w*.6,0,7); c.fill(); } }
  };
  PAT.flame = function(c, S, a, b){
    c.fillStyle = a; c.fillRect(0,0,S,S);
    var teeth = [[0,S*.55],[S*.12,S*.2],[S*.25,S*.6],[S*.38,S*.1],[S*.52,S*.55],[S*.66,S*.25],[S*.8,S*.62],[S*.92,S*.3],[S,S*.5]];
    [[b,0],['#ffd93a',S*.12]].forEach(function(L){
      c.fillStyle = L[0]; c.beginPath(); c.moveTo(0,S);
      teeth.forEach(function(t){ c.lineTo(t[0], t[1] + L[1] + S*.18); }); c.lineTo(S,S); c.fill();
    });
  };
  PAT.stars = function(c, S, a, b){
    c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b;
    for (var i=0;i<26;i++){ var x = Math.random()*S, y = Math.random()*S, r = 3+Math.random()*7;
      c.beginPath(); for (var k=0;k<10;k++){ var rr = k%2 ? r*.45 : r, an = k*Math.PI/5 - Math.PI/2; c.lineTo(x+Math.cos(an)*rr, y+Math.sin(an)*rr); } c.fill(); }
  };
  PAT.dots = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=0;i<6;i++) for (var j=0;j<6;j++){ c.beginPath(); c.arc((i+(j%2?.5:0))*S/6+S/12, j*S/6+S/12, S/17, 0, 7); c.fill(); } };
  PAT.zebra = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var y=-20;y<S+20;y+=34){ c.beginPath(); c.moveTo(0,y); for (var x=0;x<=S;x+=16) c.lineTo(x, y+Math.sin(x*.05+y)*10); for (var x2=S;x2>=0;x2-=16) c.lineTo(x2, y+16+Math.sin(x2*.05+y)*10); c.fill(); } };
  PAT.tiger = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=0;i<9;i++){ var y = i*S/9; c.beginPath(); c.moveTo(0,y); c.lineTo(S*.2,y+S*.06); c.lineTo(S*.34,y); c.lineTo(S*.55,y+S*.07); c.lineTo(S*.7,y); c.lineTo(S*.9,y+S*.05); c.lineTo(S,y); c.lineTo(S,y+S*.035); c.lineTo(S*.9,y+S*.08); c.lineTo(S*.7,y+S*.03); c.lineTo(S*.55,y+S*.1); c.lineTo(S*.34,y+S*.03); c.lineTo(S*.2,y+S*.09); c.lineTo(0,y+S*.035); c.fill(); } };
  PAT.gradient = function(c, S, a, b){ var g = c.createLinearGradient(0,0,0,S); g.addColorStop(0,a); g.addColorStop(1,b); c.fillStyle = g; c.fillRect(0,0,S,S); };
  PAT.rainbow = function(c, S){ var g = c.createLinearGradient(0,0,S,0); for (var i=0;i<=6;i++) g.addColorStop(i/6,'hsl('+(i*60)+',85%,58%)'); c.fillStyle = g; c.fillRect(0,0,S,S); };
  PAT.carbon = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); var w = S/16; for (var i=0;i<16;i++) for (var j=0;j<16;j++){ c.fillStyle = (i+j)%2 ? b : a; c.fillRect(i*w,j*w,w-1,w-1); c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(i*w,j*w,w-1,(w-1)/2); } };
  PAT.hazard = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=-S;i<S*2;i+=S/4){ c.beginPath(); c.moveTo(i,0); c.lineTo(i+S/8,0); c.lineTo(i+S/8+S,S); c.lineTo(i+S,S); c.fill(); } };
  PAT.chevron = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.lineWidth = S*.07; for (var y=-S*.2;y<S*1.1;y+=S*.22){ c.beginPath(); c.moveTo(0,y); c.lineTo(S/2,y+S*.14); c.lineTo(S,y); c.stroke(); } };
  PAT.scales = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.lineWidth = 2; var r = S/8; for (var y=0;y<=S+r;y+=r*.8) for (var x=(Math.round(y/(r*.8))%2?0:r); x<=S+r; x+=r*2){ c.beginPath(); c.arc(x,y,r,0,Math.PI); c.stroke(); } };
  PAT.galaxy = function(c, S, a, b){
    var g = c.createRadialGradient(S*.6,S*.4,10,S*.5,S*.5,S*.75); g.addColorStop(0,b); g.addColorStop(.5,a); g.addColorStop(1,'#0a0420'); c.fillStyle = g; c.fillRect(0,0,S,S);
    c.fillStyle = '#fff'; for (var i=0;i<70;i++){ c.globalAlpha = .3 + Math.random()*.7; c.fillRect(Math.random()*S, Math.random()*S, 1+Math.random()*2, 1+Math.random()*2); } c.globalAlpha = 1;
  };
  PAT.cane = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=-S;i<S*2;i+=S/3){ c.beginPath(); c.moveTo(i,0); c.lineTo(i+S/6,0); c.lineTo(i+S/6+S,S); c.lineTo(i+S,S); c.fill(); } };
  PAT.grid = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.lineWidth = 3; for (var i=0;i<=S;i+=S/8){ c.beginPath(); c.moveTo(i,0); c.lineTo(i,S); c.moveTo(0,i); c.lineTo(S,i); c.stroke(); } };
  PAT.digital = function(c, S, a, b, d){ c.fillStyle = a; c.fillRect(0,0,S,S); var w = S/14, cols = [b, d||b, a]; for (var i=0;i<14;i++) for (var j=0;j<14;j++){ var r = Math.random(); if (r < .5){ c.fillStyle = cols[r < .25 ? 0 : 1]; c.fillRect(i*w,j*w,w,w); } } };
  PAT.shark = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; c.fillRect(0,S*.55,S,S*.45); c.fillStyle = '#fff'; for (var i=0;i<8;i++){ c.beginPath(); c.moveTo(i*S/8, S*.55); c.lineTo(i*S/8+S/16, S*.72); c.lineTo(i*S/8+S/8, S*.55); c.fill(); } };

  // ---- more paint patterns ----
  PAT.wood = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; for (var y=0;y<S;y+=7){ c.globalAlpha = .25 + Math.random()*.3; c.lineWidth = 1 + Math.random()*2; c.beginPath(); for (var x=0;x<=S;x+=16) c.lineTo(x, y + Math.sin(x*.03+y*.4)*3); c.stroke(); } c.globalAlpha = 1; for (var i=0;i<4;i++){ c.strokeStyle = b; c.lineWidth = 2; var kx = Math.random()*S, ky = Math.random()*S; for (var r=3;r<12;r+=3){ c.beginPath(); c.ellipse ? c.ellipse(kx,ky,r*1.6,r*.8,0,0,7) : c.arc(kx,ky,r,0,7); c.stroke(); } } };
  PAT.leopard = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.fillStyle = b; for (var i=0;i<38;i++){ var x = Math.random()*S, y = Math.random()*S, r = 7+Math.random()*8, st = Math.random()*6; c.lineWidth = 4; c.beginPath(); c.arc(x,y,r,st,st+4.6); c.stroke(); c.beginPath(); c.arc(x+r*.2,y,2,0,7); c.fill(); } };
  PAT.plaid = function(c, S, a, b, d){ c.fillStyle = a; c.fillRect(0,0,S,S); c.globalAlpha = .6; c.fillStyle = b; [[.15,.18],[.55,.1]].forEach(function(p){ c.fillRect(S*p[0],0,S*p[1],S); c.fillRect(0,S*p[0],S,S*p[1]); }); c.globalAlpha = 1; c.fillStyle = d || '#fff'; [.1,.5,.8].forEach(function(p){ c.fillRect(S*p,0,2,S); c.fillRect(0,S*p,S,2); }); };
  PAT.hex = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.lineWidth = 3; var r = S/9, h = r*Math.sqrt(3)/2; for (var row=-1; row<S/h+1; row++) for (var col=-1; col<S/(r*1.5)+1; col++){ var x = col*r*1.5, y = row*h*2 + (col%2 ? h : 0); c.beginPath(); for (var k=0;k<6;k++){ var an = k*Math.PI/3; c.lineTo(x+Math.cos(an)*r, y+Math.sin(an)*r); } c.closePath(); c.stroke(); } };
  PAT.sunburst = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; var n = 16; for (var i=0;i<n;i+=2){ c.beginPath(); c.moveTo(S/2,S/2); c.arc(S/2,S/2,S*1.1,i/n*Math.PI*2,(i+1)/n*Math.PI*2); c.fill(); } c.fillStyle = a; c.beginPath(); c.arc(S/2,S/2,S*.12,0,7); c.fill(); };
  PAT.waves = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.lineWidth = 3; var r = S/10; for (var y=0;y<S+r;y+=r*.7) for (var x=(Math.round(y/(r*.7))%2?-r/2:0); x<S+r; x+=r){ c.beginPath(); c.arc(x,y,r/2,Math.PI,0); c.stroke(); } };
  PAT.lava = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); [[b,7],['#ffd23a',2.5]].forEach(function(L){ c.strokeStyle = L[0]; c.lineWidth = L[1]; Math.random(); for (var i=0;i<12;i++){ var x = Math.random()*S, y = Math.random()*S; c.beginPath(); c.moveTo(x,y); for (var k=0;k<5;k++){ x += (Math.random()-.5)*70; y += (Math.random()-.4)*50; c.lineTo(x,y); } c.stroke(); } }); };
  PAT.ice = function(c, S, a, b){ var g = c.createLinearGradient(0,0,S,S); g.addColorStop(0,a); g.addColorStop(1,'#7fb8e8'); c.fillStyle = g; c.fillRect(0,0,S,S); for (var i=0;i<26;i++){ c.fillStyle = 'rgba(255,255,255,'+(.08+Math.random()*.22)+')'; c.beginPath(); var x = Math.random()*S, y = Math.random()*S; c.moveTo(x,y); c.lineTo(x+Math.random()*80-40,y+Math.random()*80-40); c.lineTo(x+Math.random()*80-40,y+Math.random()*80-40); c.fill(); } c.strokeStyle = b; c.lineWidth = 1.5; for (var j=0;j<14;j++){ c.beginPath(); var x2 = Math.random()*S, y2 = Math.random()*S; c.moveTo(x2,y2); c.lineTo(x2+Math.random()*90-45, y2+Math.random()*90-45); c.stroke(); } };
  PAT.hearts = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; function heart(x,y,s){ c.beginPath(); c.moveTo(x,y+s*.35); c.bezierCurveTo(x-s,y-s*.4,x-s*.35,y-s,x,y-s*.35); c.bezierCurveTo(x+s*.35,y-s,x+s,y-s*.4,x,y+s*.35); c.fill(); } for (var i=0;i<5;i++) for (var j=0;j<5;j++) heart(i*S/5+(j%2?S/10:0)+S/10, j*S/5+S/9, S/12); };
  PAT.circuit = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; c.fillStyle = b; c.lineWidth = 2.5; for (var i=0;i<18;i++){ var x = Math.round(Math.random()*16)*S/16, y = Math.round(Math.random()*16)*S/16; c.beginPath(); c.moveTo(x,y); for (var k=0;k<3;k++){ if (k%2) y += (Math.random()<.5?-1:1)*S/16*(1+Math.floor(Math.random()*3)); else x += (Math.random()<.5?-1:1)*S/16*(1+Math.floor(Math.random()*3)); c.lineTo(x,y); } c.stroke(); c.beginPath(); c.arc(x,y,4,0,7); c.fill(); } c.globalAlpha = .5; for (var j=0;j<6;j++) c.fillRect(Math.random()*S, Math.random()*S, 14, 9); c.globalAlpha = 1; };
  PAT.argyle = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; var w = S/4; for (var i=0;i<4;i++) for (var j=0;j<4;j++) if ((i+j)%2 === 0){ var cx = i*w + w/2, cy = j*w + w/2; c.beginPath(); c.moveTo(cx,cy-w/2); c.lineTo(cx+w/2,cy); c.lineTo(cx,cy+w/2); c.lineTo(cx-w/2,cy); c.fill(); } c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; for (var k=-S;k<S*2;k+=w){ c.beginPath(); c.moveTo(k,0); c.lineTo(k+S,S); c.moveTo(k+S,0); c.lineTo(k,S); c.stroke(); } };
  PAT.cow = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=0;i<9;i++){ var x = Math.random()*S, y = Math.random()*S, r = 16+Math.random()*26; c.beginPath(); for (var k=0;k<10;k++){ var an = k/10*Math.PI*2, rr = r*(.65+Math.random()*.5); c.lineTo(x+Math.cos(an)*rr, y+Math.sin(an)*rr); } c.fill(); } };
  PAT.flag = function(c, S, a, b, d){ c.fillStyle = a; c.fillRect(0,0,S,S/3); c.fillStyle = b; c.fillRect(0,S/3,S,S/3+1); c.fillStyle = d || a; c.fillRect(0,S*2/3,S,S/3); };
  PAT.swirl = function(c, S, a, b, d){ var cols = [a,b,d||a]; c.fillStyle = a; c.fillRect(0,0,S,S); for (var i=0;i<12;i++){ c.fillStyle = cols[i%3]; c.beginPath(); c.moveTo(0,i*S/12-S/12); for (var x=0;x<=S;x+=16) c.lineTo(x, i*S/12-S/12 + Math.sin(x/S*Math.PI*2 + i*.5)*S/14); c.lineTo(S,S*2); c.lineTo(0,S*2); c.fill(); } };
  PAT.bolt = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.fillStyle = b; for (var i=0;i<4;i++){ var x = (i+.5)*S/4 + (Math.random()-.5)*20, y = 0; c.beginPath(); c.moveTo(x,y); for (var k=0;k<6;k++){ x += (k%2 ? -1 : 1)*(10+Math.random()*16); y += S/6; c.lineTo(x,y); } c.lineTo(x+7,y); for (var k2=5;k2>=0;k2--){ x -= (k2%2 ? -1 : 1)*(10+Math.random()*16); y -= S/6; c.lineTo(x+8,y); } c.fill(); } };
  PAT.marble = function(c, S, a, b){ c.fillStyle = a; c.fillRect(0,0,S,S); c.strokeStyle = b; for (var i=0;i<9;i++){ c.globalAlpha = .25 + Math.random()*.4; c.lineWidth = .8 + Math.random()*2.6; var x = Math.random()*S, y = Math.random()*S; c.beginPath(); c.moveTo(x,y); c.bezierCurveTo(x+Math.random()*120-60,y+Math.random()*120-60,x+Math.random()*120-60,y+Math.random()*120-60,x+Math.random()*160-80,y+Math.random()*160-80); c.stroke(); } c.globalAlpha = 1; };

  function paintTex(s){
    if (texCache[s.id]) return texCache[s.id];
    var S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    var c = cv.getContext('2d');
    // deterministic-ish: seed Math.random per paint so previews and in-game match
    var seed = 0; for (var i=0;i<s.id.length;i++) seed = (seed*31 + s.id.charCodeAt(i)) >>> 0;
    var orig = Math.random; Math.random = function(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; };
    try { (PAT[s.pat] || PAT.stripe)(c, S, s.c, s.c2 || '#ffffff', s.c3); } catch(e){}
    Math.random = orig;
    var t = new THREE.Texture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
    return texCache[s.id] = t;
  }

  // ---------- MODELS ----------
  var K = {};

  // original Aviator-style prop plane (unchanged look)
  K.prop = function(g, P){
    var cg = new THREE.BoxGeometry(80,50,50,1,1,1);
    cg.vertices[4].y-=10; cg.vertices[4].z+=20; cg.vertices[5].y-=10; cg.vertices[5].z-=20;
    cg.vertices[6].y+=30; cg.vertices[6].z+=20; cg.vertices[7].y+=30; cg.vertices[7].z-=20;
    add(g, P.m(), cg);
    add(g, mat(WHITE), new THREE.BoxGeometry(20,50,50), 50,0,0);
    var tail = box(g, 15,20,5, P.m(), -40,20,0);
    var w1 = box(g, 30,5,120, P.m(), 0,15,0);
    var w2 = box(g, 30,5,120, P.m(), 0,-12,0); w2.visible = false;
    box(g, 3,15,20, mat(WHITE,{transparent:true,opacity:.3}), 5,27,0);
    var pr = new THREE.Object3D();
    var pg = new THREE.BoxGeometry(20,10,10);
    pg.vertices[4].y-=5; pg.vertices[4].z+=5; pg.vertices[5].y-=5; pg.vertices[5].z-=5;
    pg.vertices[6].y+=5; pg.vertices[6].z+=5; pg.vertices[7].y+=5; pg.vertices[7].z-=5;
    var hub = new THREE.Mesh(pg, mat(BROWN)); hub.castShadow = true; pr.add(hub);
    var bl = new THREE.Mesh(new THREE.BoxGeometry(1,80,10), mat(DARK)); bl.position.x = 8; bl.castShadow = true;
    var bl2 = bl.clone(); bl2.rotation.x = Math.PI/2; pr.add(bl); pr.add(bl2); pr.position.set(60,0,0); g.add(pr);
    [25,-25].forEach(function(z){ box(g, 30,15,10, P.m(), 25,-20,z); box(g, 24,24,4, mat(DARK), 25,-28,z); });
    box(g, 10,10,6, mat(BROWN), 25,-28,25); box(g, 10,10,6, mat(BROWN), 25,-28,-25);
    box(g, 12,12,2, mat(DARK), -35,-5,0);
    var su = box(g, 4,20,4, P.m(), -35,5,0); su.rotation.z = -.3;
    return {propeller:pr, pilot:pilot(g, -10,27,0), tail:-44, w2:w2, tailPart:tail};
  };

  // Falcon: sleek single-prop racer
  K.racer = function(g, P){
    cyl(g, 11,4.5,112,12, P.m(), 2,0,0,'x');
    cyl(g, 0,8,16,10, mat(WHITE), 66,0,0,'x');
    cyl(g, 12,11,6,12, mat(STEEL), 56,0,0,'x');
    wing(g, 42,16,136,20,4, P.m(), 4,-4,0, 3);
    wing(g, 18,8,48,8,2.5, P.m(), -46,2,0);
    fin(g, 28,26,10,16,3, P.m(), -44,3,0);
    sph(g, 17,9,8, glass(), 0,9,0);
    cyl(g, 4.5,4.5,22,8, mat(DARK), 14,-2,0,'x');
    strut(g, 12,-12,16,12); strut(g, 12,-12,-16,12); wheel(g, 12,-19,16,6); wheel(g, 12,-19,-16,6); wheel(g, -46,-4,0,3);
    return {propeller:propeller(g, 74, 66), pilot:pilot(g, -2,11,0,.7), tail:-50};
  };

  // Comet: floatplane, high wing
  K.float = function(g, P){
    cyl(g, 12,7,104,12, P.m(), 3,0,0,'x');
    cyl(g, 13.5,13.5,12,12, mat(WHITE), 58,0,0,'x');
    wing(g, 34,26,136,6,4, P.m(), 8,28,0);
    [[10,16],[-2,16],[10,-16],[-2,-16]].forEach(function(s){ var st = box(g, 2.5,28,2.5, mat(STEEL), s[0],14,s[1]); st.rotation.x = s[1] > 0 ? -.45 : .45; st.position.z = s[1]*1.6; });
    box(g, 14,8,1, mat(DARK), 14,6,12); box(g, 14,8,1, mat(DARK), 14,6,-12);
    sph(g, 14,8,10, glass(), 14,12,0);
    [30,-30].forEach(function(z){ sph(g, 44,6.5,7, P.m(), 0,-30,z,12); strut(g, 12,-17,z*.92,26); strut(g, -14,-17,z*.92,26); });
    wing(g, 18,8,50,8,2.5, P.m(), -46,3,0);
    fin(g, 28,26,10,16,3, P.m(), -44,3,0);
    return {propeller:propeller(g, 67, 68), pilot:pilot(g, 10,14,0,.7), tail:-50};
  };

  // Tank: twin-engine heavy bomber
  K.bomber = function(g, P){
    cyl(g, 14,8,108,12, P.m(), 0,0,0,'x');
    sph(g, 16,13,13, glass(), 54,2,0);
    wing(g, 38,30,156,4,7, P.m(), 2,-3,0);
    var props = [];
    [38,-38].forEach(function(z){
      cyl(g, 8,8,44,10, P.m(), 12,-4,z,'x'); cyl(g, 0,8,10,10, mat(WHITE), 40,-4,z,'x');
      var pr = propeller(g, 46, 46); pr.position.z = z; pr.position.y = -4; props.push(pr);
      strut(g, 16,-16,z,12); wheel(g, 16,-24,z,8,5);
    });
    wing(g, 26,12,72,10,3, P.m(), -46,5,0);
    fin(g, 40,34,14,22,4, P.m(), -44,6,0);
    box(g, 16,3,16, mat(DARK), -8,14,0);
    var tick = function(){ props[1].rotation.x = props[0].rotation.x; };
    return {propeller:props[0], tick:tick, pilot:pilot(g, 48,2,0,.6), tail:-54};
  };

  // Viper: delta-wing jet fighter with afterburner
  K.jet = function(g, P){
    cyl(g, 4,10,122,12, P.m(), 0,0,0,'x');
    cyl(g, 0,5,20,10, mat(STEEL), 70,0,0,'x');
    wing(g, 72,12,112,42,4, P.m(), -12,-2,0);
    wing(g, 20,8,36,8,2.5, P.m(), 26,0,0);
    [9,-9].forEach(function(z, i){ var f = fin(g, 32,28,10,18,3, P.m(), -46,6,z); f.rotation.x = z > 0 ? -.28 : .28; });
    sph(g, 20,7,6.5, glass(), 16,8,0);
    box(g, 16,7,8, mat(DARK), 26,-5,10); box(g, 16,7,8, mat(DARK), 26,-5,-10);
    cyl(g, 7,7.5,12,10, mat(STEEL), -64,0,0,'x');
    var fl = cyl(g, 7,0,40,10, glow(0xffa030), -88,0,0,'x');
    var fl2 = cyl(g, 4,0,28,10, glow(0xfff0a0), -80,0,0,'x');
    strut(g, 20,-10,6,10); wheel(g, 20,-16,6,4); strut(g, 20,-10,-6,10); wheel(g, 20,-16,-6,4);
    var tick = function(){ var s = .8 + Math.random()*.5; fl.scale.set(s,1,1); fl2.scale.set(s,1,1); };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 14,8,0,.55), tail:-70};
  };

  // Phantom: electric glider, long thin wings
  K.glider = function(g, P){
    cyl(g, 6.5,2.5,112,10, P.m(), 0,0,0,'x');
    sph(g, 22,9.5,7.5, glass(), 20,7,0);
    wing(g, 22,10,170,2,3, P.m(), 6,6,0, 5);
    wing(g, 16,8,46,6,2, P.m(), -56,30,0);
    fin(g, 32,22,10,12,2.5, P.m(), -52,2,0);
    wheel(g, 12,-9,0,4); strut(g, 12,-6,0,5);
    cyl(g, 3,3,12,8, mat(STEEL), 56,0,0,'x');
    return {propeller:propeller(g, 63, 46), pilot:pilot(g, 18,8,0,.6), tail:-56};
  };

  // Thunder: classic biplane with struts and radial engine
  K.biplane = function(g, P){
    cyl(g, 12,5,92,12, P.m(), -2,0,0,'x');
    cyl(g, 15,15,16,14, mat(STEEL), 50,0,0,'x');
    cyl(g, 0,6,10,10, mat(BRONZE), 62,0,0,'x');
    box(g, 28,3,134, P.m(), 8,30,0);
    box(g, 26,3,120, P.m(), 0,-10,0);
    [[10,40],[-6,40],[10,-40],[-6,-40]].forEach(function(s){ box(g, 2,40,2, mat(DARK), s[0],10,s[1]); });
    [[4,9],[4,-9]].forEach(function(s){ var c = box(g, 2.5,24,2.5, mat(DARK), s[0],19,s[1]); c.rotation.x = s[1] > 0 ? -.4 : .4; });
    wing(g, 22,10,58,0,2.5, P.m(), -42,3,0);
    fin(g, 28,24,8,14,3, P.m(), -42,3,0);
    box(g, 14,3,12, mat(DARK), 8,13,0);
    strut(g, 16,-12,15,16, mat(DARK)); strut(g, 16,-12,-15,16, mat(DARK)); wheel(g, 16,-22,15,8,4); wheel(g, 16,-22,-15,8,4);
    wheel(g, -44,-5,0,3);
    return {propeller:propeller(g, 69, 74), pilot:pilot(g, 8,17,0,.85), tail:-48};
  };

  // Golden Jet: business jet
  K.bizjet = function(g, P){
    cyl(g, 10,9.5,84,14, P.m(), -4,0,0,'x');
    cyl(g, 1.5,10,28,14, P.m(), 52,0,0,'x');
    cyl(g, 9.5,3,30,14, P.m(), -61,0,0,'x');
    wing(g, 42,14,124,32,3.5, P.m(), 2,-4,0, 3);
    [62,-62].forEach(function(z){ var w = fin(g, 16,14,6,9,2, P.m(), -32,-4,z); });
    [14,-14].forEach(function(z){ cyl(g, 6,5.5,28,10, mat(STEEL), -42,8,z,'x'); cyl(g, 5.5,5,6,10, mat(DARK), -58,8,z,'x'); box(g, 18,3,3, P.m(), -40,3,z*.7); });
    fin(g, 34,26,10,16,3, P.m(), -56,5,0);
    wing(g, 18,8,46,8,2.5, P.m(), -62,38,0);
    for (var x=-26;x<=30;x+=10){ box(g, 5,4,.6, mat(DARK), x,3,9.8); box(g, 5,4,.6, mat(DARK), x,3,-9.8); }
    sph(g, 11,5.5,7.5, glass(0x2a3a48), 40,5,0);
    strut(g, 28,-9,0,10); wheel(g, 28,-15,0,4); strut(g, -8,-9,9,10); wheel(g, -8,-15,9,4); strut(g, -8,-9,-9,10); wheel(g, -8,-15,-9,4);
    return {propeller:new THREE.Object3D(), pilot:pilot(g, 36,5,0,.5), tail:-84};
  };

  // Inferno: rocket plane with flame
  K.rocket = function(g, P){
    cyl(g, 8,8,76,14, P.m(), -10,0,0,'x');
    cyl(g, 1,8,42,14, P.m(), 46,0,0,'x');
    cyl(g, 8,10,12,12, mat(DARK), -54,0,0,'x');
    var fl = cyl(g, 9,0,64,12, glow(0xff6a1a), -92,0,0,'x');
    var fl2 = cyl(g, 5,0,44,12, glow(0xffe14a), -82,0,0,'x');
    wing(g, 36,12,76,16,3, P.m(), -22,-2,0);
    fin(g, 32,28,10,16,3, P.m(), -40,6,0);
    var lo = fin(g, 26,24,8,12,3, P.m(), -40,-6,0); lo.rotation.x = Math.PI; lo.position.y = -6 - 13;
    [10,-10].forEach(function(z){ var f = fin(g, 22,22,8,12,3, P.m(), -42,0,z); f.rotation.x = z > 0 ? -1.1 : 1.1; });
    sph(g, 10,4.5,6, glass(0x2a3a48), 30,7,0);
    var tick = function(){ var s = .75 + Math.random()*.6; fl.scale.set(s,1,1); fl2.scale.set(s,1,1); };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 26,9,0,.5), tail:-80};
  };

  // Stealth: flying wing
  K.stealth = function(g, P){
    var s = new THREE.Shape();
    var half = [[64,0],[-18,92],[-34,74],[-16,48],[-40,28],[-30,0]];
    s.moveTo(half[0][0], half[0][1]);
    for (var i=1;i<half.length;i++) s.lineTo(half[i][0], half[i][1]);
    for (var j=half.length-2;j>=1;j--) s.lineTo(half[j][0], -half[j][1]);
    s.lineTo(half[0][0], 0);
    var eg = new THREE.ExtrudeGeometry(s, {amount:4, bevelEnabled:true, bevelThickness:2, bevelSize:2.5, bevelSegments:1});
    var body = add(g, P.m(), eg); body.rotation.x = -Math.PI/2; body.position.y = -2;
    sph(g, 40,8,14, P.m(), 2,2,0,12);
    sph(g, 11,4,6, glass(0x2a3a48), 24,7,0);
    box(g, 4,2,20, mat(0x101015), -34,0,0);
    [-1,1].forEach(function(sgn){ box(g, 8,3,4, mat(0x101015), 6,-3,sgn*34); });
    wheel(g, 18,-8,0,3);
    return {propeller:new THREE.Object3D(), pilot:pilot(g, 20,7,0,.5), tail:-44};
  };

  // Royal Zeppelin: airship
  K.zeppelin = function(g, P){
    sph(g, 66,23,23, P.m(), 0,6,0,18);
    fin(g, 26,28,10,14,2.5, P.m(), -54,10,0);
    var lo = fin(g, 26,28,10,14,2.5, P.m(), -54,2,0); lo.rotation.x = Math.PI; lo.position.y = 2 - 13;
    [1,-1].forEach(function(s){ var f = fin(g, 26,28,10,14,2.5, P.m(), -54,6,0); f.rotation.x = s*Math.PI/2; f.position.set(-54,6,s*13); });
    box(g, 40,10,14, mat(0x7a5230), 6,-20,0);
    box(g, 6,6,15, glass(0x2a3a48), 28,-19,0);
    for (var x=-8;x<=18;x+=8){ box(g, 4,4,.6, mat(0xffe9a0), x,-19,7.2); box(g, 4,4,.6, mat(0xffe9a0), x,-19,-7.2); }
    strut(g, -6,-12,0,8); strut(g, 18,-12,0,8);
    var props = [];
    [11,-11].forEach(function(z){ cyl(g, 3,3,10,8, mat(STEEL), -16,-20,z,'x'); var pr = propeller(g, -22, 26); pr.position.y = -20; pr.position.z = z; props.push(pr); });
    var tick = function(){ props[1].rotation.x = props[0].rotation.x; };
    return {propeller:props[0], tick:tick, pilot:pilot(g, 30,-13,0,.55), tail:-68};
  };

  // Chopper: helicopter
  K.heli = function(g, P){
    sph(g, 30,16,15, P.m(), 0,0,0,12);
    sph(g, 17,12,12, glass(), 20,2,0,10);
    cyl(g, 6,2.5,56,8, P.m(), -42,4,0,'x');
    fin(g, 20,16,6,8,2, P.m(), -66,3,0);
    var tr = new THREE.Object3D(); tr.position.set(-68,13,5);
    var b = new THREE.Mesh(new THREE.BoxGeometry(2,22,3), mat(DARK)); var b2 = b.clone(); b2.rotation.z = Math.PI/2; tr.add(b); tr.add(b2); g.add(tr);
    cyl(g, 2.5,3,10,8, mat(STEEL), 0,18,0);
    var rotor = new THREE.Object3D(); rotor.position.set(0,24,0);
    var r1 = new THREE.Mesh(new THREE.BoxGeometry(124,1.5,7), mat(DARK)); r1.castShadow = true; var r2 = r1.clone(); r2.rotation.y = Math.PI/2;
    rotor.add(r1); rotor.add(r2); g.add(rotor);
    [13,-13].forEach(function(z){ cyl(g, 1.8,1.8,66,6, mat(STEEL), 2,-21,z,'x'); strut(g, 14,-14,z,14); strut(g, -12,-14,z,14); });
    var tick = function(dt){ rotor.rotation.y += .7; tr.rotation.z += .9; };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 16,5,0,.75), tail:-70};
  };

  // Saucer: UFO
  K.ufo = function(g, P){
    var pts = [[0,-9],[20,-9],[40,-4],[60,0],[42,5],[26,8],[0,9]].map(function(p){ return new THREE.Vector2(p[0], p[1]); });
    add(g, P.m(), new THREE.LatheGeometry(pts, 22));
    sph(g, 24,18,24, glass(0x9fe8e0), 0,9,0,14);
    var ring = new THREE.Object3D(); g.add(ring);
    for (var i=0;i<10;i++){ var a = i/10*Math.PI*2, c = i%2 ? 0xffe14a : 0x6affd8, l = new THREE.Mesh(new THREE.SphereGeometry(3,6,5), glow(c)); l.position.set(Math.cos(a)*50, 0, Math.sin(a)*50); ring.add(l); }
    cyl(g, 18,24,3, 16, glow(0x6affd8), 0,-10,0);
    var tick = function(){ ring.rotation.y += .05; };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 0,10,0,.7), tail:-42};
  };

  // Shuttle: orbiter
  K.shuttle = function(g, P){
    cyl(g, 12,12,86,14, P.m(), -4,0,0,'x');
    cyl(g, 2,12,36,14, mat(0x2a2a30), 57,0,0,'x');
    box(g, 12,2,14, glass(0x1a2430), 32,11,0);
    wing(g, 76,10,106,56,4, P.m(), -22,-8,0, 2);
    fin(g, 42,40,12,28,4, P.m(), -36,10,0);
    [[4,0],[-4,7],[-4,-7]].forEach(function(p){ cyl(g, 4,5.5,10,8, mat(STEEL), -50,p[0],p[1],'x'); });
    var fls = [[4,0],[-4,7],[-4,-7]].map(function(p){ return cyl(g, 4,0,30,8, glow(0x9fd0ff), -68,p[0],p[1],'x'); });
    sph(g, 16,6,9, mat(0xcfd2d8), -34,13,0,10);
    var tick = function(){ var s = .8 + Math.random()*.4; fls.forEach(function(f){ f.scale.set(s,1,1); }); };
    var pl = pilot(g, 30,12,0,.5); pl.mesh.visible = false;
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pl, tail:-64};
  };

  // ===== NEW AIRCRAFT =====

  // Mustang: WWII warbird with bubble canopy and roundels
  K.warbird = function(g, P){
    cyl(g, 11,6,104,12, P.m(), 0,0,0,'x');
    cyl(g, 12,12,14,12, mat(STEEL), 54,0,0,'x');
    cyl(g, 0,8,12,10, mat(BRONZE), 66,0,0,'x');
    wing(g, 42,22,148,6,4, P.m(), 6,-5,0, 3);
    wing(g, 20,10,52,6,2.5, P.m(), -46,1,0);
    fin(g, 28,24,10,14,3, P.m(), -46,4,0);
    sph(g, 18,8,7, glass(), -6,10,0);
    box(g, 22,6,10, mat(DARK), 14,-10,0);
    cyl(g, 5,5,.8,10, mat(0x2a4aa0), -24,2,10.6,'z'); cyl(g, 5,5,.8,10, mat(0x2a4aa0), -24,2,-10.6,'z');
    cyl(g, 2.4,2.4,1,10, mat(WHITE), -24,2,10.9,'z'); cyl(g, 2.4,2.4,1,10, mat(WHITE), -24,2,-10.9,'z');
    strut(g, 8,-14,22,12); strut(g, 8,-14,-22,12); wheel(g, 8,-21,22,6); wheel(g, 8,-21,-22,6); wheel(g, -46,-4,0,3);
    return {propeller:propeller(g, 72, 72), pilot:pilot(g, -6,10,0,.55), tail:-52};
  };

  // Red Baron: three stacked wings, radial engine
  K.triplane = function(g, P){
    cyl(g, 12,5,90,12, P.m(), -2,0,0,'x');
    cyl(g, 14,14,14,14, mat(STEEL), 48,0,0,'x');
    cyl(g, 0,6,9,10, mat(DARK), 58,0,0,'x');
    box(g, 24,3,100, P.m(), 2,-12,0); box(g, 26,3,118, P.m(), 4,10,0); box(g, 24,3,104, P.m(), 4,32,0);
    [38,-38].forEach(function(z){ [[8,-1],[-6,-1]].forEach(function(s){ box(g, 2,46,2, mat(DARK), s[0],10,z); }); });
    [[6,10],[6,-10]].forEach(function(s){ var c = box(g, 2.5,34,2.5, mat(DARK), s[0],16,s[1]); c.rotation.x = s[1] > 0 ? -.3 : .3; });
    wing(g, 22,10,56,0,2.5, P.m(), -42,3,0);
    fin(g, 28,24,8,14,3, P.m(), -42,3,0);
    cyl(g, 3.5,3.5,14,8, mat(DARK), 24,2,0,'x');
    strut(g, 16,-12,15,16, mat(DARK)); strut(g, 16,-12,-15,16, mat(DARK)); wheel(g, 16,-22,15,8,4); wheel(g, 16,-22,-15,8,4); wheel(g, -44,-5,0,3);
    return {propeller:propeller(g, 64, 70), pilot:pilot(g, 4,14,0,.8), tail:-48};
  };

  // Jumbo Liner: twin-engine airliner (built in a scaled sub-group so it matches the other planes in size)
  K.airliner = function(g, P){
    var h = new THREE.Object3D(); h.scale.set(.74,.74,.74); g.add(h);
    cyl(h, 11,11,118,14, P.m(), -2,0,0,'x');
    cyl(h, 1,11,26,14, P.m(), 70,0,0,'x');
    cyl(h, 11,2.5,36,14, P.m(), -77,2,0,'x');
    wing(h, 46,14,190,40,4, P.m(), 2,-5,0, 5);
    [40,-40].forEach(function(z){ cyl(h, 6.5,6,30,12, mat(STEEL), 20,-13,z,'x'); cyl(h, 5.5,5.5,3,12, mat(DARK), 35.5,-13,z,'x'); box(h, 14,6,3, P.m(), 20,-7,z); });
    fin(h, 48,40,14,26,4, P.m(), -70,8,0);
    wing(h, 26,10,70,14,3, P.m(), -76,6,0, 2);
    for (var x=-44;x<=46;x+=8){ box(h, 3,3,.6, mat(0x2a3a48), x,4,11); box(h, 3,3,.6, mat(0x2a3a48), x,4,-11); }
    box(h, 5,3.5,13, mat(0x1a2a38), 61,5,0);
    strut(h, 44,-12,0,10); wheel(h, 44,-18,0,4); [[0,10],[0,-10]].forEach(function(s){ strut(h, s[0],-12,s[1],10); wheel(h, s[0],-18,s[1],5); });
    var pl = pilot(h, 60,4,0,.01); pl.mesh.visible = false;
    return {propeller:new THREE.Object3D(), pilot:pl, tail:-95*.74};
  };

  // Lightning: twin-boom fighter
  K.twinboom = function(g, P){
    cyl(g, 9,5,60,12, P.m(), 14,0,0,'x');
    sph(g, 16,8,8, glass(), 20,7,0);
    wing(g, 36,18,150,4,4, P.m(), 4,-2,0, 2);
    var props = [];
    [34,-34].forEach(function(z){
      cyl(g, 8,5.5,52,12, P.m(), 4,-2,z,'x');
      cyl(g, 5,2.8,70,10, P.m(), -56,-1,z,'x');
      fin(g, 30,24,9,14,3, P.m(), -88,0,z);
      cyl(g, 0,6,9,10, mat(BRONZE), 33,-2,z,'x');
      var pr = propeller(g, 36, 54); pr.position.y = -2; pr.position.z = z; props.push(pr);
      strut(g, 10,-12,z,12); wheel(g, 10,-19,z,6,4);
    });
    box(g, 18,3,68, P.m(), -84,24,0);
    strut(g, 36,-8,0,10); wheel(g, 36,-14,0,3);
    var tick = function(){ props[1].rotation.x = props[0].rotation.x; };
    return {propeller:props[0], tick:tick, pilot:pilot(g, 16,8,0,.55), tail:-94};
  };

  // Interceptor: twin-engine, twin-tail jet with afterburners
  K.interceptor = function(g, P){
    cyl(g, 3,9,100,12, P.m(), 8,0,0,'x');
    var fls = [];
    [8,-8].forEach(function(z){
      cyl(g, 7,7.5,60,10, mat(STEEL), -34,-1,z,'x');
      cyl(g, 7.2,7.2,8,10, mat(DARK), -62,-1,z,'x');
      fls.push(cyl(g, 6,0,34,10, glow(0xffa030), -82,-1,z,'x'));
      var f = fin(g, 34,26,10,16,3, P.m(), -48,5,z*1.5); f.rotation.x = z > 0 ? -.2 : .2;
      box(g, 22,9,5, mat(DARK), 14,-3,z*1.5);
    });
    wing(g, 56,16,108,30,3.5, P.m(), -8,-2,0);
    wing(g, 22,10,52,14,2.5, P.m(), -52,-1,0);
    sph(g, 20,7,6, glass(), 22,7,0);
    strut(g, 22,-10,8,10); wheel(g, 22,-16,8,4); strut(g, 22,-10,-8,10); wheel(g, 22,-16,-8,4);
    var tick = function(){ var s = .8 + Math.random()*.5; fls.forEach(function(f){ f.scale.set(s,1,1); }); };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 18,8,0,.5), tail:-76};
  };

  // Autogyro: pod, mast, free-spinning rotor, nose propeller
  K.gyro = function(g, P){
    sph(g, 26,13,12, P.m(), 0,0,0,12);
    sph(g, 15,8,9, glass(), 12,5,0,10);
    cyl(g, 3.5,2,60,8, P.m(), -44,3,0,'x');
    fin(g, 22,16,6,8,2, P.m(), -68,3,0);
    wing(g, 12,6,34,0,2, P.m(), -64,5,0);
    box(g, 3,34,3, mat(STEEL), -2,22,0);
    var rotor = new THREE.Object3D(); rotor.position.set(-2,40,0);
    var r1 = new THREE.Mesh(new THREE.BoxGeometry(124,1.5,7), mat(DARK)); r1.castShadow = true; rotor.add(r1); g.add(rotor);
    strut(g, 12,-9,10,10); wheel(g, 12,-15,10,5,4); strut(g, 12,-9,-10,10); wheel(g, 12,-15,-10,5,4); wheel(g, -40,-6,0,3);
    var tick = function(){ rotor.rotation.y += .6; };
    return {propeller:propeller(g, 30, 46), tick:tick, pilot:pilot(g, 4,6,0,.65), tail:-74};
  };

  // Paper plane: folded sheet (paint wraps the sheet)
  K.paper = function(g, P){
    var geo = new THREE.Geometry();
    var V = [[62,-2,0],[-52,10,-62],[-52,10,62],[-52,2,0],[-52,-16,0]];
    V.forEach(function(v){ geo.vertices.push(new THREE.Vector3(v[0],v[1],v[2])); });
    function uvf(a){ return new THREE.Vector2(V[a][0]/124+.5, V[a][2]/130+.5); }
    function uvk(a){ return new THREE.Vector2(V[a][0]/124+.5, V[a][1]/40+.5); }
    [[0,1,3,uvf],[0,3,2,uvf],[0,3,4,uvk]].forEach(function(f){
      geo.faces.push(new THREE.Face3(f[0],f[1],f[2])); geo.faceVertexUvs[0].push([f[3](f[0]), f[3](f[1]), f[3](f[2])]);
    });
    geo.computeFaceNormals();
    add(g, P.m({side:THREE.DoubleSide}), geo);
    box(g, 70,.8,1.2, mat(0xb8b4aa), -6,1.4,0);
    var pl = pilot(g, 0,10,0,.5);
    return {propeller:new THREE.Object3D(), pilot:pl, tail:-52};
  };

  // Sky Balloon: hot-air balloon (the paint wraps the envelope)
  K.balloon = function(g, P){
    sph(g, 34,40,34, P.m(), 0,34,0,16);
    cyl(g, 14,6,16,12, P.m(), 0,-6,0);
    box(g, 18,13,18, mat(0x7a5230), 0,-30,0); box(g, 19,2,19, mat(0x59332e), 0,-23,0);
    [[8,8],[8,-8],[-8,8],[-8,-8]].forEach(function(s){ var r = box(g, .9,24,.9, mat(DARK), s[0]*.7,-12,s[1]*.7); r.rotation.z = s[0] > 0 ? -.2 : .2; r.rotation.x = s[1] > 0 ? .2 : -.2; });
    var fl = cyl(g, 3,0,12,8, glow(0xffa030), 0,-12,0);
    var tick = function(){ var s = .7 + Math.random()*.6; fl.scale.set(1,s,1); };
    return {propeller:new THREE.Object3D(), tick:tick, pilot:pilot(g, 0,-22,0,.6), tail:-40};
  };

  function build(kind, spec, base){
    var P = new Paint(spec, base || '#f25346');
    var mesh = new THREE.Object3D(); mesh.name = 'airPlane';
    var r = (K[kind] || K.prop)(mesh, P) || {};
    return {mesh:mesh, propeller:r.propeller || new THREE.Object3D(), pilot:r.pilot, tick:r.tick, tail:r.tail || -44, kind:kind};
  }
  return {build:build, kinds:K};
})();
