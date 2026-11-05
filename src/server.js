import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db.js';
import { apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema & seeds
initDatabase();

const app = express();
const PORT = process.env.PORT || 3050;

app.use(express.json());

// Disable all caching for local shop-floor execution (prevents stale CSS/JS)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0
}));

// Mount API routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Gloves Packing Execution System running at:`);
    console.log(`-> Switcher / Hub:     http://localhost:${PORT}/`);
    console.log(`-> Store Keeper Portal: http://localhost:${PORT}/store.html`);
    console.log(`-> Packing Hall Portal: http://localhost:${PORT}/packing.html`);
    console.log(`=======================================================`);
  });
}

export { app };
