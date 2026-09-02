'use strict';

/**
 * TV Taboo engine — server-authoritative.
 *
 * Rules:
 *  - AI (TV) describes a keyword without using "taboo" words.
 *  - Players race to guess the word on their phones.
 *  - First correct guess scores a point.
 *  - Game plays 10 rounds; highest score wins.
 *
 * Interface:
 *   createGame(playerCount)          → engine
 *   engine.state()                   → full state payload
 *   engine.getCluePrompt()           → { keyword, tabooWords, prompt } for AI
 *   engine.setClue(text)             → void (set the AI-generated clue)
 *   engine.makeGuess(seat, text)     → { ok, correct, reason }
 *   engine.skipRound()               → void
 *   engine.nextRound()               → { ok, isGameOver }
 *   engine.isGameOver()              → bool
 *   engine.winner()                  → seat index | null
 */

const OpenAI = require('openai');

// ── AI client (DeepSeek, same pattern as 20 Questions) ──────────────────────
let deepseekClient = null;
try {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    deepseekClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
    console.log('[Taboo] DeepSeek AI enabled for clue generation');
  } else {
    console.warn('[Taboo] DEEPSEEK_API_KEY not set — using fallback clues');
  }
} catch (e) {
  console.warn('[Taboo] DeepSeek SDK init failed — using fallback clues');
}

// ── Word Bank ───────────────────────────────────────────────────────────────
// Each card: { keyword, tabooWords: [...], fallbackClue }
const CARD_BANK = [
  // ── Animals ──
  { keyword: 'Elephant', tabooWords: ['trunk', 'big', 'grey', 'Africa', 'tusks'], fallbackClue: 'This animal is the largest land mammal. It has large ears and a very long nose. It lives in herds and is known for excellent memory.' },
  { keyword: 'Penguin', tabooWords: ['ice', 'Antarctica', 'black', 'white', 'fly'], fallbackClue: 'This bird cannot take to the sky. It waddles on two feet and loves to swim. You might see them huddled together to stay warm in cold places.' },
  { keyword: 'Dolphin', tabooWords: ['ocean', 'swim', 'fish', 'smart', 'water'], fallbackClue: 'This friendly creature jumps out of the sea and makes clicking sounds. It is one of the most intelligent animals and loves to play.' },
  { keyword: 'Giraffe', tabooWords: ['tall', 'neck', 'Africa', 'spots', 'long'], fallbackClue: 'This animal can reach the highest leaves on trees. It has a unique pattern on its body and very slender legs. Babies are about 6 feet at birth.' },
  { keyword: 'Butterfly', tabooWords: ['wings', 'fly', 'caterpillar', 'colorful', 'insect'], fallbackClue: 'This creature goes through a magical transformation from one form to another inside a cocoon. It visits flowers and is beautiful to watch.' },
  { keyword: 'Kangaroo', tabooWords: ['jump', 'Australia', 'pouch', 'hop', 'joey'], fallbackClue: 'This animal carries its baby in a special pocket. It moves by bouncing on powerful back legs and has a strong tail for balance.' },
  { keyword: 'Octopus', tabooWords: ['tentacles', 'eight', 'ocean', 'ink', 'arms'], fallbackClue: 'This sea creature has a soft body and can squeeze through tiny spaces. It changes color to hide and is incredibly clever at solving puzzles.' },

  // ── Food ──
  { keyword: 'Pizza', tabooWords: ['cheese', 'Italian', 'slice', 'dough', 'oven'], fallbackClue: 'This popular meal is round and flat. You can add various toppings on it. It was made famous by a European country shaped like a boot.' },
  { keyword: 'Sushi', tabooWords: ['Japan', 'rice', 'fish', 'raw', 'roll'], fallbackClue: 'This dish comes in small bite-sized pieces. It originated in East Asia and is often served with soy sauce and wasabi on the side.' },
  { keyword: 'Chocolate', tabooWords: ['sweet', 'candy', 'brown', 'cocoa', 'dessert'], fallbackClue: 'This treat comes from beans that grow in tropical regions. It melts in your mouth and is the most popular gift on Valentine\'s Day.' },
  { keyword: 'Ice Cream', tabooWords: ['cold', 'frozen', 'cone', 'vanilla', 'scoop'], fallbackClue: 'This treat comes in many flavors and is best enjoyed on a hot day. It melts quickly if you don\'t eat it fast enough. Children love it.' },
  { keyword: 'Banana', tabooWords: ['yellow', 'fruit', 'peel', 'monkey', 'potassium'], fallbackClue: 'This food comes in a natural wrapper. It starts green and changes color when ripe. It is curved and very popular for breakfast.' },
  { keyword: 'Popcorn', tabooWords: ['corn', 'movie', 'butter', 'pop', 'kernel'], fallbackClue: 'This snack is made from a grain that explodes when heated. You commonly eat it while watching films. It can be salty or sweet.' },
  { keyword: 'Noodles', tabooWords: ['pasta', 'long', 'soup', 'Chinese', 'boil'], fallbackClue: 'This food is made from flour and comes in thin strands. You can stir-fry them or put them in broth. They are eaten with chopsticks in Asia.' },

  // ── Objects ──
  { keyword: 'Umbrella', tabooWords: ['rain', 'wet', 'cover', 'open', 'handle'], fallbackClue: 'You carry this when the weather looks bad. It opens up above your head to keep you dry. It folds down small enough to fit in a bag.' },
  { keyword: 'Glasses', tabooWords: ['eyes', 'see', 'lens', 'frame', 'wear'], fallbackClue: 'Many people put these on their face every morning. They help make the world look clear and sharp. Benjamin Franklin invented a special kind with two sections.' },
  { keyword: 'Camera', tabooWords: ['photo', 'picture', 'lens', 'click', 'shoot'], fallbackClue: 'This device captures moments in time. It has a button you press to freeze a scene forever. Modern phones have replaced the need for a separate one.' },
  { keyword: 'Piano', tabooWords: ['keys', 'music', 'play', 'instrument', 'black'], fallbackClue: 'This large piece of furniture makes beautiful sounds. Beethoven and Mozart were famous for performing on it. It has 88 parts you press.' },
  { keyword: 'Bicycle', tabooWords: ['ride', 'wheels', 'pedal', 'cycle', 'chain'], fallbackClue: 'This human-powered vehicle has two round parts and handlebars. You balance on it and move your feet in circles. It is eco-friendly transport.' },
  { keyword: 'Television', tabooWords: ['watch', 'screen', 'channel', 'show', 'remote'], fallbackClue: 'This electronic device sits in most living rooms. Families gather around it for entertainment. It displays moving images and sound.' },
  { keyword: 'Scissors', tabooWords: ['cut', 'paper', 'blade', 'sharp', 'handle'], fallbackClue: 'This tool has two parts joined in the middle that open and close. You use it to divide materials into pieces. It comes in many sizes.' },

  // ── Places ──
  { keyword: 'Library', tabooWords: ['books', 'read', 'quiet', 'borrow', 'shelves'], fallbackClue: 'This place is full of stories and knowledge. You can take items home but must return them. People whisper here out of respect for others.' },
  { keyword: 'Beach', tabooWords: ['sand', 'ocean', 'wave', 'sun', 'swim'], fallbackClue: 'People go to this place to relax on hot days. You can build castles here and listen to the sound of nature. Seashells are found here.' },
  { keyword: 'Hospital', tabooWords: ['doctor', 'sick', 'nurse', 'patient', 'medicine'], fallbackClue: 'People go to this building when they are unwell. It has many rooms with beds and special equipment. Ambulances bring people here.' },
  { keyword: 'Airport', tabooWords: ['plane', 'fly', 'travel', 'boarding', 'luggage'], fallbackClue: 'This is a busy place where journeys begin and end. You need a passport here for international trips. Large vehicles with wings depart from here.' },
  { keyword: 'Singapore', tabooWords: ['Merlion', 'island', 'Asia', 'city', 'garden'], fallbackClue: 'This tiny nation is one of the world\'s most modern places. It is famous for being very clean and having strict laws. Chewing gum was once banned here.' },

  // ── Activities / Concepts ──
  { keyword: 'Birthday', tabooWords: ['cake', 'candles', 'party', 'age', 'celebrate'], fallbackClue: 'This special day comes once a year for everyone. People sing a famous song and blow out flames. Gifts are exchanged and friends gather.' },
  { keyword: 'Wedding', tabooWords: ['marry', 'bride', 'ring', 'dress', 'ceremony'], fallbackClue: 'Two people in love have this special event. Guests come dressed nicely and there is dancing. Someone says "I do" at this occasion.' },
  { keyword: 'Cooking', tabooWords: ['food', 'kitchen', 'recipe', 'stove', 'chef'], fallbackClue: 'This activity turns raw ingredients into delicious meals. You need heat and various tools. Gordon Ramsay is famous for doing this on TV.' },
  { keyword: 'Football', tabooWords: ['ball', 'goal', 'kick', 'team', 'soccer'], fallbackClue: 'This is the world\'s most popular sport. Two groups of eleven compete on a grass field. The World Cup is held every four years for this.' },
  { keyword: 'Dancing', tabooWords: ['music', 'move', 'rhythm', 'steps', 'body'], fallbackClue: 'People do this activity at parties and celebrations. It involves moving to a beat. Styles include waltz, salsa, and hip-hop.' },
  { keyword: 'Fishing', tabooWords: ['fish', 'rod', 'bait', 'catch', 'water'], fallbackClue: 'This peaceful hobby requires patience and a long stick with a string. You sit and wait by a lake or river. The goal is to hook something.' },
  { keyword: 'Gardening', tabooWords: ['plant', 'flower', 'soil', 'grow', 'water'], fallbackClue: 'This outdoor hobby makes your yard beautiful. You dig in the earth and nurture living things. It requires seeds, sunlight, and patience.' },

  // ── Famous things ──
  { keyword: 'Eiffel Tower', tabooWords: ['Paris', 'France', 'iron', 'tall', 'tower'], fallbackClue: 'This famous landmark was built for a world exhibition in 1889. It was meant to be temporary. Millions visit it each year and it lights up at night.' },
  { keyword: 'Great Wall', tabooWords: ['China', 'wall', 'long', 'ancient', 'stone'], fallbackClue: 'This massive structure stretches thousands of miles. It was built over centuries to keep invaders out. It is visible from high above the earth.' },
  { keyword: 'Mona Lisa', tabooWords: ['painting', 'smile', 'Leonardo', 'art', 'Louvre'], fallbackClue: 'This is perhaps the most famous piece of artwork ever created. The woman in it has a mysterious expression. It hangs behind glass in a museum.' },
  { keyword: 'Olympics', tabooWords: ['sports', 'gold', 'medal', 'athletes', 'games'], fallbackClue: 'This global event happens every four years. Countries send their best performers to compete. It has summer and winter editions. Five rings represent it.' },
  { keyword: 'Titanic', tabooWords: ['ship', 'sink', 'iceberg', 'ocean', 'movie'], fallbackClue: 'This vessel was called unsinkable but met a tragic fate on its very first voyage in 1912. A famous 1997 film told its love story.' },
  { keyword: 'Rainbow', tabooWords: ['colors', 'rain', 'sky', 'arc', 'sun'], fallbackClue: 'This natural phenomenon appears after a storm. It has seven bands arranged in a curved shape. A legend says there is a pot of gold at its end.' },

  // ── More everyday items ──
  { keyword: 'Toothbrush', tabooWords: ['teeth', 'brush', 'mouth', 'clean', 'paste'], fallbackClue: 'You use this small tool twice a day, morning and night. It keeps your smile healthy and bright. Dentists always remind you to replace it regularly.' },
  { keyword: 'Pillow', tabooWords: ['sleep', 'bed', 'soft', 'head', 'rest'], fallbackClue: 'You lay on this every night. It is stuffed with comfortable material. Kids sometimes have fights with these at sleepovers.' },
  { keyword: 'Clock', tabooWords: ['time', 'hands', 'tick', 'hour', 'watch'], fallbackClue: 'This device tells you something important about your day. It hangs on walls or sits on tables. Big Ben in London is a famous one.' },
  { keyword: 'Passport', tabooWords: ['travel', 'country', 'identity', 'visa', 'photo'], fallbackClue: 'This small booklet is essential for crossing borders. It contains your personal details and a picture. You show it at immigration.' },
  { keyword: 'Newspaper', tabooWords: ['read', 'news', 'paper', 'print', 'article'], fallbackClue: 'People used to get this delivered to their door every morning. It contains information about what happened yesterday. It is becoming rare in the digital age.' },
  { keyword: 'Candle', tabooWords: ['fire', 'light', 'wax', 'flame', 'burn'], fallbackClue: 'This object creates a warm glow in a dark room. It slowly gets smaller as it is used. People put them on birthday treats and make a wish.' },
  { keyword: 'Mirror', tabooWords: ['reflection', 'glass', 'see', 'face', 'look'], fallbackClue: 'Snow White\'s queen talked to one every day. It shows an exact copy of whatever is in front of it. Every bathroom has one.' },
  { keyword: 'Kite', tabooWords: ['fly', 'wind', 'string', 'sky', 'paper'], fallbackClue: 'Benjamin Franklin used one in a famous experiment with lightning. Children love taking this to open fields on breezy days. It soars high above.' },
];

// Shuffle array (Fisher-Yates)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate an AI clue for a Taboo card.
 */
async function generateAIClue(keyword, tabooWords) {
  if (!deepseekClient) return null;

  try {
    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: 'You are a clue-giver in a Taboo word game for seniors. Give clear, friendly, helpful descriptions.'
        },
        {
          role: 'user',
          content: `Describe the word "${keyword}" so someone can guess it.

RULES:
1. You MUST NOT use any of these taboo words (or variations/plurals of them): ${tabooWords.join(', ')}
2. You MUST NOT say the keyword itself or any part of it
3. Give 2-3 clear sentences that help someone guess the word
4. Use simple language suitable for seniors
5. Be descriptive and give good hints
6. Do NOT start with "This is" or "It is" — vary your sentence openings`
        }
      ]
    });

    const clue = (response.choices[0]?.message?.content || '').trim();
    if (!clue) return null;

    // Verify the AI didn't accidentally use taboo words
    const lower = clue.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    if (lower.includes(keywordLower)) return null; // leaked keyword

    return clue;
  } catch (e) {
    console.warn('[Taboo] AI clue generation failed:', e.message);
    return null;
  }
}

// ── Game Factory ────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 10;

function createGame(playerCount) {
  const cards = shuffle([...CARD_BANK]).slice(0, TOTAL_ROUNDS);
  const scores = new Array(playerCount).fill(0);
  let round = 0;        // current round index (0-based)
  let phase = 'clue';   // 'clue' (AI describing) | 'guessing' | 'reveal' | 'done'
  let currentClue = null;
  let roundWinner = null;
  let guessLog = [];     // [{seat, name, text, correct}] for current round
  let clueReady = false;

  function currentCard() {
    return cards[round] || null;
  }

  function state() {
    const card = currentCard();
    return {
      round: round + 1,
      totalRounds: TOTAL_ROUNDS,
      phase,
      keyword: phase === 'reveal' || phase === 'done' ? (card ? card.keyword : null) : null,
      tabooWords: card ? card.tabooWords : [],
      clue: currentClue,
      clueReady,
      scores: [...scores],
      roundWinner,
      guessLog: guessLog.map(g => ({ seat: g.seat, name: g.name, text: g.text, correct: g.correct })),
    };
  }

  function getCluePrompt() {
    const card = currentCard();
    if (!card) return null;
    return {
      keyword: card.keyword,
      tabooWords: card.tabooWords,
    };
  }

  async function generateClue() {
    const card = currentCard();
    if (!card) return;

    const aiClue = await generateAIClue(card.keyword, card.tabooWords);
    currentClue = aiClue || card.fallbackClue;
    clueReady = true;
    phase = 'guessing';
  }

  function setClue(text) {
    currentClue = text;
    clueReady = true;
    phase = 'guessing';
  }

  function makeGuess(seat, text) {
    if (phase !== 'guessing') return { ok: false, reason: 'Not in guessing phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid player' };

    const card = currentCard();
    if (!card) return { ok: false, reason: 'No card' };

    const guess = text.trim();
    if (!guess) return { ok: false, reason: 'Empty guess' };

    const correct = guess.toLowerCase() === card.keyword.toLowerCase();

    guessLog.push({ seat, name: '', text: guess, correct });

    if (correct) {
      scores[seat]++;
      roundWinner = seat;
      phase = 'reveal';
      return { ok: true, correct: true };
    }

    return { ok: true, correct: false };
  }

  function skipRound() {
    phase = 'reveal';
    roundWinner = null;
  }

  function nextRound() {
    round++;
    if (round >= TOTAL_ROUNDS) {
      phase = 'done';
      return { ok: true, isGameOver: true };
    }
    phase = 'clue';
    currentClue = null;
    clueReady = false;
    roundWinner = null;
    guessLog = [];
    return { ok: true, isGameOver: false };
  }

  function isGameOver() {
    return phase === 'done';
  }

  function winner() {
    if (!isGameOver()) return null;
    let maxScore = -1;
    let winSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (scores[i] > maxScore) {
        maxScore = scores[i];
        winSeat = i;
      }
    }
    // Check for tie
    const tiedPlayers = scores.filter(s => s === maxScore);
    if (tiedPlayers.length > 1) return null; // tie
    return winSeat;
  }

  return { state, getCluePrompt, generateClue, setClue, makeGuess, skipRound, nextRound, isGameOver, winner };
}

module.exports = { createGame };
