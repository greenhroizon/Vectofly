// VectoFly server: serves the game AND the global leaderboard. Zero dependencies - just `node server.js`.
//   GET  /api/scores?limit=50   -> { scores: [ { n: "name", s: 1234 }, ... ] }   (best score per player, highest first)
//   POST /api/scores            -> body { id, name, score, dist, level, plane }  ->  { ok, rank, best }
// Env: PORT (3000), ALLOW_ORIGIN (* ), DATA_FILE (./data/scores.json), TRUST_PROXY=1 when behind a proxy/CDN.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const pub = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);   // public key: never expose the secret player id
const PORT = +process.env.PORT || 3000;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'scores.json');
const ROOT = path.resolve(__dirname, '..');
const MAX_ENTRIES = 5000;
const SECRET = process.env.SCORE_SECRET || crypto.randomBytes(32).toString('hex');   // set SCORE_SECRET to keep tickets valid across restarts
const MULT = { easy: 1, medium: 1.25, hard: 1.5, hell: 2 }, MAX_DIST_PER_SEC = 135, used = new Map();
const sign = (id, ts, nonce) => crypto.createHmac('sha256', SECRET).update([id, ts, nonce].join('.')).digest('hex').slice(0, 32);
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.webmanifest':'application/manifest+json','.webp':'image/webp'};

// ---- storage: one entry per player id, kept in memory and written to disk (atomically) ----
let scores = {};
try { scores = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { scores = {}; }
const VFILE = path.join(path.dirname(DATA_FILE), 'visitors.json');
let visitors = new Set(); try { visitors = new Set(JSON.parse(fs.readFileSync(VFILE, 'utf8'))); } catch (e) {}
let vDirty = false;
setInterval(() => { if (!vDirty) return; vDirty = false; try { fs.mkdirSync(path.dirname(VFILE), { recursive: true }); fs.writeFileSync(VFILE, JSON.stringify([...visitors])); } catch (e) {} }, 5000).unref();
let dirty = false, writing = false;
function flush() {
  if (!dirty || writing) return;
  writing = true; dirty = false;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(scores), err => {
    if (!err) fs.rename(tmp, DATA_FILE, () => { writing = false; if (dirty) flush(); }); else writing = false;
  });
}
setInterval(flush, 2000).unref();
process.on('SIGINT', () => { dirty = true; try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(scores)); } catch (e) {} process.exit(0); });
process.on('SIGTERM', () => process.emit('SIGINT'));

function sorted() { return Object.keys(scores).map(id => ({ id, ...scores[id] })).sort((a, b) => b.s - a.s || a.t - b.t); }
function trim() {
  const ids = Object.keys(scores);
  if (ids.length <= MAX_ENTRIES) return;
  sorted().slice(MAX_ENTRIES).forEach(e => delete scores[e.id]);
}

// ---- tiny per-IP rate limit for submissions ----
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return h.length > 30;
}
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

function send(res, code, obj, extra) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'
  }, extra || {}));
  res.end(body);
}
function cleanName(n) {
  n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'Pilot';
}

function api(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(100, +url.searchParams.get('limit') || 50));
    return send(res, 200, { scores: sorted().slice(0, limit).map(e => ({ n: e.n, s: e.s, k: pub(e.id) })), visitors: visitors.size });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 2000) req.destroy(); });
  req.on('end', () => {
    let b; try { b = JSON.parse(raw); } catch (e) { return send(res, 400, { error: 'json' }); }
    if (!b || typeof b !== 'object') return send(res, 400, { error: 'json' });
    const id = String(b.id || '');
    if (!/^[a-z0-9]{6,32}$/.test(id)) return send(res, 400, { error: 'id' });
    if (limited(clientIp(req))) return send(res, 429, { error: 'slow down' });
    if (b.action === 'visit') { if (!visitors.has(id) && visitors.size < 5e6) { visitors.add(id); vDirty = true; } return send(res, 200, { ok: true, visitors: visitors.size }); }
    // step 1: signed single-use run ticket, issued when a flight starts
    if (b.action === 'start') {
      const ts = Date.now(), nonce = crypto.randomBytes(8).toString('hex');
      return send(res, 200, { t: [ts, nonce, sign(id, ts, nonce)].join('.') });
    }
    // step 2: the finished run, checked against the ticket and against what the game can physically produce
    const score = Math.floor(+b.score), dist = Math.floor(+b.dist), level = Math.floor(+b.level), pills = Math.floor(+b.pills), playMs = Math.floor(+b.playMs);
    const mult = MULT[String(b.diff)];
    if (!(score > 0) || !(dist >= 0) || !(level >= 1) || !(pills >= 0) || !(playMs > 0) || !mult) return send(res, 400, { error: 'numbers' });
    const parts = String(b.t || '').split('.');
    if (parts.length !== 3 || !/^\d{10,14}$/.test(parts[0]) || !/^[a-f0-9]{16}$/.test(parts[1])) return send(res, 403, { error: 'ticket' });
    const ts = +parts[0], nonce = parts[1];
    if (!safeEq(parts[2], sign(id, ts, nonce))) return send(res, 403, { error: 'ticket' });
    const elapsed = Date.now() - ts;
    if (elapsed < 0 || elapsed > 3 * 3600e3) return send(res, 403, { error: 'expired' });
    if (used.has(nonce)) return send(res, 403, { error: 'replay' });
    used.set(nonce, Date.now()); if (used.size > 20000) for (const [k, t] of used) if (Date.now() - t > 4 * 3600e3) used.delete(k);
    const sec = elapsed / 1000;
    if (dist > sec * MAX_DIST_PER_SEC + 60 || dist > (playMs / 1000) * MAX_DIST_PER_SEC + 60) return send(res, 422, { error: 'too fast' });
    if (playMs > elapsed + 3000) return send(res, 422, { error: 'clock' });
    if (Math.abs(level - (1 + Math.floor(dist / 1000))) > 1) return send(res, 422, { error: 'level' });
    if (pills > dist / 85 * 10 + 10) return send(res, 422, { error: 'pills' });
    if (Math.abs(score - Math.floor((dist + pills * 5) * mult)) > 3) return send(res, 422, { error: 'score' });
    if (dist > 5e6 || score > 1e7) return send(res, 422, { error: 'implausible' });
    const prev = scores[id], name = cleanName(b.name);
    if (!prev || score > prev.s) { scores[id] = { n: name, s: score, d: dist, l: level, p: String(b.plane || '').slice(0, 16), df: String(b.diff), t: Date.now() }; trim(); dirty = true; }
    else if (prev.n !== name) { prev.n = name; dirty = true; }
    const best = scores[id].s, rank = sorted().findIndex(e => e.id === id) + 1;
    send(res, 200, { ok: true, rank, best, k: pub(id) });
  });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.resolve(ROOT, '.' + p);
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep)[0] === 'server' || rel.split(path.sep).some(s => s.startsWith('.'))) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return fs.readFile(path.join(ROOT, '404.html'), (e2, page) => { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(e2 ? 'Not found' : page); });
    const ext = path.extname(file).toLowerCase();
    const long = ['.png', '.jpg', '.ico', '.svg', '.woff2', '.webp'].includes(ext) ? 'public, max-age=31536000' : (['.js', '.css'].includes(ext) ? 'public, max-age=86400' : 'no-cache');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': long, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return send(res, 400, { error: 'url' }); }
  try { return url.pathname === '/api/scores' ? api(req, res, url) : serveStatic(req, res, url); }
  catch (e) { send(res, 500, { error: 'server' }); }
}).listen(PORT, () => console.log('VectoFly running on http://localhost:' + PORT + '  (leaderboard: /api/scores)'));
