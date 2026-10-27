import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  const gameDataDir = path.join(__dirname, 'game/data');
  const playstationDir = path.join(__dirname, 'Playstation');

  // API endpoint: Scan game/data for all JSON files
  app.get('/api/games', (req, res) => {
    try {
      if (!fs.existsSync(gameDataDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(gameDataDir);
      const gamesMap = new Map();

      for (const file of files) {
        if (!file.endsWith('.json') || file === 'manifest.json') continue;
        const filePath = path.join(gameDataDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;

          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const gameName = content.game || content.name || file.replace(/\.json$/, '');
          const gameId = content.gameId || gameName.replace(/[^a-zA-Z0-9]/g, '');
          const commId = content.psn_communication_id || content.commId || '';
          
          if (!gamesMap.has(gameId)) {
            gamesMap.set(gameId, {
              id: gameId,
              name: gameName,
              file: `/game/data/${file}`,
              commId: commId,
              activeMission: content.activeMission || '',
              trophiesCount: Array.isArray(content.trophies_and_achievements) ? content.trophies_and_achievements.length : 0,
              collectiblesCount: content.collectibles ? Object.keys(content.collectibles).length : 0,
              lastModified: stat.mtimeMs
            });
          }
        } catch (e) {
          console.warn(`[API /api/games] Error reading ${file}:`, e);
        }
      }

      const list = Array.from(gamesMap.values());
      // Update manifest.json on disk whenever scanned
      try {
        fs.writeFileSync(path.join(gameDataDir, 'manifest.json'), JSON.stringify(list, null, 2), 'utf8');
        const publicDir = path.join(__dirname, 'public/game/data');
        if (fs.existsSync(publicDir)) {
          fs.writeFileSync(path.join(publicDir, 'manifest.json'), JSON.stringify(list, null, 2), 'utf8');
        }
      } catch (err) {}

      res.json(list);
    } catch (err: any) {
      console.error('[API /api/games error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve static game data and Playstation folders directly
  app.use('/game/data', express.static(gameDataDir));
  app.use('/Playstation', express.static(playstationDir));

  // Mount Vite in middleware mode
  const vite = await createViteServer({
    server: { 
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {}
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Universal Companion Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
