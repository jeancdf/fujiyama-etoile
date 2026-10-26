/* Fujiyama Étoile — serveur du site et de l'espace admin.
 *
 * Aucune dépendance : uniquement les modules intégrés à Node (>= 20).
 * Les données vivent dans DATA_DIR :
 *   site.json      version publiée (lue par le site public)
 *   draft.json     brouillon de l'admin, absent quand tout est publié
 *   history/       copies datées des versions publiées précédentes
 *   uploads/       photos envoyées depuis l'admin
 *
 * Variables d'environnement :
 *   PORT                 port d'écoute (3000)
 *   DATA_DIR             dossier des données (./var en local, /data en production)
 *   ADMIN_PASSWORD_HASH  empreinte du mot de passe admin (voir server/hash-password.js)
 *   SESSION_SECRET       clé de signature des sessions (32 caractères aléatoires minimum)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPassword } = require('./password');
const { validateSite } = require('./validate');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'var'));
const UPLOADS = path.join(DATA_DIR, 'uploads');
const HISTORY = path.join(DATA_DIR, 'history');
const PUBLISHED = path.join(DATA_DIR, 'site.json');
const DRAFT = path.join(DATA_DIR, 'draft.json');
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_DAYS = 7;
const HISTORY_KEEP = 30;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 6 * 1024 * 1024;

if (!PASSWORD_HASH || SESSION_SECRET.length < 32) {
  console.error('ADMIN_PASSWORD_HASH et SESSION_SECRET (32 caractères min.) sont obligatoires.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "frame-src https://www.google.com",
    "script-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

// ---------- Données ----------

async function init() {
  await fsp.mkdir(UPLOADS, { recursive: true });
  await fsp.mkdir(HISTORY, { recursive: true });
  if (!fs.existsSync(PUBLISHED)) {
    await fsp.copyFile(path.join(ROOT, 'data', 'site.json'), PUBLISHED);
    console.log('site.json initialisé depuis data/site.json');
  }
}

async function readJson(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

// Écriture atomique : on écrit à côté puis on renomme, pour ne jamais laisser un fichier à moitié écrit.
async function writeJson(file, data) {
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(data, null, 1));
  await fsp.rename(tmp, file);
}

async function publish() {
  const draft = await readJson(DRAFT);
  if (!draft) return false;
  const current = await readJson(PUBLISHED);
  if (current) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeJson(path.join(HISTORY, 'site-' + stamp + '.json'), current);
    const old = (await fsp.readdir(HISTORY)).filter((f) => f.endsWith('.json')).sort();
    await Promise.all(old.slice(0, Math.max(0, old.length - HISTORY_KEEP)).map((f) => fsp.unlink(path.join(HISTORY, f))));
  }
  draft.version = ((current && current.version) || 0) + 1;
  await writeJson(PUBLISHED, draft);
  await fsp.unlink(DRAFT);
  return true;
}

// ---------- Sessions ----------

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return payload + '.' + sign(payload);
}

function readSession(req) {
  const m = /(?:^|;\s*)fj_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

function sessionCookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `fj_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

// Limite les essais de mot de passe : 10 par quart d'heure et par adresse IP.
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(ip, list);
  return list.length >= 10;
}
function recordAttempt(ip) { attempts.get(ip).push(Date.now()); }

// ---------- HTTP ----------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const data = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, isJson ? { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' } : {}, headers));
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Fichier trop volumineux'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req, MAX_JSON);
  try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
}

// Vérifie le type réel de l'image à partir de ses premiers octets, sans se fier à l'en-tête envoyé.
function imageExtension(buf) {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 8 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a') return '.png';
  return null;
}

async function serveFile(res, file, cache) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return send(res, 404, 'Introuvable', { 'Content-Type': MIME['.txt'] });
    res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache
    }));
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Introuvable', { 'Content-Type': MIME['.txt'] });
  }
}

// Résout un chemin d'URL dans un dossier autorisé, sans jamais en sortir.
function within(base, rel) {
  const full = path.resolve(base, '.' + path.sep + rel);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

async function handleStatic(req, res, pathname) {
  if (pathname === '/' ) pathname = '/index.html';
  if (pathname === '/admin' ) { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (pathname === '/admin/') pathname = '/admin/index.html';

  if (pathname === '/data/site.json') return serveFile(res, PUBLISHED, 'no-cache');
  if (pathname.startsWith('/uploads/')) {
    const f = within(UPLOADS, pathname.slice('/uploads/'.length));
    return f ? serveFile(res, f, 'public, max-age=31536000, immutable') : send(res, 404, 'Introuvable');
  }
  // Seuls ces fichiers du dépôt sont publics : jamais server/, data/, .git, etc.
  const allowed = pathname === '/index.html' || pathname === '/menus.html' || pathname.startsWith('/assets/') || pathname.startsWith('/admin/');
  if (!allowed) return send(res, 404, 'Introuvable', { 'Content-Type': MIME['.txt'] });
  const f = within(ROOT, pathname.slice(1));
  if (!f) return send(res, 404, 'Introuvable');
  const isPage = f.endsWith('.html');
  return serveFile(res, f, isPage || pathname.startsWith('/admin/') ? 'no-cache' : 'public, max-age=3600');
}

async function handleApi(req, res, pathname) {
  const ip = req.socket.remoteAddress || '';
  const method = req.method;

  if (pathname === '/api/health') return send(res, 200, { ok: true });

  // Protection CSRF : cookie SameSite=Strict + en-tête que seul notre JS ajoute + origine vérifiée.
  if (method !== 'GET') {
    if (req.headers['x-fujiyama'] !== '1') return send(res, 403, { error: 'Requête refusée' });
    const origin = req.headers.origin;
    let originHost = null;
    try { originHost = origin ? new URL(origin).host : req.headers.host; } catch { /* origine illisible : refusée */ }
    if (originHost !== req.headers.host) return send(res, 403, { error: 'Origine refusée' });
  }

  if (pathname === '/api/login' && method === 'POST') {
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Trop d\'essais. Réessayez dans 15 minutes.' });
    const body = await readJsonBody(req);
    if (typeof body.password !== 'string' || !(await verifyPassword(body.password, PASSWORD_HASH))) {
      recordAttempt(ip);
      return send(res, 401, { error: 'Mot de passe incorrect' });
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, createSession(), SESSION_DAYS * 86400) });
  }
  if (pathname === '/api/logout' && method === 'POST') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (pathname === '/api/session' && method === 'GET') return send(res, 200, { authenticated: readSession(req) });

  if (!readSession(req)) return send(res, 401, { error: 'Session expirée, reconnectez-vous.' });

  if (pathname === '/api/state' && method === 'GET') {
    return send(res, 200, { published: await readJson(PUBLISHED), draft: await readJson(DRAFT) });
  }
  if (pathname === '/api/draft' && method === 'PUT') {
    const result = validateSite(await readJsonBody(req));
    if (result.error) return send(res, 400, { error: result.error });
    await writeJson(DRAFT, result.site);
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/draft' && method === 'DELETE') {
    await fsp.rm(DRAFT, { force: true });
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/publish' && method === 'POST') {
    return send(res, 200, { ok: true, published: await publish() });
  }
  if (pathname === '/api/upload' && method === 'POST') {
    const buf = await readBody(req, MAX_UPLOAD);
    const ext = imageExtension(buf);
    if (!ext) return send(res, 415, { error: 'Format non reconnu : envoyez une photo JPG, PNG ou WebP.' });
    const name = Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex') + ext;
    await fsp.writeFile(path.join(UPLOADS, name), buf);
    return send(res, 200, { path: 'uploads/' + name });
  }
  return send(res, 404, { error: 'Introuvable' });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return send(res, 400, 'Requête invalide'); }
    if (decoded.includes('\0')) return send(res, 400, 'Requête invalide');
    if (decoded.startsWith('/api/')) return await handleApi(req, res, decoded);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
    return await handleStatic(req, res, decoded);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Erreur serveur' });
    else res.end();
  }
});

init().then(() => server.listen(PORT, () => console.log(`Fujiyama Étoile sur http://localhost:${PORT} (données : ${DATA_DIR})`)));
