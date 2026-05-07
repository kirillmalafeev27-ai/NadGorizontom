const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DEFAULT_PORT = 3000;
const ROOT = __dirname;
const THREE_ROOT = path.join(ROOT, 'node_modules', 'three');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.glb') return 'public, max-age=31536000, immutable';
  if (ext === '.js' || ext === '.css') return 'public, max-age=3600';
  return 'no-cache';
}

function safeResolve(root, requestPath) {
  let pathname;
  try {
    const rawPath = (requestPath || '/').split('?')[0].split('#')[0];
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (pathname.includes('\\') || pathname.split('/').includes('..')) return null;
  if (pathname === '/node_modules' || pathname.startsWith('/node_modules/')) return null;

  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(root, `.${pathname}`);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function resolveThreeVendor(requestPath) {
  let pathname;
  try {
    pathname = decodeURIComponent((requestPath || '').split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const prefix = '/vendor/three/';
  if (!pathname.startsWith(prefix)) return null;
  const relative = pathname.slice(prefix.length);
  if (!relative || relative.includes('\\') || relative.split('/').includes('..')) {
    return null;
  }

  const resolved = path.resolve(THREE_ROOT, relative);
  const vendorRoot = THREE_ROOT.endsWith(path.sep) ? THREE_ROOT : `${THREE_ROOT}${path.sep}`;
  if (!resolved.startsWith(vendorRoot)) return null;
  return resolved;
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.end(body);
}

function createServer(root = ROOT) {
  return http.createServer((req, res) => {
    if (req.url === '/healthz') {
      sendText(res, 200, 'ok');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'method not allowed');
      return;
    }

    const filePath =
      resolveThreeVendor(req.url || '/') ||
      safeResolve(root, req.url || '/');
    if (!filePath) {
      sendText(res, 403, 'forbidden');
      return;
    }

    fs.stat(filePath, (statErr, stats) => {
      if (statErr || !stats.isFile()) {
        sendText(res, 404, 'not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Cache-Control': cacheControlFor(filePath),
        'Content-Length': stats.size,
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(filePath).pipe(res);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Nad Gorizontom web service listening on ${port}`);
  });
}

module.exports = { cacheControlFor, createServer, resolveThreeVendor, safeResolve };
