import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const BLOCKED_FILES = new Set([
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/metadata.json',
]);

export function createApp() {
  const app = express();

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

if (process.argv[1] === __filename) {
  const app = createApp();
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}
