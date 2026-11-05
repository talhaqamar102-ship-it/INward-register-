import http from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './src/db.js';
import { apiRouter } from './src/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database schema, WAL mode & seed records
initDatabase();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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
    console.log(`Meridian Works Full-Stack MES Server listening on port ${PORT}`);
  });
}

startServer();

export { app };
