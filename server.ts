import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { initDatabase } from './src/db.js';
import { apiRouter } from './src/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database schema, WAL mode & seed records
initDatabase();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

function pickEncoding(req: express.Request): 'br' | 'gzip' | null {
  const acceptEncoding = String(req.headers['accept-encoding'] || '').toLowerCase();
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return null;
}

function sendCompressedBuffer(
  req: express.Request,
  res: express.Response,
  raw: Buffer,
  contentType: string,
  cacheControl?: string,
  preCompressed?: { br?: Buffer; gzip?: Buffer }
): void {
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  res.setHeader('Content-Type', contentType);
  const enc = raw.length >= 1024 ? pickEncoding(req) : null;
  if (!enc) {
    res.setHeader('Content-Length', String(raw.length));
    res.end(raw);
    return;
  }
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Encoding', enc);
  const encoded = enc === 'br'
    ? (preCompressed?.br || zlib.brotliCompressSync(raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
      }))
    : (preCompressed?.gzip || zlib.gzipSync(raw, { level: 6 }));
  res.setHeader('Content-Length', String(encoded.length));
  res.end(encoded);
}

// Compress large JSON API responses (e.g. /api/admin/overview, /api/requisitions) for LAN & VS Code tunnels
app.use('/api', (req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const serialized = JSON.stringify(body) ?? 'null';
    const raw = Buffer.from(serialized, 'utf8');
    if (raw.length < 1024 || !pickEncoding(req)) {
      return origJson(body);
    }
    sendCompressedBuffer(req, res, raw, 'application/json; charset=utf-8');
    return res;
  };
  next();
});

// API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

interface PrecompressedAsset {
  raw: Buffer;
  gzip: Buffer;
  br: Buffer;
  contentType: string;
  cacheControl: string;
}

function buildStaticAssetCache(distDir: string): Map<string, PrecompressedAsset> {
  const cache = new Map<string, PrecompressedAsset>();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const contentType = mimeTypes[ext];
      if (!contentType) continue;
      const relUrl = '/' + path.relative(distDir, fullPath).replace(/\\/g, '/');
      const raw = fs.readFileSync(fullPath);
      const isImmutable = relUrl.startsWith('/assets/');
      cache.set(relUrl, {
        raw,
        gzip: zlib.gzipSync(raw, { level: 6 }),
        br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }),
        contentType,
        cacheControl: isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache'
      });
    }
  }
  walk(distDir);
  return cache;
}

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    const assetCache = buildStaticAssetCache(distDir);
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      const urlPath = req.path === '/' ? '/index.html' : req.path;
      const hit = assetCache.get(urlPath);
      if (hit) {
        sendCompressedBuffer(req, res, hit.raw, hit.contentType, hit.cacheControl, hit);
        return;
      }
      next();
    });
    app.use(express.static(distDir, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (_req, res) => {
      const indexAsset = assetCache.get('/index.html');
      if (indexAsset) {
        sendCompressedBuffer(_req, res, indexAsset.raw, indexAsset.contentType, indexAsset.cacheControl, indexAsset);
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // In dev, mount Vite dev server middlewares
    // HMR is disabled to prevent WebSocket connection failures in iframe / middlewareMode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Hammad Industries Full-Stack MES Server listening on port ${PORT}`);
  });
}

startServer();

export { app };
