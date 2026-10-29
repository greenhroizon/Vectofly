// VectoFly leaderboard for Vercel (serverless function + Upstash Redis). Same API as server/server.js:
//   GET  /api/scores?limit=50  -> { scores: [ { n, s, k } ... ] }   best score per player, highest first
//   POST /api/scores           -> body { id, name, score, dist, level, plane } -> { ok, rank, best, k }
// Needs the Upstash Redis integration (Vercel dashboard > Storage / Marketplace). Env vars are added automatically:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (or KV_REST_API_URL + KV_REST_API_TOKEN)
'use strict';
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});
const ZKEY = 'vf:scores', HKEY = 'vf:meta', MAX_ENTRIES = 5000, ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const pub = id => crypto.createHash('sha256').update(id).digest('hex').slice(0, 10);   // public key, never expose the secret id

function cleanName(n) {
  n = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  return n || 'Pilot';
}
function send(res, code, obj) {
  res.status(code);
  res.setHeader('Cache-Control', 'no-store');
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
async function limited(ip) {            // 30 submissions per minute per IP
  const key = 'vf:rl:' + ip, n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 60);
  return n > 30;
}
function parse(v) { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return send(res, 204);

    if (req.method === 'GET') {
      const limit = Math.max(1, Math.min(100, +(req.query && req.query.limit) || 50));
      const ids = await redis.zrange(ZKEY, 0, limit - 1, { rev: true });
      const metas = ids.length ? await redis.hmget(HKEY, ...ids) : {};
      const scores = ids.map(id => { const m = parse(metas && metas[id]); return m ? { n: m.n, s: m.s, k: pub(id) } : null; }).filter(Boolean);
      return send(res, 200, { scores });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (await limited(clientIp(req))) return send(res, 429, { error: 'slow down' });

    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== 'object') return send(res, 400, { error: 'json' });

    const id = String(b.id || ''), score = Math.floor(+b.score), dist = Math.floor(+b.dist), level = Math.floor(+b.level);
    if (!/^[a-z0-9]{6,32}$/.test(id)) return send(res, 400, { error: 'id' });
    if (!(score > 0) || !(dist >= 0) || !(level >= 1)) return send(res, 400, { error: 'numbers' });
    // plausibility: score = distance + 5 per pill, and pills are limited per distance travelled
    if (score > dist * 4 + 400 || dist > 5e6 || level > 5000 || score > 1e7) return send(res, 422, { error: 'implausible' });

    const name = cleanName(b.name), prevScore = await redis.zscore(ZKEY, id), prev = prevScore == null ? null : +prevScore;
    if (prev === null || score > prev) {
      await redis.zadd(ZKEY, { score, member: id });
      await redis.hset(HKEY, { [id]: JSON.stringify({ n: name, s: score, d: dist, l: level, p: String(b.plane || '').slice(0, 16), t: Date.now() }) });
      const total = await redis.zcard(ZKEY);
      if (total > MAX_ENTRIES) {          // drop the lowest scores beyond the cap
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
    return send(res, 500, { error: 'server' });
  }
};
