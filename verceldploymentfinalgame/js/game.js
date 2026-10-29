// VectoFly core: scene, flat endless Chrome-dino-style world, obstacles, blue pills, fuel, DAMAGE, main loop.
// Based on "The Aviator" by Karim Maaloul (Codrops). isMobile + Colors live in config.js.

// GAME VARIABLES
var game;
var deltaTime = 0;
var newTime = new Date().getTime();
var oldTime = new Date().getTime();
var ennemiesPool = [];
var particlesPool = [];

// world scrolling: how many world units the ground / obstacles move per (speed * millisecond)
var K_SCROLL = 420;
var SPAWN_X = 470, DESPAWN_X = -340;
var dxFrame = 0;                                  // world units scrolled this frame

function resetGame(){
  game = {speed:0,
          initSpeed:.00044,
          baseSpeed:.00044,
          targetBaseSpeed:.00044,
          incrementSpeedByTime:.0000025,
          incrementSpeedByLevel:.000005,
          distanceForSpeedUpdate:100,
          speedLastUpdate:0,

          distance:0,
          ratioSpeedDistance:50,
          damage:0,                              // 0 = pristine, 100 = the plane is destroyed

          level:1,
          levelLastUpdate:0,
          distanceForLevelUpdate:1000,

          planeDefaultHeight:100,
          planeAmpHeight:80,
          planeAmpWidth:75,
          planeMoveSensivity:0.005,
          planeRotXSensivity:0.0008,
          planeRotZSensivity:0.0004,
          planeFallSpeed:.001,
          planeMinSpeed:1.2,
          planeMaxSpeed:1.6,
          planeSpeed:0,
          planeCollisionDisplacementX:0,
          planeCollisionSpeedX:0,

          planeCollisionDisplacementY:0,
          planeCollisionSpeedY:0,

          cameraFarPos:500,
          cameraNearPos:150,
          cameraSensivity:0.002,

          coinDistanceTolerance:15,
          coinValue:2,                           // damage repaired by one blue pill
          coinsSpeed:1,
          coinLastSpawn:0,
          distanceForCoinsSpawn:85,

          ennemyDistanceTolerance:11,
          ennemyValue:20,                        // damage taken from one red spike
          ennemiesSpeed:1,
          ennemyLastSpawn:0,
          distanceForEnnemiesSpawn:48, spawnStart:48, spawnMin:30, spawnStep:2.5, waveBase:2,
          safeLane:2, reason:"",
          fuel:100, fuelBase:.075, fuelPerLevel:.004, fuelEff:1, fuelValue:40, fuelLastSpawn:0, distanceForFuelSpawn:450,
          maxBaseSpeed:.0011,
          speedPerMeter:.00000012,
          crashT:0,

          status : "playing"
         };
  fieldLevel.innerHTML = Math.floor(game.level);
}

//THREEJS RELATED VARIABLES

var scene,
    camera, fieldOfView, aspectRatio, nearPlane, farPlane,
    renderer,
    container,
    controls;

//SCREEN & MOUSE VARIABLES

var HEIGHT, WIDTH,
    mousePos = { x: 0, y: 0 };

//INIT THREE JS, SCREEN AND MOUSE EVENTS

function createScene() {

  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;

  scene = new THREE.Scene();
  aspectRatio = WIDTH / HEIGHT;
  fieldOfView = 50;
  nearPlane = .1;
  farPlane = 10000;
  camera = new THREE.PerspectiveCamera(
    fieldOfView,
    aspectRatio,
    nearPlane,
    farPlane
    );
  scene.fog = new THREE.Fog(0xf7d9aa, 220, 1150);
  camera.position.x = 0;
  camera.position.z = 200;
  camera.position.y = game.planeDefaultHeight;

  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile }); }
  catch(e){ document.body.innerHTML='<p style="padding:24px;font-family:sans-serif">Sorry, WebGL is not supported on this device or browser.</p>'; throw e; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, isMobile?1.5:2));
  renderer.setSize(WIDTH, HEIGHT);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // soft shadow edges

  container = document.getElementById('world');
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', handleWindowResize, false);
  window.addEventListener('orientationchange', function(){ setTimeout(handleWindowResize,300); }, false);
}

// MOUSE AND SCREEN EVENTS

function handleWindowResize() {
  HEIGHT = window.innerHeight;
  WIDTH = window.innerWidth;
  renderer.setSize(WIDTH, HEIGHT);
  aspectRatio = camera.aspect = WIDTH / HEIGHT;
  camera.updateProjectionMatrix();
}

function onPad(t){ return !!(t && t.closest && t.closest('#ctl')); }

function handleMouseMove(event) {
  if (onPad(event.target) || (window.VF && VF.padHeld && VF.padHeld())) return;   // steering with the buttons: ignore the pointer
  var tx = -1 + (event.clientX / WIDTH)*2;
  var ty = 1 - (event.clientY / HEIGHT)*2;
  mousePos = {x:tx, y:ty};
}

function handleTouchMove(event) {
    if (game.status!="playing") return;
    event.preventDefault();
    var t = null;
    for (var i=0;i<event.touches.length;i++){ if (!onPad(event.touches[i].target)){ t = event.touches[i]; break; } }
    if (!t || (window.VF && VF.padHeld && VF.padHeld())) return;   // only fingers on the buttons: leave steering to them
    var tx = -1 + (t.pageX / WIDTH)*2;
    var ty = 1 - (t.pageY / HEIGHT)*2;
    mousePos = {x:tx, y:ty};
}

function handleMouseUp(event){}


function handleTouchEnd(event){}

// LIGHTS

var ambientLight, hemisphereLight, shadowLight, rimLight;

function createLights() {

  hemisphereLight = new THREE.HemisphereLight(0xaaaaaa,0x000000, .9)

  ambientLight = new THREE.AmbientLight(0xdc8874, .5);

  shadowLight = new THREE.DirectionalLight(0xffffff, .9);
  shadowLight.position.set(90, 380, 170);
  shadowLight.castShadow = true;
  shadowLight.shadow.camera.left = -460;
  shadowLight.shadow.camera.right = 460;
  shadowLight.shadow.camera.top = 460;
  shadowLight.shadow.camera.bottom = -460;
  shadowLight.shadow.camera.near = 1;
  shadowLight.shadow.camera.far = 1100;
  shadowLight.shadow.bias = -0.0006;
  shadowLight.shadow.mapSize.width = isMobile?1024:2048;
  shadowLight.shadow.mapSize.height = isMobile?1024:2048;

  // a weak cool light from behind/below the camera lifts the shaded side of the plane (looks less flat)
  rimLight = new THREE.DirectionalLight(0xbfd8ff, .22);
  rimLight.position.set(-200, 60, 260);

  scene.add(hemisphereLight);
  scene.add(shadowLight);
  scene.add(rimLight);
  scene.add(ambientLight);

}


var Pilot = function(){
  this.mesh = new THREE.Object3D();
  this.mesh.name = "pilot";
  this.angleHairs=0;

  var bodyGeom = new THREE.BoxGeometry(15,15,15);
  var bodyMat = new THREE.MeshPhongMaterial({color:Colors.brown, shading:THREE.FlatShading});
  var body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.set(2,-12,0);

  this.mesh.add(body);

  var faceGeom = new THREE.BoxGeometry(10,10,10);
  var faceMat = new THREE.MeshLambertMaterial({color:Colors.pink});
  var face = new THREE.Mesh(faceGeom, faceMat);
  this.mesh.add(face);

  var hairGeom = new THREE.BoxGeometry(4,4,4);
  var hairMat = new THREE.MeshLambertMaterial({color:Colors.brown});
  var hair = new THREE.Mesh(hairGeom, hairMat);
  hair.geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,2,0));
  var hairs = new THREE.Object3D();

  this.hairsTop = new THREE.Object3D();

  for (var i=0; i<12; i++){
    var h = hair.clone();
    var col = i%3;
    var row = Math.floor(i/3);
    var startPosZ = -4;
    var startPosX = -4;
    h.position.set(startPosX + row*4, 0, startPosZ + col*4);
    h.geometry.applyMatrix(new THREE.Matrix4().makeScale(1,1,1));
    this.hairsTop.add(h);
  }
  hairs.add(this.hairsTop);

  var hairSideGeom = new THREE.BoxGeometry(12,4,2);
  hairSideGeom.applyMatrix(new THREE.Matrix4().makeTranslation(-6,0,0));
  var hairSideR = new THREE.Mesh(hairSideGeom, hairMat);
  var hairSideL = hairSideR.clone();
  hairSideR.position.set(8,-2,6);
  hairSideL.position.set(8,-2,-6);
  hairs.add(hairSideR);
  hairs.add(hairSideL);

  var hairBackGeom = new THREE.BoxGeometry(2,8,10);
  var hairBack = new THREE.Mesh(hairBackGeom, hairMat);
  hairBack.position.set(-1,-4,0)
  hairs.add(hairBack);
  hairs.position.set(-5,5,0);

  this.mesh.add(hairs);

  var glassGeom = new THREE.BoxGeometry(5,5,5);
  var glassMat = new THREE.MeshLambertMaterial({color:Colors.brown});
  var glassR = new THREE.Mesh(glassGeom,glassMat);
  glassR.position.set(6,0,3);
  var glassL = glassR.clone();
  glassL.position.z = -glassR.position.z
  var glassAGeom = new THREE.BoxGeometry(11,1,11);
  var glassA = new THREE.Mesh(glassAGeom, glassMat);
  this.mesh.add(glassR);
  this.mesh.add(glassL);
  this.mesh.add(glassA);

  var earGeom = new THREE.BoxGeometry(2,3,2);
  var earL = new THREE.Mesh(earGeom,faceMat);
  earL.position.set(0,0,-6);
  var earR = earL.clone();
  earR.position.set(0,0,6);
  this.mesh.add(earL);
  this.mesh.add(earR);
}

Pilot.prototype.updateHairs = function(){
   var hairs = this.hairsTop.children;
   var l = hairs.length;
   for (var i=0; i<l; i++){
      var h = hairs[i];
      h.scale.y = .75 + Math.cos(this.angleHairs+i/3)*.25;
   }
  this.angleHairs += game.speed*deltaTime*40;
}

// ---------- OBSTACLES (red spikes), BLUE PILLS, FUEL ----------
// Everything sits at the plane's depth (z = 0) and slides left along the flat world.
function laneY(i){ return game.planeDefaultHeight + (i-2)*34; }

Ennemy = function(){
  var geom = new THREE.TetrahedronGeometry(8,2);
  var mat = new THREE.MeshPhongMaterial({
    color:Colors.red,
    emissive:0x3a0c08,
    shininess:40,
    specular:0xffb0a0,
    shading:THREE.FlatShading
  });
  this.mesh = new THREE.Mesh(geom,mat);
  this.mesh.castShadow = true;
  this.x = 0; this.y = 0;
}

EnnemiesHolder = function (){
  this.mesh = new THREE.Object3D();
  this.ennemiesInUse = [];
}

// Fair waves: 5 height lanes, one lane is always left clear and it moves by at most 2 lanes between waves.
EnnemiesHolder.prototype.spawnEnnemies = function(){
  var s = Math.max(0, Math.min(4, game.safeLane + Math.floor(Math.random()*5) - 2));
  game.safeLane = s;
  var n = Math.min(game.waveBase + Math.floor(game.level/2), 4);
  for (var i=0; i<n; i++){
    var lane; do { lane = Math.floor(Math.random()*5); } while (lane===s);
    var ennemy = ennemiesPool.length ? ennemiesPool.pop() : new Ennemy();
    ennemy.x = SPAWN_X + i*84;
    ennemy.y = laneY(lane);
    ennemy.mesh.position.set(ennemy.x, ennemy.y, 0);
    this.mesh.add(ennemy.mesh);
    this.ennemiesInUse.push(ennemy);
  }
}

EnnemiesHolder.prototype.rotateEnnemies = function(){
  for (var i=0; i<this.ennemiesInUse.length; i++){
    var ennemy = this.ennemiesInUse[i];
    ennemy.x -= dxFrame*game.ennemiesSpeed;
    ennemy.mesh.position.x = ennemy.x;
    ennemy.mesh.rotation.z += Math.random()*.1;
    ennemy.mesh.rotation.y += Math.random()*.1;

    var diffPos = airplane.mesh.position.clone().sub(ennemy.mesh.position);
    var d = diffPos.length();
    if (d<game.ennemyDistanceTolerance && game.status=="playing"){
      particlesHolder.spawnParticles(ennemy.mesh.position.clone(), 15, Colors.red, 3);

      ennemiesPool.unshift(this.ennemiesInUse.splice(i,1)[0]);
      this.mesh.remove(ennemy.mesh);
      game.planeCollisionSpeedX = 100 * diffPos.x / d;
      game.planeCollisionSpeedY = 100 * diffPos.y / d;
      ambientLight.intensity = 2;

      addDamage(); VF.onHit(); hitFlash();
      i--;
    }else if (ennemy.x < DESPAWN_X){
      ennemiesPool.unshift(this.ennemiesInUse.splice(i,1)[0]);
      this.mesh.remove(ennemy.mesh);
      i--;
    }
  }
}

function hitFlash(){
  var f = document.getElementById('flash'); if (!f) return;
  f.className = ''; void f.offsetWidth; f.className = 'hit';
}

Particle = function(){
  var geom = new THREE.TetrahedronGeometry(3,0);
  var mat = new THREE.MeshPhongMaterial({
    color:0x009999,
    shininess:0,
    specular:0xffffff,
    shading:THREE.FlatShading
  });
  this.mesh = new THREE.Mesh(geom,mat);
}

Particle.prototype.explode = function(pos, color, scale){
  var _this = this;
  var _p = this.mesh.parent;
  this.mesh.material.color = new THREE.Color( color);
  this.mesh.material.needsUpdate = true;
  this.mesh.scale.set(scale, scale, scale);
  var targetX = pos.x + (-1 + Math.random()*2)*50;
  var targetY = pos.y + (-1 + Math.random()*2)*50;
  var speed = .6+Math.random()*.2;
  TweenMax.to(this.mesh.rotation, speed, {x:Math.random()*12, y:Math.random()*12});
  TweenMax.to(this.mesh.scale, speed, {x:.1, y:.1, z:.1});
  TweenMax.to(this.mesh.position, speed, {x:targetX, y:targetY, delay:Math.random() *.1, ease:Power2.easeOut, onComplete:function(){
      if(_p) _p.remove(_this.mesh);
      _this.mesh.scale.set(1,1,1);
      particlesPool.unshift(_this);
    }});
}

ParticlesHolder = function (){
  this.mesh = new THREE.Object3D();
}

ParticlesHolder.prototype.spawnParticles = function(pos, density, color, scale){
  var nPArticles = density;
  for (var i=0; i<nPArticles; i++){
    var particle;
    if (particlesPool.length) {
      particle = particlesPool.pop();
    }else{
      particle = new Particle();
    }
    this.mesh.add(particle.mesh);
    particle.mesh.visible = true;
    particle.mesh.position.y = pos.y;
    particle.mesh.position.x = pos.x;
    particle.explode(pos,color, scale);
  }
}

Coin = function(){
  var geom = new THREE.TetrahedronGeometry(5,0);
  var mat = new THREE.MeshPhongMaterial({
    color:0x009999,
    emissive:0x00383a,
    shininess:90,
    specular:0xcffffa,
    shading:THREE.FlatShading
  });
  this.mesh = new THREE.Mesh(geom,mat);
  this.mesh.castShadow = true;
  this.x = 0; this.y = 0;
}

CoinsHolder = function (nCoins){
  this.mesh = new THREE.Object3D();
  this.coinsInUse = [];
  this.coinsPool = [];
  for (var i=0; i<nCoins; i++){
    var coin = new Coin();
    this.coinsPool.push(coin);
  }
}

CoinsHolder.prototype.spawnCoins = function(){

  var nCoins = 1 + Math.floor(Math.random()*10);
  var d = laneY(game.safeLane);
  var amplitude = 10 + Math.round(Math.random()*10);
  for (var i=0; i<nCoins; i++){
    var coin;
    if (this.coinsPool.length) {
      coin = this.coinsPool.pop();
    }else{
      coin = new Coin();
    }
    this.mesh.add(coin.mesh);
    this.coinsInUse.push(coin);
    coin.x = SPAWN_X + i*14;
    coin.y = d + Math.cos(i*.5)*amplitude;
    coin.mesh.position.set(coin.x, coin.y, 0);
  }
}

CoinsHolder.prototype.rotateCoins = function(){
  for (var i=0; i<this.coinsInUse.length; i++){
    var coin = this.coinsInUse[i];
    coin.x -= dxFrame*game.coinsSpeed;
    coin.mesh.position.x = coin.x;
    coin.mesh.rotation.z += Math.random()*.1;
    coin.mesh.rotation.y += Math.random()*.1;

    var diffPos = airplane.mesh.position.clone().sub(coin.mesh.position);
    var d = diffPos.length();
    if (d<game.coinDistanceTolerance && game.status=="playing"){
      this.coinsPool.unshift(this.coinsInUse.splice(i,1)[0]);
      this.mesh.remove(coin.mesh);
      particlesHolder.spawnParticles(coin.mesh.position.clone(), 5, 0x009999, .8);
      repairDamage(); VF.onCoin();
      i--;
    }else if (coin.x < DESPAWN_X){
      this.coinsPool.unshift(this.coinsInUse.splice(i,1)[0]);
      this.mesh.remove(coin.mesh);
      i--;
    }
  }
}


Fuel = function(){
  this.mesh = new THREE.Object3D();
  var mat = new THREE.MeshPhongMaterial({color:0xf4a63a, emissive:0x7a4a00, shininess:60, specular:0xffe0a0, shading:THREE.FlatShading});
  var body = new THREE.Mesh(new THREE.BoxGeometry(10,13,6), mat);
  var cap = new THREE.Mesh(new THREE.BoxGeometry(4,3,3), new THREE.MeshPhongMaterial({color:Colors.brownDark, shading:THREE.FlatShading}));
  cap.position.set(-2,8,0);
  var stripe = new THREE.Mesh(new THREE.BoxGeometry(10.5,3,6.5), new THREE.MeshPhongMaterial({color:Colors.white, shading:THREE.FlatShading}));
  this.mesh.add(body); this.mesh.add(cap); this.mesh.add(stripe);
  body.castShadow = true;
  this.mesh.scale.set(1.5,1.5,1.5);
  this.x = 0; this.y = 0;
}
FuelHolder = function(){ this.mesh = new THREE.Object3D(); this.inUse = []; this.pool = []; }
FuelHolder.prototype.spawn = function(){
  var f = this.pool.length ? this.pool.pop() : new Fuel();
  f.x = SPAWN_X; f.y = laneY(game.safeLane);
  f.mesh.position.set(f.x, f.y, 0);
  this.mesh.add(f.mesh); this.inUse.push(f);
}
FuelHolder.prototype.rotate = function(){
  for (var i=0; i<this.inUse.length; i++){
    var f = this.inUse[i];
    f.x -= dxFrame*game.coinsSpeed;
    f.mesh.position.x = f.x;
    f.mesh.rotation.y += .05;
    var d = airplane.mesh.position.clone().sub(f.mesh.position).length();
    if (game.status=="playing" && d < game.coinDistanceTolerance*1.8){
      game.fuel = Math.min(100, game.fuel + game.fuelValue); guardFuel = game.fuel;
      particlesHolder.spawnParticles(f.mesh.position.clone(), 10, 0xf4a63a, 1);
      VF.onFuel();
    } else if (f.x > DESPAWN_X) continue;
    this.pool.push(this.inUse.splice(i,1)[0]); this.mesh.remove(f.mesh); i--;
  }
}
var fuelHolder, fuelBar;
function createFuel(){ fuelHolder = new FuelHolder(); scene.add(fuelHolder.mesh); }
function updateFuel(dd){
  if (game.fuel > guardFuel + .001) VF.cheat('fuel');
  game.fuel -= dd*(game.fuelBase + Math.min(game.level,12)*game.fuelPerLevel)*game.fuelEff;
  game.fuel = Math.max(0, game.fuel); guardFuel = game.fuel;
  fuelBar.style.right = (100-game.fuel)+"%";
  fuelBar.style.backgroundColor = (game.fuel<30)? "#f25346" : "#f4a63a";
  fuelBar.style.animationName = (game.fuel<30)? "blinking" : "none";
  if (game.fuel<=0 && game.status=="playing") endRun("Out of fuel!");
}

// ---------- SMOKE + FIRE (a damaged plane trails smoke, a nearly dead one burns) and jet exhaust ----------
var Puffs = {root:null, pool:[], act:[], t:0};
function createPuffs(){
  Puffs.root = new THREE.Object3D(); scene.add(Puffs.root);
  var geom = new THREE.IcosahedronGeometry(3, 0);
  for (var i=0;i<46;i++){
    var m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({color:0x888888, transparent:true, opacity:.6, fog:true, depthWrite:false}));
    m.visible = false; Puffs.root.add(m); Puffs.pool.push({m:m, x:0, y:0, vy:0, life:0, max:1, s0:1, s1:2, a:.6});
  }
}
function emitPuff(x, y, kind){
  var p = Puffs.pool.pop(); if (!p) return;
  var col, life, s0, s1, vy, a;
  if (kind === 2){ col = Math.random() < .5 ? 0xff7a1a : 0xffc23a; life = 380; s0 = .8; s1 = 1.8; vy = .02; a = .9; }      // fire
  else if (kind === 1){ col = 0x2c2c30; life = 900; s0 = .9; s1 = 3.6; vy = .035; a = .62; }                             // dark smoke
  else if (kind === 3){ col = 0xffffff; life = 700; s0 = .5; s1 = 1.9; vy = .004; a = .4; }                              // jet contrail
  else { col = 0xb8b8bc; life = 800; s0 = .8; s1 = 3; vy = .03; a = .5; }                                                  // light smoke
  p.m.material.color.setHex(col); p.m.material.opacity = a; p.a = a;
  p.x = x + (Math.random()-.5)*3; p.y = y + (Math.random()-.5)*3; p.vy = vy; p.life = p.max = life; p.s0 = s0; p.s1 = s1;
  p.m.position.set(p.x, p.y, (Math.random()-.5)*4); p.m.scale.set(s0,s0,s0); p.m.visible = true; Puffs.act.push(p);
}
function updatePuffs(){
  for (var i=Puffs.act.length-1;i>=0;i--){
    var p = Puffs.act[i]; p.life -= deltaTime;
    if (p.life <= 0){ p.m.visible = false; Puffs.act.splice(i,1); Puffs.pool.push(p); continue; }
    var k = 1 - p.life/p.max;
    p.x -= dxFrame; p.y += p.vy*deltaTime;
    var s = p.s0 + (p.s1-p.s0)*k; p.m.scale.set(s,s,s);
    p.m.position.x = p.x; p.m.position.y = p.y; p.m.material.opacity = p.a*(1-k);
    p.m.rotation.x += .03; p.m.rotation.y += .02;
  }
}
function clearPuffs(){ while (Puffs.act.length){ var p = Puffs.act.pop(); p.m.visible = false; Puffs.pool.push(p); } }
var TRAIL_KINDS = {jet:1, rocket:1, stealth:1, bizjet:1, shuttle:1, interceptor:1, airliner:1};
function emitPlaneEffects(){
  Puffs.t += deltaTime;
  var dm = game.damage, step = dm >= 85 ? 45 : dm >= 65 ? 75 : dm >= 40 ? 130 : 0;
  var tx = airplane.mesh.position.x + airplane.tail*.25, ty = airplane.mesh.position.y;
  if (step && Puffs.t > step){
    Puffs.t = 0;
    emitPuff(tx, ty, dm >= 85 ? 2 : dm >= 65 ? 1 : 0);
    if (dm >= 85) emitPuff(tx, ty, 1);
  } else if (!step && TRAIL_KINDS[airplane.kind] && Puffs.t > 70){
    Puffs.t = 0; emitPuff(tx, ty, 3);
  }
}

// 3D Models
var airplane;
var particlesHolder, coinsHolder, ennemiesHolder;

// (re)builds the player's plane from the hangar choice. Called by vectofly.js whenever plane / paint changes.
function setPlaneModel(kind, spec, base){
  var old = airplane ? airplane.mesh : null;
  var a = PB.build(kind, spec, base);
  a.mesh.scale.set(.25,.25,.25);
  a.mesh.position.y = game.planeDefaultHeight;
  if (old){
    a.mesh.position.copy(old.position); a.mesh.rotation.copy(old.rotation);
    scene.remove(old);
    old.traverse(function(o){ if (o.geometry) o.geometry.dispose(); });
  }
  scene.add(a.mesh);
  airplane = a;
}

function createPlane(){ setPlaneModel('prop', null, '#f25346'); }

function createCoins(){
  coinsHolder = new CoinsHolder(20);
  scene.add(coinsHolder.mesh)
}

function createEnnemies(){
  for (var i=0; i<10; i++){
    var ennemy = new Ennemy();
    ennemiesPool.push(ennemy);
  }
  ennemiesHolder = new EnnemiesHolder();
  scene.add(ennemiesHolder.mesh)
}

function createParticles(){
  for (var i=0; i<10; i++){
    var particle = new Particle();
    particlesPool.push(particle);
  }
  particlesHolder = new ParticlesHolder();
  scene.add(particlesHolder.mesh)
}

function loop(){

  newTime = new Date().getTime();
  if (VF.paused){ oldTime=newTime; requestAnimationFrame(loop); return; }
  deltaTime = Math.min(newTime-oldTime,50);
  oldTime = newTime;

  if (game.status=="playing"){

    if (game.distance-game.coinLastSpawn >= game.distanceForCoinsSpawn){ game.coinLastSpawn=game.distance; coinsHolder.spawnCoins(); }
    if (game.distance-game.fuelLastSpawn >= game.distanceForFuelSpawn){ game.fuelLastSpawn=game.distance; fuelHolder.spawn(); }
    if (game.distance-game.ennemyLastSpawn >= game.distanceForEnnemiesSpawn){ game.ennemyLastSpawn=game.distance; ennemiesHolder.spawnEnnemies(); }
    var lv = 1+Math.floor(game.distance/game.distanceForLevelUpdate);
    if (lv>game.level){ game.level=lv; fieldLevel.innerHTML=lv; game.distanceForEnnemiesSpawn=Math.max(game.spawnMin, game.spawnStart - game.spawnStep*lv); game.distanceForFuelSpawn=Math.max(330,450-5*lv); VF.onLevel(lv); }
    // endless Chrome-dino style ramp: speed grows continuously with distance
    game.targetBaseSpeed = Math.min(game.maxBaseSpeed, game.initSpeed + game.distance*game.speedPerMeter);

    updatePlane();
    updateDistance();
    updateDamage();
    game.baseSpeed += (game.targetBaseSpeed - game.baseSpeed) * deltaTime * 0.02;
    game.speed = game.baseSpeed * game.planeSpeed;

  }else if(game.status=="gameover"){
    game.speed *= Math.pow(.985, deltaTime/16.7);
    airplane.mesh.rotation.z += (-Math.PI/2 - airplane.mesh.rotation.z)*.0006*deltaTime;
    airplane.mesh.rotation.x += 0.0004*deltaTime;
    game.planeFallSpeed *= Math.pow(1.04, deltaTime/16.7);
    airplane.mesh.position.y -= game.planeFallSpeed*deltaTime;
    if (Math.random() < .6) emitPuff(airplane.mesh.position.x, airplane.mesh.position.y, Math.random() < .5 ? 2 : 1);

    var gy = World.groundAt(airplane.mesh.position.x, 0) + 6;
    if (airplane.mesh.position.y <= gy){
      // impact: explosion, wreck stays on the ground and the world rolls to a stop
      airplane.mesh.position.y = gy;
      var ip = airplane.mesh.position.clone();
      particlesHolder.spawnParticles(ip, 30, 0xf4a63a, 4);
      particlesHolder.spawnParticles(ip, 22, 0xd6483b, 3.4);
      particlesHolder.spawnParticles(ip, 16, 0x2c2c30, 3);
      VF.onHit(); hitFlash();
      for (var q=0;q<10;q++) emitPuff(ip.x, ip.y + 2, q%3 ? 1 : 2);
      game.status = "crashed"; game.crashT = 0;
    }
  }else if (game.status=="crashed"){
    game.speed *= Math.pow(.94, deltaTime/16.7); game.crashT += deltaTime;
    if (Math.random() < .25) emitPuff(airplane.mesh.position.x, airplane.mesh.position.y + 3, Math.random() < .3 ? 2 : 1);
    if (game.crashT > 900){ showReplay(); game.status = "waitingReplay"; }
  }else if (game.status=="menu"){
    game.speed=.0005;
    airplane.mesh.position.y=game.planeDefaultHeight+Math.sin(newTime/400)*6;
  }else if (game.status=="waitingReplay"){
    game.speed *= Math.pow(.96, deltaTime/16.7);
  }

  dxFrame = game.speed*deltaTime*K_SCROLL;
  World.update(dxFrame, deltaTime);

  airplane.propeller.rotation.x +=.2 + game.planeSpeed * deltaTime*.005;
  if (airplane.tick) airplane.tick(deltaTime);

  ambientLight.intensity += (.5 - ambientLight.intensity)*deltaTime*0.005;

  coinsHolder.rotateCoins();
  fuelHolder.rotate();
  ennemiesHolder.rotateEnnemies();

  if (game.status=="playing") emitPlaneEffects();
  updatePuffs();
  VF.onFrame();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updateDistance(){
  var dd = game.speed*deltaTime*game.ratioSpeedDistance; game.distance += dd; VF.tick(dd, deltaTime); updateFuel(dd);
  fieldDistance.innerHTML = VF.score();
  var d = 502*(1-(game.distance%game.distanceForLevelUpdate)/game.distanceForLevelUpdate);
  levelCircle.setAttribute("stroke-dashoffset", d);
}

// ---------- DAMAGE ----------
// Red spikes add damage, blue pills repair it. At 100 damage the plane is destroyed.
function updateDamage(){
  if (Math.abs(game.damage - guardDamage) > .01) VF.cheat('damage');
  var dm = Math.min(100, Math.max(0, game.damage));
  damageBar.style.right = (100-dm)+"%";
  damageBar.style.backgroundColor = dm < 40 ? "#68c3c0" : dm < 70 ? "#f4a63a" : "#f25346";
  damageBar.style.animationName = dm > 70 ? "blinking" : "none";
  if (dm >= 100 && game.status=="playing") endRun("Crashed!");
}

// Integrity guards: damage / fuel may only change through the functions below. If something else edits them
// (console, injected script), the run is stopped and not submitted. The server re-checks every score anyway.
var guardDamage = 0, guardFuel = 100;
function repairDamage(){
  game.damage = Math.max(0, game.damage - game.coinValue); guardDamage = game.damage;
}

function addDamage(){
  game.damage = Math.min(100, game.damage + game.ennemyValue); guardDamage = game.damage;
}

function endRun(reason){
  if (game.status!="playing") return;
  game.reason = reason; game.status = "gameover"; game.planeFallSpeed = .001;
  VF.onGameOver();
}


function updatePlane(){

  game.planeSpeed = normalize(mousePos.x,-.5,.5,game.planeMinSpeed, game.planeMaxSpeed);
  var targetY = normalize(mousePos.y,-.75,.75,game.planeDefaultHeight-game.planeAmpHeight, game.planeDefaultHeight+game.planeAmpHeight);
  var targetX = normalize(mousePos.x,-1,1,-game.planeAmpWidth*.7, -game.planeAmpWidth);

  game.planeCollisionDisplacementX += game.planeCollisionSpeedX;
  targetX += game.planeCollisionDisplacementX;


  game.planeCollisionDisplacementY += game.planeCollisionSpeedY;
  targetY += game.planeCollisionDisplacementY;

  airplane.mesh.position.y += (targetY-airplane.mesh.position.y)*deltaTime*game.planeMoveSensivity;
  airplane.mesh.position.x += (targetX-airplane.mesh.position.x)*deltaTime*game.planeMoveSensivity;

  airplane.mesh.rotation.z = (targetY-airplane.mesh.position.y)*deltaTime*game.planeRotXSensivity;
  airplane.mesh.rotation.x = (airplane.mesh.position.y-targetY)*deltaTime*game.planeRotZSensivity;
  // a badly damaged plane shudders
  if (game.damage > 60){ var j = (game.damage-60)/40*.05; airplane.mesh.rotation.z += (Math.random()-.5)*j; airplane.mesh.rotation.x += (Math.random()-.5)*j; }
  camera.fov = Math.min(110, normalize(mousePos.x,-1,1,46,72) * (aspectRatio<1 ? 1+(1-aspectRatio)*.9 : 1));
  camera.updateProjectionMatrix ()
  camera.position.y += (airplane.mesh.position.y - camera.position.y)*deltaTime*game.cameraSensivity;

  game.planeCollisionSpeedX += (0-game.planeCollisionSpeedX)*deltaTime * 0.03;
  game.planeCollisionDisplacementX += (0-game.planeCollisionDisplacementX)*deltaTime *0.01;
  game.planeCollisionSpeedY += (0-game.planeCollisionSpeedY)*deltaTime * 0.03;
  game.planeCollisionDisplacementY += (0-game.planeCollisionDisplacementY)*deltaTime *0.01;

  airplane.pilot.updateHairs();
}

function startGame(){
  resetGame(); VF.applyPerks(); guardDamage = 0; guardFuel = 100;
  airplane.mesh.position.y=game.planeDefaultHeight; airplane.mesh.rotation.set(0,0,0);
  while(ennemiesHolder.ennemiesInUse.length){ var e=ennemiesHolder.ennemiesInUse.pop(); ennemiesHolder.mesh.remove(e.mesh); ennemiesPool.push(e); }
  while(fuelHolder.inUse.length){ var u=fuelHolder.inUse.pop(); fuelHolder.mesh.remove(u.mesh); fuelHolder.pool.push(u); }
  while(coinsHolder.coinsInUse.length){ var c=coinsHolder.coinsInUse.pop(); coinsHolder.mesh.remove(c.mesh); coinsHolder.coinsPool.push(c); }
  clearPuffs();
  damageBar.style.right = "100%"; damageBar.style.animationName = "none";
}

function showReplay(){
  VF.showGameOver();
}

function hideReplay(){

}

function normalize(v,vmin,vmax,tmin, tmax){
  var nv = Math.max(Math.min(v,vmax), vmin);
  var dv = vmax-vmin;
  var pc = (nv-vmin)/dv;
  var dt = tmax-tmin;
  var tv = tmin + (pc*dt);
  return tv;
}

var fieldDistance, damageBar, replayMessage, fieldLevel, levelCircle;

function init(event){

  // UI

  fieldDistance = document.getElementById("distValue");
  damageBar = document.getElementById("damageBar");
  fuelBar = document.getElementById("fuelBar");
  replayMessage = document.getElementById("replayMessage");
  fieldLevel = document.getElementById("levelValue");
  levelCircle = document.getElementById("levelCircleStroke");

  resetGame();
  game.status="menu";
  createScene();

  createLights();
  World.init(scene);
  createPlane();
  createCoins();
  createEnnemies();
  createParticles();
  createFuel();
  createPuffs();

  document.addEventListener('mousemove', handleMouseMove, false);
  document.addEventListener('touchmove', handleTouchMove, {passive:false});
  document.addEventListener('touchstart', function(e){ if(game.status=="playing"&&e.target.tagName=="CANVAS"&&!(window.VF&&VF.padHeld&&VF.padHeld())){var t=e.touches[e.touches.length-1];mousePos={x:-1+(t.pageX/WIDTH)*2,y:1-(t.pageY/HEIGHT)*2};} }, false);
  document.addEventListener('mouseup', handleMouseUp, false);
  document.addEventListener('touchend', handleTouchEnd, false);

  loop();
}

window.addEventListener('load', init, false);
