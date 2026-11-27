import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';

const BLOCKED_FILES = new Set([
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/metadata.json',
  '/memo-spike-physics.test.mjs',
  '/calendar-projects-logic.test.mjs',
  '/progress-system-logic.test.mjs',
  '/routines-automation-logic.test.mjs',
  '/habit-task-link-logic.test.mjs',
  '/carrom-braindump-logic.test.mjs',
  '/task-batch-swipe-logic.test.mjs',
]);

function readFirebaseWebConfig() {
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Unable to read firebase-applet-config.json:', err?.message || err);
    return null;
  }
}

export function createApp() {
  const app = express();

  app.get('/api/client-config', (_req, res) => {
    const mapsApiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      '';
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      mapsApiKey,
      hasMapsKey: Boolean(mapsApiKey),
      firebaseConfig: readFirebaseWebConfig(),
    });
  });

  app.use((req, res, next) => {
    const normalized = path.posix.normalize(req.path);
    if (
      BLOCKED_FILES.has(normalized) ||
      normalized.startsWith('/node_modules') ||
      normalized.startsWith('/.')
    ) {
      return res.status(404).send('Not Found');
    }
    next();
  });

  app.use(express.static(__dirname, { dotfiles: 'ignore' }));

  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.sendFile(path.join(__dirname, 'index.html'));
    }
    next();
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}
