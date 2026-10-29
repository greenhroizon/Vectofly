// VectoFly leaderboard for Vercel (serverless function + Upstash Redis).
//   GET  /api/scores?limit=20          -> { scores: [ { n, s, k } ... ] }   best score per player, highest first
//   GET  /api/scores?debug=1           -> { ok, redis, ... }               health check (never prints secrets)
//   POST /api/scores {action:'start'}  -> { t }                            signed, single-use run ticket (anti-cheat)
//   POST /api/scores {score,...,t}     -> { ok, rank, best, k }            submit a finished run
// Env (added by the Vercel Upstash integration, any prefix is fine):
//   *_REST_API_URL / *_REST_API_TOKEN   or   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   SCORE_SECRET (optional) - extra secret used to sign run tickets; derived from the Redis token when not set.
'use strict';
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

// ---- find the Redis credentials whatever prefix the Vercel integration used ----
function findEnv() {
  const e = process.env;
  let url = e.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL || '', token = e.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN || '';
  if (!url) { const k = Object.keys(e).find(k => /(REST_API_URL|REST_URL)$/.test(k) && /^https:\/\//.test(e[k])); if (k) url = e[k]; }
  if (!token) { const k = Object.keys(e).find(k => /(REST_API_TOKEN|REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k)); if (k) token = e[k]; }
  return { url: url.trim(), token: token.trim() };
}
const ENV = findEnv();
let redis = null;
if (ENV.url && ENV.token) redis = new Redis({ url: ENV.url, token: ENV.token, automaticDeserialization: false });

const VKEY = 'vf:visitors', ZKEY = 'vf:scores', HKEY = 'vf:meta', MAX_ENTRIES = 5000, ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const SECRET = process.env.SCORE_SECRET || crypto.createHash('sha256').update('vf|' + ENV.token).digest('hex');
const MULT = { easy: 1, medium: 1.25, hard: 1.5, hell: 2 };
const MAX_DIST_PER_SEC = 135;            // game tops out around 120 units/s on Hell
const pub = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);

function cleanName(n) {
  n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'Pilot';
}
function send(res, code, obj) {
  res.status(code);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (code === 204) return res.end();
  res.json(obj);
}
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0] : (req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '?')).trim();
}
async function limited(ip, bucket, max) {
  const key = 'vf:rl:' + bucket + ':' + ip, n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60);
  return n > max;
}
function parse(v) { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }
const sign = (id, ts, nonce) => crypto.createHmac('sha256', SECRET).update([id, ts, nonce].join('.')).digest('hex').slice(0, 32);
function safeEq(a, b) { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); }

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return send(res, 204);

    if (!redis) {
      console.error('VectoFly: no Upstash Redis env vars found');
      return send(res, 503, { error: 'server', hint: 'Redis is not connected. In Vercel: Storage > Upstash Redis > connect to this project, then redeploy.' });
    }

    if (req.method === 'GET') {
      if (req.query && req.query.debug) {
        let ping = 'ok'; try { await redis.ping(); } catch (e) { ping = 'failed: ' + String(e && e.message || e).slice(0, 120); }
        return send(res, 200, { ok: ping === 'ok', redis: ping, host: ENV.url.replace(/^https:\/\//, '').slice(0, 40) });
      }
      const limit = Math.max(1, Math.min(100, +(req.query && req.query.limit) || 50));
      const ids = await redis.zrange(ZKEY, 0, limit - 1, { rev: true });
      const metas = ids.length ? await redis.hmget(HKEY, ...ids) : null;
      const scores = ids.map(id => { const m = parse(metas && metas[id]); return m ? { n: m.n, s: m.s, k: pub(id) } : null; }).filter(Boolean);
      const visitors = +(await redis.scard(VKEY)) || 0;
      return send(res, 200, { scores, visitors, at: Date.now() });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' });

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== 'object') return send(res, 400, { error: 'json' });
    const id = String(b.id || '');
    if (!/^[a-z0-9]{6,32}$/.test(id)) return send(res, 400, { error: 'id' });
    const ip = clientIp(req);

    // ---- visitor counter: one entry per device id, so reloads never double count ----
    if (b.action === 'visit') {
      if (await limited(ip, 'visit', 30)) return send(res, 429, { error: 'slow down' });
      await redis.sadd(VKEY, id);
      return send(res, 200, { ok: true, visitors: +(await redis.scard(VKEY)) || 0 });
    }

    // ---- step 1: a run ticket, issued when the flight starts ----
    if (b.action === 'start') {
      if (await limited(ip, 'start', 40)) return send(res, 429, { error: 'slow down' });
      const ts = Date.now(), nonce = crypto.randomBytes(8).toString('hex');
      return send(res, 200, { t: [ts, nonce, sign(id, ts, nonce)].join('.') });
    }

    // ---- step 2: submit the finished run ----
    if (await limited(ip, 'submit', 20)) return send(res, 429, { error: 'slow down' });
    const score = Math.floor(+b.score), dist = Math.floor(+b.dist), level = Math.floor(+b.level), pills = Math.floor(+b.pills), playMs = Math.floor(+b.playMs);
    const mult = MULT[String(b.diff)];
    if (!(score > 0) || !(dist >= 0) || !(level >= 1) || !(pills >= 0) || !(playMs > 0) || !mult) return send(res, 400, { error: 'numbers' });

    // ticket must be ours, bound to this player, fresh, and unused
    const parts = String(b.t || '').split('.');
    if (parts.length !== 3 || !/^\d{10,14}$/.test(parts[0]) || !/^[a-f0-9]{16}$/.test(parts[1])) return send(res, 403, { error: 'ticket' });
    const ts = +parts[0], nonce = parts[1];
    if (!safeEq(parts[2], sign(id, ts, nonce))) return send(res, 403, { error: 'ticket' });
    const elapsed = Date.now() - ts;
    if (elapsed < 0 || elapsed > 3 * 3600e3) return send(res, 403, { error: 'expired' });
    const fresh = await redis.set('vf:used:' + nonce, '1', { nx: true, ex: 4 * 3600 });
    if (!fresh) return send(res, 403, { error: 'replay' });

    // physics-based plausibility: what the game can actually produce in that much real time
    const sec = elapsed / 1000;
    if (dist > sec * MAX_DIST_PER_SEC + 60) return send(res, 422, { error: 'too fast' });
    if (playMs > elapsed + 3000) return send(res, 422, { error: 'clock' });
    if (dist > (playMs / 1000) * MAX_DIST_PER_SEC + 60) return send(res, 422, { error: 'too fast' });
    if (Math.abs(level - (1 + Math.floor(dist / 1000))) > 1) return send(res, 422, { error: 'level' });
    if (pills > dist / 85 * 10 + 10) return send(res, 422, { error: 'pills' });
    if (Math.abs(score - Math.floor((dist + pills * 5) * mult)) > 3) return send(res, 422, { error: 'score' });
    if (dist > 5e6 || score > 1e7) return send(res, 422, { error: 'implausible' });

    const name = cleanName(b.name), prevScore = await redis.zscore(ZKEY, id), prev = prevScore == null ? null : +prevScore;
    if (prev === null || score > prev) {
      await redis.zadd(ZKEY, { score, member: id });
      await redis.hset(HKEY, { [id]: JSON.stringify({ n: name, s: score, d: dist, l: level, p: String(b.plane || '').slice(0, 16), df: String(b.diff), t: Date.now() }) });
      const total = await redis.zcard(ZKEY);
      if (total > MAX_ENTRIES) {
        const drop = await redis.zrange(ZKEY, 0, total - MAX_ENTRIES - 1);
        if (drop.length) { await redis.zrem(ZKEY, ...drop); await redis.hdel(HKEY, ...drop); }
      }
    } else {
      const m = parse(await redis.hget(HKEY, id));
      if (m && m.n !== name) { m.n = name; await redis.hset(HKEY, { [id]: JSON.stringify(m) }); }
    }
    const best = +(await redis.zscore(ZKEY, id)), rankIdx = await redis.zrevrank(ZKEY, id);
    return send(res, 200, { ok: true, rank: (rankIdx == null ? 0 : rankIdx) + 1, best, k: pub(id) });
  } catch (e) {
    console.error('VectoFly API error:', e && e.message ? e.message : e);
    return send(res, 500, { error: 'server', hint: 'Could not talk to Redis. Open /api/scores?debug=1 to check the connection.' });
  }
};
