// Vite plugin to serve Vercel-style API routes during local development.
// In production, Vercel handles these routes via serverless functions.

import { buildDailyGames, gameIconFilename } from './src/shared/gameData.js';

export function devApiPlugin() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/daily-challenge', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          return res.end();
        }

        if (req.method !== 'GET') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ status: 'fail', message: 'Method not allowed' }));
        }

        try {
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host;
          const baseUrl = `${protocol}://${host}`;

          const games = buildDailyGames();

          const data = games.map((game, index) => ({
            id:          index + 1,
            name:        game.title,
            description: game.description,
            domain:      game.domain,
            category:    game.categoryName,
            icon_url:    `${baseUrl}/games/${gameIconFilename(game.id)}`,
            url:         `${baseUrl}/${game.id}`,
            is_complete: false,
          }));

          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'fail', message: 'Not available' }));
        }
      });
    },
  };
}
