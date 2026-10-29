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
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.webmanifest':'application/manifest+json','.webp':'image/webp'};

// ---- storage: one entry per player id, kept in memory and written to disk (atomically) ----
let scores = {};
try { scores = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { scores = {}; }
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
    return send(res, 200, { scores: sorted().slice(0, limit).map(e => ({ n: e.n, s: e.s, k: pub(e.id) })) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (limited(clientIp(req))) return send(res, 429, { error: 'slow down' });
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 2000) req.destroy(); });
  req.on('end', () => {
    let b; try { b = JSON.parse(raw); } catch (e) { return send(res, 400, { error: 'json' }); }
    const id = String(b.id || ''), score = Math.floor(+b.score), dist = Math.floor(+b.dist), level = Math.floor(+b.level);
    if (!/^[a-z0-9]{6,32}$/.test(id)) return send(res, 400, { error: 'id' });
    if (!(score > 0) || !(dist >= 0) || !(level >= 1)) return send(res, 400, { error: 'numbers' });
    // plausibility: score = distance + 5 per pill, and pills are limited per distance travelled
    if (score > dist * 4 + 400 || dist > 5e6 || level > 5000 || score > 1e7) return send(res, 422, { error: 'implausible' });
    const prev = scores[id], name = cleanName(b.name);
    if (!prev || score > prev.s) { scores[id] = { n: name, s: score, d: dist, l: level, p: String(b.plane || '').slice(0, 16), t: Date.now() }; trim(); dirty = true; }
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
