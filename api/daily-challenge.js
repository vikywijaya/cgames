import { buildDailyGames, gameIconFilename } from '../src/shared/gameData.js';

export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'fail', message: 'Method not allowed' });
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
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

    return res.status(200).json({ status: 'success', data });
  } catch (err) {
    return res.status(500).json({ status: 'fail', message: 'Not available' });
  }
}
