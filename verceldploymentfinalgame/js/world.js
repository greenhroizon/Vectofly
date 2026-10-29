// VectoFly - flat, endless, Chrome-dino style world: scrolling textured ground, themed scenery, clouds.
var World = (function(){
  var T = 300;                                   // ground texture tile size (world units)
  var W = 3400, D = 1800, GROUND_Z = -650;
  var NX = (typeof isMobile !== 'undefined' && isMobile) ? 100 : 170, NZ = (typeof isMobile !== 'undefined' && isMobile) ? 30 : 46;
  var HALF = 1700;                               // props wrap when they leave [-HALF, HALF]
  var mesh, mat, geo, pos, bx, by, off = 0, phase = 0, amp = 3, wavy = true, tex = null, texCache = {};
  var propLayer, props = [], clouds = [], cloudLayer, cur = null, scene_;

  var GROUND = {
    water:{amp:3.6, wavy:1, shin:70, spec:0x666666},
    sand:{amp:4.5, shin:8, spec:0x222222}, snow:{amp:3, shin:25, spec:0x555555}, grass:{amp:3.4, shin:6, spec:0x111111},
    rock:{amp:2, shin:10, spec:0x222222}, lava:{amp:3, wavy:1, shin:40, spec:0x884422}, grid:{amp:0, shin:80, spec:0x6666ff},
    candy:{amp:3, shin:60, spec:0x888888}, dust:{amp:3, shin:4, spec:0x111111}
  };

  // ---------- seamless 256px ground textures (light base; tinted by the map colour) ----------
  function rnd(seed){ var s = seed; return function(){ s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; }; }
  function makeTex(kind){
    if (texCache[kind]) return texCache[kind];
    var S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; var c = cv.getContext('2d'), R = rnd(kind.length*977 + kind.charCodeAt(0));
    function wrap(fn){ for (var ox=-S; ox<=S; ox+=S) for (var oy=-S; oy<=S; oy+=S){ c.save(); c.translate(ox,oy); fn(); c.restore(); } }
    var base = {water:236, sand:240, snow:250, grass:226, rock:214, lava:70, grid:30, candy:245, dust:228}[kind] || 230;
    c.fillStyle = 'rgb('+base+','+base+','+base+')'; c.fillRect(0,0,S,S);
    var i, x, y, v;
    if (kind === 'water'){
      for (i=0;i<90;i++){ x = R()*S; y = R()*S; var w = 14+R()*34; wrap(function(){ c.fillStyle = 'rgba(255,255,255,'+(.2+R()*.3)+')'; c.fillRect(x,y,w,2); }); }
      for (i=0;i<70;i++){ x = R()*S; y = R()*S; wrap(function(){ c.fillStyle = 'rgba(40,80,110,.12)'; c.fillRect(x,y,10+R()*26,2); }); }
    } else if (kind === 'sand' || kind === 'dust'){
      for (i=0;i<420;i++){ x = R()*S; y = R()*S; v = R(); wrap(function(){ c.fillStyle = v<.5 ? 'rgba(120,80,40,.16)' : 'rgba(255,255,255,.28)'; c.fillRect(x,y,2,2); }); }
      for (i=0;i<14;i++){ y = R()*S; c.strokeStyle = 'rgba(110,70,30,.11)'; c.lineWidth = 3; c.beginPath(); for (x=0;x<=S;x+=8) c.lineTo(x, y+Math.sin(x/S*Math.PI*4+i)*5); c.stroke(); }
      if (kind === 'dust') for (i=0;i<9;i++){ x = R()*S; y = R()*S; var r = 8+R()*20; wrap(function(){ c.fillStyle = 'rgba(60,40,30,.2)'; c.beginPath(); c.arc(x,y,r,0,7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(x,y,r,.8,3.4); c.stroke(); }); }
    } else if (kind === 'snow'){
      for (i=0;i<70;i++){ x = R()*S; y = R()*S; var r2 = 8+R()*26; wrap(function(){ c.fillStyle = 'rgba(150,185,225,.16)'; c.beginPath(); c.arc(x,y,r2,0,7); c.fill(); }); }
      for (i=0;i<200;i++){ x = R()*S; y = R()*S; wrap(function(){ c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x,y,2,2); }); }
    } else if (kind === 'grass'){
      for (i=0;i<80;i++){ x = R()*S; y = R()*S; var r3 = 10+R()*24; v = R(); wrap(function(){ c.fillStyle = v<.5 ? 'rgba(20,60,20,.13)' : 'rgba(255,255,200,.16)'; c.beginPath(); c.arc(x,y,r3,0,7); c.fill(); }); }
      for (i=0;i<520;i++){ x = R()*S; y = R()*S; wrap(function(){ c.fillStyle = 'rgba(20,70,20,.35)'; c.fillRect(x,y,1.5,4+R()*5); }); }
    } else if (kind === 'rock'){
      for (i=0;i<60;i++){ x = R()*S; y = R()*S; var r4 = 8+R()*22; v = R(); wrap(function(){ c.fillStyle = v<.5 ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x,y,r4,0,7); c.fill(); }); }
      for (i=0;i<14;i++){ x = R()*S; y = R()*S; wrap(function(){ c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x,y); c.lineTo(x+R()*40-20,y+R()*40-20); c.lineTo(x+R()*60-30,y+R()*60-30); c.stroke(); }); }
    } else if (kind === 'lava'){
      for (i=0;i<22;i++){ x = R()*S; y = R()*S; wrap(function(){ c.strokeStyle = 'rgba(255,200,80,.95)'; c.lineWidth = 2+R()*3; c.beginPath(); c.moveTo(x,y); c.lineTo(x+R()*60-30,y+R()*60-30); c.lineTo(x+R()*90-45,y+R()*90-45); c.stroke(); }); }
      for (i=0;i<30;i++){ x = R()*S; y = R()*S; wrap(function(){ c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(x,y,3+R()*6,0,7); c.fill(); }); }
    } else if (kind === 'grid'){
      c.strokeStyle = 'rgb(255,255,255)'; c.lineWidth = 4; for (i=0;i<=S;i+=S/4){ c.beginPath(); c.moveTo(i,0); c.lineTo(i,S); c.moveTo(0,i); c.lineTo(S,i); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2; for (i=S/8;i<S;i+=S/4){ c.beginPath(); c.moveTo(i,0); c.lineTo(i,S); c.moveTo(0,i); c.lineTo(S,i); c.stroke(); }
    } else if (kind === 'candy'){
      c.fillStyle = 'rgba(255,170,215,.5)'; for (i=-S;i<S*2;i+=S/4){ c.beginPath(); c.moveTo(i,0); c.lineTo(i+S/8,0); c.lineTo(i+S/8+S,S); c.lineTo(i+S,S); c.fill(); }
      for (i=0;i<80;i++){ x = R()*S; y = R()*S; wrap(function(){ c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x,y,3,3); }); }
    }
    var t = new THREE.Texture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
    return texCache[kind] = t;
  }

  // ---------- merged low-poly props: one or two draw calls each ----------
  function Builder(){ this.a = new THREE.Geometry(); this.b = new THREE.Geometry(); }
  Builder.prototype.part = function(geo, color, x,y,z, rx,ry,rz, sx,sy,sz, isGlow){
    var m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx||0, ry||0, rz||0));
    m.compose(new THREE.Vector3(x||0,y||0,z||0), q, new THREE.Vector3(sx||1, sy||1, sz||1));
    var col = new THREE.Color(color);
    for (var i=0;i<geo.faces.length;i++) geo.faces[i].color = col;
    (isGlow ? this.b : this.a).merge(geo, m);
  };
  var MA = null, MB = null;
  function propMaterials(){
    if (!MA){
      MA = new THREE.MeshPhongMaterial({vertexColors:THREE.FaceColors, shading:THREE.FlatShading, shininess:8, specular:0x111111});
      MB = new THREE.MeshBasicMaterial({vertexColors:THREE.FaceColors, fog:true});
    }
  }
  function finish(B){
    propMaterials();
    var o = new THREE.Object3D();
    var a = new THREE.Mesh(B.a, MA); a.castShadow = true; o.add(a);
    if (B.b.faces.length){ o.add(new THREE.Mesh(B.b, MB)); }
    return o;
  }
  function CY(r1,r2,h,s){ return new THREE.CylinderGeometry(r1,r2,h,s||7); }
  function IC(r,d){ return new THREE.IcosahedronGeometry(r, d||0); }
  function BX(w,h,d){ return new THREE.BoxGeometry(w,h,d); }
  function pick(a, r){ return a[Math.floor(r()*a.length)]; }
  function shade(hex, k){ var c = new THREE.Color(hex); c.r = Math.min(1,c.r*k); c.g = Math.min(1,c.g*k); c.b = Math.min(1,c.b*k); return c; }

  var PROP = {
    palm: function(m, r){
      var B = new Builder(), h = 38 + r()*14, lean = (r()-.5)*.3;
      B.part(CY(16,19,3,10), m.sand||'#e8d49a', 0,1.5,0);
      for (var i=0;i<4;i++) B.part(CY(2.2-i*.2, 2.6-i*.2, h/4+1, 6), '#8a6a3f', Math.sin(lean)*(i*h/4), 3+i*h/4+h/8, 0, 0,0,-lean*(1) );
      var top = Math.sin(lean)*h;
      for (var k=0;k<7;k++){ var a = k/7*Math.PI*2; B.part(BX(26,1.5,7), pick([m.leaf||'#2f9e5a', shade(m.leaf||'#2f9e5a',1.2)], r), top+Math.cos(a)*10, h+3-Math.abs(Math.sin(a))*0, Math.sin(a)*10, 0,-a,-.5, 1,1,1); }
      B.part(IC(3,0), '#6b4a22', top, h+1, 0);
      return finish(B);
    },
    pine: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, snow = m.snowy;
      B.part(CY(2.6*s,3.4*s,14*s,6), '#5a3d25', 0,7*s,0);
      for (var i=0;i<4;i++){ var rr = (17-i*3.6)*s; B.part(CY(.4,rr,16*s,7), shade(m.leaf||'#2e7d4f', 1+i*.06), 0,(14+i*10)*s,0); if (snow) B.part(CY(.4,rr*.8,8*s,7), '#f4fbff', 0,(18+i*10)*s,0); }
      return finish(B);
    },
    tree: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, lc = m.leaf || '#5cb85c';
      B.part(CY(3,4.4,22*s,6), '#5a3d25', 0,11*s,0);
      B.part(IC(15*s,1), lc, 0,30*s,0, 0,0,0, 1,.9,1);
      B.part(IC(10*s,1), shade(lc,1.18), 9*s,24*s,3*s);
      B.part(IC(9*s,1), shade(lc,.85), -9*s,25*s,-3*s);
      return finish(B);
    },
    acacia: function(m, r){
      var B = new Builder(), s = .8 + r()*.6;
      B.part(CY(2,3.4,26*s,6), '#6b4a22', 0,13*s,0, 0,0,(r()-.5)*.3);
      B.part(CY(26*s,22*s,5*s,9), m.leaf||'#7a9a3a', 0,29*s,0);
      B.part(CY(18*s,20*s,3*s,9), shade(m.leaf||'#7a9a3a',1.15), 4*s,33*s,0);
      return finish(B);
    },
    cactus: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, c = m.cactus || '#4f9a58';
      B.part(CY(4*s,4.6*s,34*s,7), c, 0,17*s,0);
      B.part(IC(4*s,0), c, 0,34*s,0);
      B.part(CY(2.6*s,2.8*s,12*s,6), c, 8*s,19*s,0, 0,0,0);
      B.part(CY(2.6*s,2.8*s,12*s,6), c, 8*s,26*s,0);
      B.part(CY(2.4*s,2.6*s,10*s,6), c, -7.5*s,22*s,0);
      B.part(CY(2.4*s,2.6*s,12*s,6), c, -7.5*s,28*s,0);
      return finish(B);
    },
    rock: function(m, r){
      var B = new Builder(), s = .8 + r()*1.3, c = m.rock || '#8d8f94';
      B.part(IC(9*s,0), shade(c, .9+r()*.25), 0,3.5*s,0, r()*3,r()*3,r()*3, 1.3,.75,1);
      if (r() > .4) B.part(IC(5*s,0), shade(c, 1.15), 9*s,2*s,4*s, r()*3,r()*3,0, 1.1,.7,1);
      return finish(B);
    },
    ice: function(m, r){
      var B = new Builder(), s = .8 + r()*1.0;
      for (var i=0;i<3;i++) B.part(CY(.3,(4+r()*4)*s,(20+r()*26)*s,5), i%2 ? '#d9f4ff' : '#b5e5f7', (i-1)*7*s,10*s,(r()-.5)*5);
      return finish(B);
    },
    building: function(m, r){
      var B = new Builder(), w = 18 + r()*22, h = 40 + r()*95, d = 18 + r()*14, bc = m.bld || ['#3a3a5a','#4a4a6a','#2e2e4a'], lit = m.lit || ['#ffd54a','#6affd8','#ff6ad5'];
      B.part(BX(w,h,d), pick(bc, r), 0,h/2,0);
      B.part(BX(w+3,3,d+3), shade(pick(bc, r), 1.3), 0,h+1.5,0);
      var rows = Math.floor(h/12), cols = Math.floor(w/9);
      for (var i=0;i<rows;i++) for (var j=0;j<cols;j++) if (r() > .35){
        var wx = (j-(cols-1)/2)*8;
        B.part(BX(4,5,.6), pick(lit, r), wx, 10+i*11, d/2+.4, 0,0,0, 1,1,1, true);
        B.part(BX(4,5,.6), pick(lit, r), wx, 10+i*11, -d/2-.4, 0,0,0, 1,1,1, true);
      }
      if (m.antenna && r() > .5) B.part(CY(.6,.6,16,4), '#555', 0,h+11,0);
      return finish(B);
    },
    mesa: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, cols = m.mesa || ['#c4623a','#d98050','#b04e2c','#e0a070'], y = 0;
      var rad = 26*s;
      for (var i=0;i<4;i++){ var hh = (12+r()*10)*s; B.part(CY(rad*.82, rad, hh, 8), cols[i%cols.length], 0, y+hh/2, 0); y += hh; rad *= .88; }
      B.part(CY(rad*1.0, rad*.95, 3*s, 8), shade(cols[0], 1.15), 0,y+1.5*s,0);
      return finish(B);
    },
    boat: function(m, r){
      var B = new Builder(), s = .8 + r()*.5;
      B.part(BX(26*s,5*s,10*s), '#f4f0e6', 0,2.5*s,0);
      B.part(BX(8*s,3*s,10*s), '#c1433a', 15*s,2*s,0, 0,0,.5);
      B.part(CY(.7,.7,34*s,4), '#555', 0,20*s,0);
      B.part(BX(1,24*s,16*s), '#ffffff', -3*s,20*s,0, 0,0,.12);
      B.part(BX(1,16*s,10*s), pick(['#ff6a5a','#ffd14a','#ffffff'], r), 5*s,15*s,0, 0,0,-.15);
      return finish(B);
    },
    dome: function(m, r){
      var B = new Builder(), s = .8 + r()*.8;
      B.part(CY(26*s,28*s,4*s,12), '#888c94', 0,2*s,0);
      B.part(new THREE.SphereGeometry(22*s, 10, 7, 0, Math.PI*2, 0, Math.PI/2), '#9fd8e8', 0,4*s,0);
      B.part(BX(10*s,12*s,10*s), '#c9ccd2', 30*s,6*s,0);
      return finish(B);
    },
    cane: function(m, r){
      var B = new Builder(), s = .8 + r()*.7;
      B.part(CY(2.4*s,2.4*s,40*s,6), '#ffffff', 0,20*s,0);
      B.part(CY(14*s,14*s,4*s,12), pick(['#ff5fa8','#7ad7ff','#ffd24a','#b07cff'], r), 0,44*s,0, Math.PI/2,0,0);
      B.part(CY(9*s,9*s,4.5*s,12), '#ffffff', 0,44*s,0, Math.PI/2,0,0);
      return finish(B);
    },
    crystal: function(m, r){
      var B = new Builder(), s = .7 + r()*1.1, cc = m.crystal || ['#7ad7ff','#b07cff','#ff7ad5'];
      for (var i=0;i<3;i++){ var c = pick(cc, r), h = (14+r()*26)*s; B.part(CY(0.4,(4+r()*3)*s,h,5), c, (i-1)*7*s,h/2,(r()-.5)*6, 0,0,(r()-.5)*.3, 1,1,1, true); }
      return finish(B);
    },
    bush: function(m, r){
      var B = new Builder(), s = .7 + r()*.8, lc = m.leaf || '#4f9a58';
      B.part(IC(8*s,0), lc, 0,5*s,0, r()*3,r()*3,0, 1.2,.8,1); B.part(IC(5*s,0), shade(lc,1.2), 8*s,3*s,2*s, 0,r()*3,0);
      return finish(B);
    },
    tuft: function(m, r){
      var B = new Builder(), s = .6 + r()*.7, c = m.tuft || m.leaf || '#6aa84f';
      for (var i=0;i<5;i++) B.part(CY(.2,1.6,(7+r()*8)*s,4), shade(c, .9+r()*.3), (i-2)*2.2, 4*s, (r()-.5)*3, 0,0,(i-2)*.12);
      return finish(B);
    },
    buoy: function(m, r){
      var B = new Builder();
      B.part(CY(4,5.5,8,8), '#e8453c', 0,4,0); B.part(CY(5.5,5.5,3,8), '#ffffff', 0,6,0); B.part(CY(.8,.8,12,4), '#444', 0,14,0); B.part(IC(1.8,0), '#ffd14a', 0,20,0, 0,0,0, 1,1,1, true);
      return finish(B);
    },
    // ---- more scenery ----
    house: function(m, r){
      var B = new Builder(), s = .8 + r()*.6, w = 22*s, d = 18*s, h = 14*s, roof = pick(m.roofs || ['#c1433a','#2f6fd0','#d98a2a'], r);
      B.part(BX(w,h,d), m.wall || '#f4f0e6', 0,h/2,0);
      B.part(CY(0,w*.78,11*s,4), roof, 0,h+5.5*s,0, 0,Math.PI/4,0);
      B.part(BX(4*s,7*s,.6), '#59332e', 0,3.5*s,d/2+.3);
      B.part(BX(4*s,4*s,.6), '#9fd8e8', w*.28,h*.6,d/2+.3);
      return finish(B);
    },
    windmill: function(m, r){
      var B = new Builder(), s = .9 + r()*.4, a = r()*3;
      B.part(CY(6*s,10*s,34*s,8), m.wall || '#f4f0e6', 0,17*s,0);
      B.part(CY(0,8*s,9*s,8), '#8a4a2a', 0,38*s,0);
      B.part(BX(4*s,32*s,1.2), '#c9b48a', 0,31*s,9*s, 0,0,a); B.part(BX(4*s,32*s,1.2), '#c9b48a', 0,31*s,9*s, 0,0,a+Math.PI/2);
      B.part(IC(2.2*s,0), '#59332e', 0,31*s,9.5*s);
      B.part(BX(4*s,7*s,.6), '#59332e', 0,3.5*s,9.6*s);
      return finish(B);
    },
    pyramid: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, c = m.stone || '#e0c27a';
      B.part(CY(0,52*s,54*s,4), c, 0,27*s,0, 0,Math.PI/4,0);
      B.part(CY(0,30*s,30*s,4), shade(c,.9), 62*s,15*s,12*s, 0,Math.PI/4,0);
      return finish(B);
    },
    castle: function(m, r){
      var B = new Builder(), s = .9 + r()*.4, c = m.stone || '#b9b2a6', rc = m.roofs ? m.roofs[0] : '#b0382e';
      B.part(BX(42*s,24*s,24*s), c, 0,12*s,0);
      B.part(BX(42*s,4*s,26*s), shade(c,1.1), 0,25*s,0);
      [[-21,-12],[21,-12],[-21,12],[21,12]].forEach(function(p){ B.part(CY(6*s,6.4*s,40*s,8), shade(c,1.05), p[0]*s,20*s,p[1]*s); B.part(CY(0,8.5*s,12*s,8), rc, p[0]*s,46*s,p[1]*s); });
      B.part(BX(10*s,13*s,.8), '#3a2a22', 0,6.5*s,12.4*s);
      B.part(BX(14*s,18*s,14*s), c, 0,33*s,0); B.part(CY(0,11*s,12*s,4), rc, 0,48*s,0, 0,Math.PI/4,0);
      return finish(B);
    },
    pumpkin: function(m, r){
      var B = new Builder(), s = .8 + r()*.8;
      B.part(IC(8*s,1), pick(['#ff7a1a','#f2650a','#ff8a2a'], r), 0,6*s,0, 0,0,0, 1.15,.85,1.15);
      B.part(CY(1.2,1.8,4*s,5), '#4a6a2a', 0,12.5*s,0);
      B.part(BX(2*s,2*s,.6), '#ffe14a', -2.5*s,7*s,8.6*s, 0,0,0, 1,1,1, true); B.part(BX(2*s,2*s,.6), '#ffe14a', 2.5*s,7*s,8.6*s, 0,0,0, 1,1,1, true);
      return finish(B);
    },
    deadtree: function(m, r){
      var B = new Builder(), s = .8 + r()*.7, c = '#3a2a22', lean = (r()-.5)*.25;
      B.part(CY(1.4*s,3.6*s,36*s,5), c, 0,18*s,0, 0,0,lean);
      for (var i=0;i<4;i++){ var side = i%2 ? 1 : -1; B.part(CY(.4,1.6*s,(14+r()*8)*s,4), c, side*6*s,(20+i*5)*s,(r()-.5)*4, 0,0,-side*(.8+r()*.3)); }
      return finish(B);
    },
    bamboo: function(m, r){
      var B = new Builder(), s = .8 + r()*.5;
      for (var i=0;i<6;i++){ var x = (i-2.5)*3.2 + (r()-.5)*2, h = (46+r()*30)*s, z = (r()-.5)*6, c = pick(['#7ab648','#8cc85a','#6aa63c'], r);
        B.part(CY(1.1,1.3,h,6), c, x,h/2,z);
        for (var k=1;k<4;k++) B.part(CY(1.5,1.5,.7,6), '#4f7a2a', x,h*k/4,z);
        B.part(BX(9,.5,2.2), '#5fa83a', x+4,h*.82,z, 0,0,.35); B.part(BX(9,.5,2.2), '#5fa83a', x-4,h*.7,z, 0,0,-.35); }
      return finish(B);
    },
    lighthouse: function(m, r){
      var B = new Builder(), s = .9 + r()*.4;
      for (var i=0;i<4;i++) B.part(CY((6.5-i*.9)*s,(7.4-i*.9)*s,11.5*s,10), i%2 ? '#d6483b' : '#f6f2e8', 0,(5.75+i*11.5)*s,0);
      B.part(CY(5*s,4.2*s,3*s,10), '#333', 0,47*s,0);
      B.part(CY(2.8*s,2.8*s,6*s,8), '#ffe9a0', 0,51*s,0, 0,0,0, 1,1,1, true);
      B.part(CY(0,5.5*s,5*s,10), '#d6483b', 0,56*s,0);
      B.part(BX(6*s,9*s,.6), '#59332e', 0,4.5*s,6.8*s);
      return finish(B);
    },
    tulip: function(m, r){
      var B = new Builder(), cols = m.flowers || ['#ff4a6a','#ffd23a','#ff8a2a','#b04aff'], col = pick(cols, r);
      for (var i=0;i<12;i++){ var x = (r()-.5)*26, z = (r()-.5)*16;
        B.part(CY(.25,.3,7,4), '#3f8a3a', x,3.5,z); B.part(IC(1.9,0), col, x,8,z, 0,0,0, 1,1.3,1); }
      return finish(B);
    },
    torii: function(m, r){
      var B = new Builder(), s = .9 + r()*.4;
      [-12,12].forEach(function(x){ B.part(CY(2.3*s,2.8*s,34*s,8), '#d6283b', x*s,17*s,0); });
      B.part(BX(40*s,3.6*s,4.4*s), '#d6283b', 0,33*s,0); B.part(BX(32*s,2.6*s,3.4*s), '#2a2a30', 0,26*s,0);
      return finish(B);
    },
    // ---- far backdrop ----
    mountain: function(m, r){
      var B = new Builder(), s = .8 + r()*.9, c = m.far || '#7f8fb0';
      B.part(CY(2,95*s,(60+r()*60)*s,6+Math.floor(r()*3)), shade(c, .9+r()*.2), 0,(30+r()*30)*s,0);
      if (m.snow) B.part(CY(1,26*s,24*s,7), '#f6fbff', 0,(55+r()*30)*s,0);
      var o = finish(B); o.scale.set(1.7, 1, 1); return o;
    },
    volcano: function(m, r){
      var B = new Builder(), s = 1 + r()*.7;
      B.part(CY(16*s,110*s,95*s,8), '#3a2420', 0,48*s,0);
      B.part(CY(18*s,18*s,3*s,8), '#ff5a1f', 0,96*s,0, 0,0,0, 1,1,1, true);
      B.part(CY(6,16*s,36*s,6), '#ff8a2a', 0,112*s,0, 0,0,0, 1,1,1, true);
      return finish(B);
    },
    skyline: function(m, r){
      var B = new Builder(), n = 5 + Math.floor(r()*4), x = 0;
      for (var i=0;i<n;i++){ var w = 26+r()*30, h = 50+r()*90; B.part(BX(w,h,30), shade(m.far || '#4a4a7a', .85+r()*.3), x,h/2,0); x += w*.9; }
      var o = finish(B); o.scale.set(1.6,1.2,1); return o;
    },
    dune: function(m, r){
      var B = new Builder(), s = 1 + r()*.8;
      B.part(IC(70*s,1), m.far || '#d9a05b', 0,-14*s,0, 0,0,0, 2.4,.45,1);
      return finish(B);
    }
  };

  function clearProps(){
    if (propLayer){ scene_.remove(propLayer); propLayer.traverse(function(o){ if (o.geometry) o.geometry.dispose(); }); }
    propLayer = new THREE.Object3D(); scene_.add(propLayer); props = [];
  }
  function build(m){
    clearProps();
    var mob = (typeof isMobile !== 'undefined' && isMobile), R = rnd(m.id.length*7919 + m.id.charCodeAt(0)*13), tm = m.t || ['rock'];
    function band(list, n, zMin, zMax, sMin, sMax){
      for (var i=0;i<n;i++){
        var type = list[i % list.length], o = PROP[type](m, R);
        var s = sMin + R()*(sMax-sMin); o.scale.multiplyScalar(s);
        o.rotation.y = R()*6.28;
        var p = {o:o, x:-HALF + (i+R())*(2*HALF/n), z:zMin + R()*(zMax-zMin), type:type, zMin:zMin, zMax:zMax, sMin:sMin, sMax:sMax};
        o.position.set(p.x, groundAt(p.x,p.z), p.z); propLayer.add(o); props.push(p);
      }
    }
    var mix = []; tm.forEach(function(t){ mix.push(t); mix.push(t); }); mix = mix.concat(tm);
    band(mix, mob ? 18 : 30, -420, -110, .8, 1.2);                    // mid ground, behind the flight lane
    band(m.fr || ['rock','tuft'], mob ? 8 : 14, 55, 120, .35, .6);      // tiny details in front, give the feeling of speed
    if (m.farT && m.farT !== 'none') band([m.farT], mob ? 7 : 10, -820, -640, 1, 1.4);
    // clouds
    if (cloudLayer) scene_.remove(cloudLayer);
    cloudLayer = new THREE.Object3D(); scene_.add(cloudLayer); clouds = [];
    var cm = new THREE.MeshPhongMaterial({color:m.cloud || 0xffffff, shading:THREE.FlatShading, shininess:0, emissive:0x1b1b28});
    for (var i=0;i<(mob?16:24);i++){
      var G = new THREE.Geometry(), n = 4 + Math.floor(R()*3);
      for (var k=0;k<n;k++){ var ic = new THREE.IcosahedronGeometry(8 + R()*10, 1), mm = new THREE.Matrix4().makeTranslation(k*14 - n*7 + R()*6, R()*8, R()*10); G.merge(ic, mm); }
      var c = new THREE.Mesh(G, cm); c.castShadow = false;
      var s = .8 + R()*1.3; c.scale.set(s*1.4, s*.75, s);
      c.position.set(-HALF + (i+R())*(2*HALF/(mob?16:24)), 250 + R()*240, -320 - R()*600);
      cloudLayer.add(c); clouds.push(c);
    }
  }
  function groundAt(x,z){ return heightAt(x, z, phase); }
  function heightAt(x, z, ph){
    var a = amp * (0.3 + 0.7*Math.min(1, Math.max(0, (-z-30))/280));      // very flat right where you fly
    var xs = x + off;
    return a*(Math.sin(xs*.012 + z*.018 + ph)*.55 + Math.sin(xs*.031 - z*.027 + ph*1.7)*.3 + Math.sin(xs*.07 + z*.05 + ph*2.3)*.15);
  }

  var api = {
    init: function(scene){
      scene_ = scene;
      geo = new THREE.PlaneBufferGeometry(W, D, NX, NZ);
      pos = geo.attributes.position.array;
      var n = pos.length/3; bx = new Float32Array(n); by = new Float32Array(n);
      for (var i=0;i<n;i++){ bx[i] = pos[i*3]; by[i] = pos[i*3+1]; }
      mat = new THREE.MeshPhongMaterial({color:0x68c3c0, shading:THREE.FlatShading, shininess:60, specular:0x444444});
      mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = -Math.PI/2; mesh.position.set(0, 0, GROUND_Z); mesh.receiveShadow = true;
      scene.add(mesh);
      api.update(0, 0);
    },
    setMap: function(m){
      cur = m; var g = GROUND[m.g || 'water'] || GROUND.water;
      amp = g.amp; wavy = !!g.wavy;
      tex = makeTex(m.g || 'water'); tex.repeat.set(W/T, D/T); mat.map = tex;
      mat.color.set(m.sea); mat.color.multiplyScalar(.82); mat.shininess = g.shin; mat.specular.setHex(g.spec);
      mat.emissive.setHex(m.g === 'lava' ? 0x4a1200 : m.g === 'grid' ? 0x050a30 : 0x000000);
      mat.needsUpdate = true;
      if (scene_.fog){ scene_.fog.near = m.fogN || 220; scene_.fog.far = m.fogF || 1150; }
      build(m);
      api.update(0, 0);
    },
    update: function(dx, dt){
      off += dx; if (wavy) phase += dt*.0016;
      var n = pos.length/3, i, x, z;
      for (i=0;i<n;i++){
        x = bx[i]; z = GROUND_Z - by[i];
        pos[i*3+2] = heightAt(x, z, phase);
      }
      geo.attributes.position.needsUpdate = true;
      if (tex){ tex.offset.x = (off/T) % 1; }
      var p, j;
      for (j=0;j<props.length;j++){
        p = props[j]; p.x -= dx;
        if (p.x < -HALF){ p.x += 2*HALF; p.z = p.zMin + Math.random()*(p.zMax-p.zMin); p.o.rotation.y = Math.random()*6.28; }
        p.o.position.set(p.x, heightAt(p.x, p.z, phase) - 1, p.z);
      }
      for (j=0;j<clouds.length;j++){
        p = clouds[j]; p.position.x -= dx*.14; if (p.position.x < -HALF) p.position.x += 2*HALF;
      }
    },
    groundAt: function(x,z){ return heightAt(x, z, phase); },
    skyShade: function(k){ if (mat) { /* reserved */ } }
  };
  return api;
})();
