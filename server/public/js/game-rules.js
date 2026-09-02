'use strict';
/* ── Game Rules Modal ───────────────────────────────────────────────────────
   Adds a ? button to every game page's top bar and shows a rules modal.
   Usage: include this script in any game HTML page. It auto-detects the
   game type from the URL path and shows the correct rules.
   ───────────────────────────────────────────────────────────────────────── */

const GAME_RULES = {
  // ── TV / TV-host screens ─────────────────────────────────────────────────
  'tv-math-cross': {
    title: '🧮 Math Cross',
    rules: [
      { icon: '🔢', title: 'Fill the Grid', desc: 'Place numbers from the tray into the empty slots so every equation on the board is correct.' },
      { icon: '➕', title: 'Check the Signs', desc: 'Each row and column forms an equation (+, −, ×). The numbers shown are fixed — only the blank slots need filling.' },
      { icon: '🏁', title: 'Race to Finish', desc: 'First player to complete their grid correctly wins the round and earns 3 pts. 2nd = 2 pts, 3rd = 1 pt.' },
      { icon: '🏆', title: '3 Rounds', desc: 'Play 3 rounds. Highest total score wins the match!' },
    ]
  },
  'tv-wordle': {
    title: '🟩 Wordle Race',
    rules: [
      { icon: '🔤', title: 'Guess the Word', desc: 'Type a 5-letter word on your phone and submit. You have 6 attempts.' },
      { icon: '🟩', title: 'Green = Correct', desc: 'Letter is in the right position.' },
      { icon: '🟨', title: 'Yellow = Wrong Spot', desc: 'Letter is in the word but in the wrong position.' },
      { icon: '⬛', title: 'Grey = Not in Word', desc: 'This letter is not in the word at all.' },
      { icon: '🏁', title: 'Race!', desc: 'First player to guess the word wins. All grids are shown on the TV so everyone can watch each other!' },
    ]
  },
  'tv-bingo': {
    title: '🎱 Bingo',
    rules: [
      { icon: '🃏', title: 'Your Card', desc: 'Each player has a unique 5×5 bingo card on their phone.' },
      { icon: '📣', title: 'Numbers Called', desc: 'The TV automatically calls numbers at intervals. Tap the number on your card if you have it.' },
      { icon: '🎯', title: 'Bingo!', desc: 'Complete a full row, column, or diagonal to shout BINGO! Tap the Bingo button on your phone.' },
      { icon: '🏆', title: 'Win', desc: 'First player to call Bingo wins the round!' },
    ]
  },
  'tv-higher-lower': {
    title: '🃏 Higher or Lower',
    rules: [
      { icon: '🃏', title: 'A Card is Revealed', desc: 'The TV shows a playing card.' },
      { icon: '📱', title: 'Your Guess', desc: 'Tap "Higher" or "Lower" on your phone — will the next card be higher or lower?' },
      { icon: '⚡', title: 'Speed Wins', desc: 'First correct answer earns the point. Wrong answer = no point for that round.' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Play through the whole deck. Most correct guesses wins!' },
    ]
  },
  'tv-boggle': {
    title: '🔤 TV Boggle',
    rules: [
      { icon: '🔤', title: 'Word Hunt', desc: 'Find as many words as possible in the 4×4 letter grid shown on the TV.' },
      { icon: '📱', title: 'Type on Your Phone', desc: 'Type words on your phone. Letters must be adjacent on the grid (horizontally, vertically, or diagonally).' },
      { icon: '📏', title: 'Longer = More Points', desc: '3 letters = 1 pt, 4 = 2 pts, 5 = 3 pts, and so on. Longer words score more!' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'The player with the highest score when the timer ends wins!' },
    ]
  },
  'tv-quick-maths': {
    title: '⚡ Quick Maths',
    rules: [
      { icon: '🧮', title: 'Solve Fast', desc: 'A maths equation appears on the TV. Be the first to tap the correct answer on your phone.' },
      { icon: '⚡', title: 'Speed Bonus', desc: 'Faster answers earn more points. Wrong tap = penalty!' },
      { icon: '🔄', title: 'Many Rounds', desc: 'Questions keep coming. Stay sharp and keep tapping!' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'The player with the highest total score wins!' },
    ]
  },
  'tv-daily-arithmetic': {
    title: '🔢 Daily Arithmetic',
    rules: [
      { icon: '🧮', title: 'Solve the Equation', desc: 'A maths problem appears on the TV. Type your answer on the phone keyboard.' },
      { icon: '🏁', title: 'First Correct Wins', desc: 'First player to submit the correct answer earns the most points.' },
      { icon: '📈', title: 'Gets Harder', desc: 'Questions increase in difficulty as the game progresses.' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest total score after all rounds wins!' },
    ]
  },
  'tv-missing-number': {
    title: '🔍 Missing Number',
    rules: [
      { icon: '🔢', title: 'Find the Pattern', desc: 'A number sequence is shown with one number missing. Figure out the pattern!' },
      { icon: '📱', title: 'Tap Your Answer', desc: 'Choose the correct missing number from the options on your phone.' },
      { icon: '⚡', title: 'Speed Matters', desc: 'Faster correct answers earn more points.' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest score after all rounds wins!' },
    ]
  },
  'tv-number-sort': {
    title: '🔢 Number Sort',
    rules: [
      { icon: '🔢', title: 'Tap in Order', desc: 'Numbers appear on your phone. Tap them from smallest to largest as fast as possible.' },
      { icon: '⚡', title: 'Fastest Wins', desc: 'The player who sorts all numbers in the shortest time wins the round.' },
      { icon: '❌', title: 'No Mistakes', desc: 'Tapping the wrong number resets your progress for that round.' },
      { icon: '🏆', title: 'Best Time Wins', desc: 'Fastest total time across all rounds wins!' },
    ]
  },
  'tv-racing': {
    title: '🏎️ RC Racing',
    rules: [
      { icon: '🏎️', title: 'Race Your Car', desc: 'Tilt or tap on your phone to steer your car along the track shown on the TV.' },
      { icon: '🏁', title: 'First to Finish', desc: 'Complete the required number of laps before your opponents.' },
      { icon: '⚡', title: 'Stay on Track', desc: 'Going off track slows you down!' },
      { icon: '🏆', title: 'First Place Wins', desc: 'Complete all laps first to win the race!' },
    ]
  },
  'tv-20-questions': {
    title: '❓ 20 Questions',
    rules: [
      { icon: '🤔', title: 'Guess the Secret', desc: 'The TV displays a secret word or person. Players ask yes/no questions to figure it out.' },
      { icon: '📱', title: 'Ask on Your Phone', desc: 'Choose a yes/no question from your phone. The host answers on the TV.' },
      { icon: '💡', title: 'Make Your Guess', desc: 'When you think you know the answer, tap "Guess" and type your answer.' },
      { icon: '🏆', title: '20 Questions Max', desc: 'You have 20 questions total as a team. First correct guess wins!' },
    ]
  },
  'tv-taboo': {
    title: '🚫 Taboo',
    rules: [
      { icon: '🎙️', title: 'Describe the Word', desc: 'One player sees a secret word on the TV and must describe it to teammates.' },
      { icon: '🚫', title: 'Avoid Taboo Words', desc: 'Certain words are forbidden — you cannot say them while describing!' },
      { icon: '📱', title: 'Guess on Your Phone', desc: 'Other players type their guesses on their phones.' },
      { icon: '🏆', title: 'Team Points', desc: 'Each correct guess before the timer earns a point. Most points wins!' },
    ]
  },
  'tv-sumix': {
    title: '➕ Sumix',
    rules: [
      { icon: '🔢', title: 'Place Numbers', desc: 'Tap a number tile on your phone and place it in a cell on the shared grid.' },
      { icon: '➕', title: 'Hit the Target Sums', desc: 'Each row and column must add up to the target sum shown at the edge.' },
      { icon: '🤝', title: 'Cooperative', desc: 'Players work together — anyone can place anywhere, but coordinate to solve the puzzle!' },
      { icon: '🏆', title: 'Solve Together', desc: 'Complete the grid as a team before time runs out!' },
    ]
  },
  'tv-maze': {
    title: '🌀 Maze',
    rules: [
      { icon: '🕹️', title: 'Navigate the Maze', desc: 'Use the D-pad or swipe on your phone to move your character through the maze.' },
      { icon: '🏁', title: 'Reach the Exit', desc: 'Find the exit before your opponents do.' },
      { icon: '⚡', title: 'Fastest Path Wins', desc: 'The player who reaches the exit in the shortest time wins the round.' },
      { icon: '🏆', title: '3 Rounds', desc: 'Best total time across 3 mazes wins the match!' },
    ]
  },
  'tv-lumeno': {
    title: '💡 Lumeno',
    rules: [
      { icon: '💡', title: 'Light Up the Board', desc: 'The TV shows a pattern of lit cells. Your job is to recreate it.' },
      { icon: '📱', title: 'Tap to Toggle', desc: 'Tap cells on your phone to toggle them on or off.' },
      { icon: '🏁', title: 'Match the Pattern', desc: 'Match the displayed pattern exactly to complete the puzzle.' },
      { icon: '🏆', title: 'Fastest Wins', desc: 'First player to match the pattern correctly wins the round!' },
    ]
  },
  'tv-memory-match': {
    title: '🃏 Memory Match',
    rules: [
      { icon: '🃏', title: 'Flip Cards', desc: 'Cards are placed face-down on the TV. Tap to flip two cards at a time.' },
      { icon: '🧠', title: 'Find the Pairs', desc: 'Remember where each card is. Match two cards with the same image to clear them.' },
      { icon: '📱', title: 'Tap on Your Phone', desc: 'Tap the position of the card you want to flip on your phone.' },
      { icon: '🏆', title: 'Most Pairs Wins', desc: 'Player who collects the most matching pairs wins!' },
    ]
  },
  'tv-pattern-sequence': {
    title: '🔁 Pattern Sequence',
    rules: [
      { icon: '👁️', title: 'Watch the Pattern', desc: 'The TV flashes a sequence of colours or shapes. Watch carefully!' },
      { icon: '📱', title: 'Repeat the Sequence', desc: 'Tap the same sequence on your phone in the correct order.' },
      { icon: '📈', title: 'Gets Longer', desc: 'Each round the sequence gets one step longer. How far can you go?' },
      { icon: '🏆', title: 'Most Rounds Wins', desc: 'Last player to make a mistake wins!' },
    ]
  },
  'tv-pipe-puzzle': {
    title: '🚰 Pipe Puzzle',
    rules: [
      { icon: '🚰', title: 'Connect the Pipes', desc: 'Rotate pipe segments to create a connected path from source to destination.' },
      { icon: '📱', title: 'Tap to Rotate', desc: 'Tap a pipe segment on your phone to rotate it 90°.' },
      { icon: '💧', title: 'Let the Water Flow', desc: 'Once all pipes are connected, water flows from start to end to complete the puzzle.' },
      { icon: '🏆', title: 'Fastest Solve Wins', desc: 'First player to connect all pipes wins the round!' },
    ]
  },
  'tv-ring-sort': {
    title: '💍 Ring Sort',
    rules: [
      { icon: '💍', title: 'Sort the Rings', desc: 'Rings of different colours are stacked on pegs. Sort them so each peg has rings of one colour only.' },
      { icon: '📱', title: 'Move on Your Phone', desc: 'Tap a peg to pick up the top ring, then tap another peg to place it.' },
      { icon: '📏', title: 'Stack Rules', desc: 'You can only place a ring on top of a larger ring or an empty peg.' },
      { icon: '🏆', title: 'Fastest Solve Wins', desc: 'First player to sort all rings wins!' },
    ]
  },
  'tv-shopping-list': {
    title: '🛒 Shopping List',
    rules: [
      { icon: '📋', title: 'Study the List', desc: 'The TV shows a shopping list for a few seconds. Memorise everything on it!' },
      { icon: '🛒', title: 'Find the Items', desc: 'Then items appear mixed with distractors. Tap only the items from the original list.' },
      { icon: '❌', title: 'Avoid Wrong Items', desc: 'Tapping something not on the list costs you points.' },
      { icon: '🏆', title: 'Most Correct Wins', desc: 'Highest score after all rounds wins!' },
    ]
  },
  'tv-sokoban': {
    title: '📦 Sokoban',
    rules: [
      { icon: '📦', title: 'Push the Boxes', desc: 'Move the character to push boxes onto the target spots (marked with ×).' },
      { icon: '🕹️', title: 'Swipe to Move', desc: 'Swipe on your phone to move the character up, down, left, or right.' },
      { icon: '🚫', title: 'No Pulling', desc: 'You can only push boxes, not pull them. Plan your moves carefully!' },
      { icon: '🏆', title: 'Fewest Moves Wins', desc: 'Place all boxes on targets using the fewest moves to win!' },
    ]
  },
  'tv-speed-tap': {
    title: '👆 Speed Tap',
    rules: [
      { icon: '👆', title: 'Tap as Fast as You Can', desc: 'A target appears on screen. Tap it on your phone as fast as possible!' },
      { icon: '🎯', title: 'Accuracy Matters', desc: 'Tap the right target only — wrong taps cost you time.' },
      { icon: '⚡', title: 'Speed Wins', desc: 'Most taps in the time limit wins each round.' },
      { icon: '🏆', title: 'Most Taps Wins', desc: 'Highest total score across all rounds wins the match!' },
    ]
  },
  'tv-stroop-colour': {
    title: '🎨 Stroop Colour',
    rules: [
      { icon: '🎨', title: 'Colour, Not the Word', desc: 'A colour name is shown in a different ink colour (e.g. "RED" written in blue).' },
      { icon: '📱', title: 'Tap the Ink Colour', desc: 'Tap the actual colour of the text, not what the word says. Tricky!' },
      { icon: '⚡', title: 'Fast and Correct', desc: 'Faster correct answers score more. Wrong answers = penalty.' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest score after all rounds wins!' },
    ]
  },
  'tv-word-recall': {
    title: '📝 Word Recall',
    rules: [
      { icon: '👁️', title: 'Study the Words', desc: 'A list of words appears on the TV. You have a few seconds to memorise them all.' },
      { icon: '📱', title: 'Recall on Your Phone', desc: 'After the words disappear, type as many as you can remember on your phone.' },
      { icon: '✅', title: 'Exact Match', desc: 'Each correctly recalled word earns a point. Spelling must be close!' },
      { icon: '🏆', title: 'Most Words Wins', desc: 'Player who recalls the most words wins the round!' },
    ]
  },
  'tv-colour-memory': {
    title: '🎨 Colour Memory',
    rules: [
      { icon: '👁️', title: 'Watch the Sequence', desc: 'Colour tiles flash on the TV one at a time. Watch carefully and memorise the order!' },
      { icon: '📱', title: 'Tap in Order', desc: 'Once the sequence is done, tap the same colours in the same order on your phone.' },
      { icon: '📈', title: 'Gets Longer', desc: 'Each round adds one more colour to the sequence. How far can you go?' },
      { icon: '🏆', title: 'First to Finish Wins', desc: 'First player to tap the complete sequence correctly wins the round!' },
    ]
  },
  'tv-face-memory': {
    title: '👤 Face Memory',
    rules: [
      { icon: '👀', title: 'Study the Faces', desc: 'The TV shows several faces with their names. You have a limited time to memorise them!' },
      { icon: '❓', title: 'Who is This?', desc: 'Then one face appears on the TV without a name. Which person is it?' },
      { icon: '📱', title: 'Tap the Name', desc: 'Choose the correct name from 4 options on your phone as fast as possible.' },
      { icon: '🏆', title: 'First Correct Wins', desc: 'First player to tap the right name earns the point for that face!' },
    ]
  },
  'cooking': {
    title: '🍳 Kitchen Rush',
    rules: [
      { icon: '🍽️', title: 'Watch the Tables', desc: 'Customers sit at tables on the TV screen. Their mood shows urgency: 😊 patient → 😡 furious. Serve them before they leave!' },
      { icon: '👨‍🍳', title: 'Head Chef Hints', desc: 'The Head Chef tells you which table needs help most. Listen up and grab the recommended task!' },
      { icon: '🎮', title: 'Mini-Games', desc: '🔪 Chop: tap fast!  🥄 Stir: swipe in circles!  👆 Flip: hit the green zone at the right moment!' },
      { icon: '🤝', title: 'Work Together!', desc: 'Each player can handle a different task at the same time. Coordinate with your team!' },
      { icon: '🏆', title: 'Serve 8 Tables', desc: 'Complete all 3 steps of an order → table served! First team to serve 8 tables wins!' },
    ]
  },

  // ── Mobile / player screens ───────────────────────────────────────────────
  'wordle-play': {
    title: '🟩 Wordle Race',
    rules: [
      { icon: '🔤', title: 'Guess the 5-Letter Word', desc: 'Type any valid 5-letter word and press Enter to submit your guess.' },
      { icon: '🟩', title: 'Green Tile', desc: 'Correct letter in the correct position.' },
      { icon: '🟨', title: 'Yellow Tile', desc: 'Letter is in the word but in the wrong position.' },
      { icon: '⬛', title: 'Grey Tile', desc: 'Letter is not in the word at all.' },
      { icon: '🏁', title: 'Race!', desc: 'You have 6 tries. First player to solve the word wins the match!' },
    ]
  },
  'math-cross-play': {
    title: '🧮 Math Cross',
    rules: [
      { icon: '🔢', title: 'Fill the Blanks', desc: 'Pick a number from the tray at the bottom, then tap an empty slot in the grid to place it.' },
      { icon: '➕', title: 'Make Equations Work', desc: 'Every row and column must form a correct equation. Fixed numbers and operators are already placed.' },
      { icon: '↩️', title: 'Remove a Mistake', desc: 'Tap a filled slot to remove that number and put it back in the tray.' },
      { icon: '🏁', title: 'Finish First!', desc: 'First to complete the correct grid wins 3 pts. 2nd = 2 pts, 3rd = 1 pt. 3 rounds total.' },
    ]
  },
  'tv-bingo-play': {
    title: '🎱 Bingo',
    rules: [
      { icon: '🃏', title: 'Your Bingo Card', desc: 'You have a 5×5 card with random numbers. Numbers are called automatically on the TV.' },
      { icon: '📱', title: 'Mark Your Numbers', desc: 'When a number is called that matches your card, tap it to mark it.' },
      { icon: '🎯', title: 'Complete a Line', desc: 'Get 5 in a row — horizontally, vertically, or diagonally — to win.' },
      { icon: '📣', title: 'Call Bingo!', desc: 'Tap the BINGO button as soon as you complete a line. First to call wins!' },
    ]
  },
  'tv-higher-lower-play': {
    title: '🃏 Higher or Lower',
    rules: [
      { icon: '🃏', title: 'Watch the Card', desc: 'A card is revealed on the TV screen.' },
      { icon: '📱', title: 'Higher or Lower?', desc: 'Tap "Higher" if the next card will be higher in value, or "Lower" if it will be lower.' },
      { icon: '⚡', title: 'Be First and Correct', desc: 'First correct answer earns the point. Wrong answer = no points.' },
      { icon: '🏆', title: 'Most Correct Wins', desc: 'Highest score after the whole deck wins!' },
    ]
  },
  'tv-boggle-play': {
    title: '🔤 TV Boggle',
    rules: [
      { icon: '🔤', title: 'Find Words', desc: 'Look at the 4×4 grid on the TV and type as many valid words as you can find.' },
      { icon: '🔗', title: 'Adjacent Letters Only', desc: 'Each letter in your word must be adjacent (touching) to the next — horizontally, vertically, or diagonally.' },
      { icon: '📏', title: 'Longer = More Points', desc: '3 letters = 1 pt, 4 = 2 pts, 5+ = bonus points. Rare words score extra!' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest score when the timer runs out wins!' },
    ]
  },
  'tv-racing-play': {
    title: '🏎️ RC Racing',
    rules: [
      { icon: '🏎️', title: 'Your Car on the TV', desc: 'Your car appears on the big screen. Control it from your phone!' },
      { icon: '🕹️', title: 'Tilt or Tap', desc: 'Tilt your phone left/right to steer, or use the on-screen buttons.' },
      { icon: '🏁', title: 'Complete the Laps', desc: 'Race around the track and complete all laps as fast as possible.' },
      { icon: '🏆', title: 'First to Finish Wins', desc: 'First car to cross the finish line wins the race!' },
    ]
  },
  'tv-20-questions-play': {
    title: '❓ 20 Questions',
    rules: [
      { icon: '🤔', title: 'Guess the Secret Word', desc: 'The host knows a secret word. Ask yes/no questions to figure out what it is.' },
      { icon: '📱', title: 'Pick a Question', desc: 'Choose a question from the list on your phone. Everyone asks together.' },
      { icon: '💡', title: 'Ready to Guess?', desc: 'When you think you know, tap "Guess" and type your answer.' },
      { icon: '🏆', title: '20 Questions Total', desc: 'Your team has 20 questions. First to guess correctly wins!' },
    ]
  },
  'tv-taboo-play': {
    title: '🚫 Taboo',
    rules: [
      { icon: '🎙️', title: 'Describe Without Taboos', desc: 'The clue-giver describes the secret word without saying any of the forbidden (taboo) words.' },
      { icon: '📱', title: 'Type Your Guess', desc: 'If you are guessing, type your answers on the phone keyboard.' },
      { icon: '🚫', title: 'Watch Out!', desc: 'If the clue-giver says a taboo word, the buzzer sounds and that round is lost!' },
      { icon: '🏆', title: 'Most Correct Wins', desc: 'Get as many correct guesses as possible before the timer ends!' },
    ]
  },
  'tv-sumix-play': {
    title: '➕ Sumix',
    rules: [
      { icon: '🔢', title: 'Place a Number', desc: 'Tap a number tile from your tray, then tap an empty cell on the shared grid to place it.' },
      { icon: '➕', title: 'Row & Column Sums', desc: 'Each row and column must add up to the target sum shown at its edge.' },
      { icon: '🤝', title: 'Work as a Team', desc: 'All players share the same grid. Coordinate your placements to solve it together!' },
      { icon: '🏆', title: 'Complete the Grid', desc: 'Fill all cells correctly before time runs out to win!' },
    ]
  },
  'tv-cooking-play': {
    title: '🍳 Kitchen Rush',
    rules: [
      { icon: '📺', title: 'Watch the TV', desc: 'Tables with customers appear on the TV screen. Check which table has the most urgent order (😡 = most urgent).' },
      { icon: '📋', title: 'Pick a Task', desc: 'Tap a task card on your phone to claim it. Each order has up to 3 steps: Chop, Stir, Flip.' },
      { icon: '🎮', title: 'Complete the Mini-Game', desc: '🔪 Chop: tap rapidly!  🥄 Stir: swipe in circles!  👆 Flip: tap when the marker hits the green zone!' },
      { icon: '🤝', title: 'Coordinate', desc: 'Multiple players can each handle a different task at the same time. Teamwork is key!' },
      { icon: '🏆', title: 'Serve 8 Tables to Win!', desc: 'Finish all steps of an order to serve the table. Serve 8 tables before time runs out!' },
    ]
  },
  'quick-maths-play': {
    title: '⚡ Quick Maths',
    rules: [
      { icon: '👀', title: 'Watch the TV', desc: 'A maths equation appears on the TV screen.' },
      { icon: '📱', title: 'Tap the Answer', desc: 'Choose the correct answer from the options shown on your phone.' },
      { icon: '⚡', title: 'Be First!', desc: 'Fastest correct tap wins the point. Wrong tap = penalty!' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest score at the end wins the match!' },
    ]
  },
  'daily-arithmetic-play': {
    title: '🔢 Daily Arithmetic',
    rules: [
      { icon: '🧮', title: 'Solve the Problem', desc: 'A maths equation appears on the TV. Type your answer using the number pad on your phone.' },
      { icon: '🏁', title: 'Submit First', desc: 'First player to submit the correct answer earns the most points for that round.' },
      { icon: '📈', title: 'Increasing Difficulty', desc: 'Questions get harder as rounds progress — stay sharp!' },
      { icon: '🏆', title: 'Highest Score Wins', desc: 'Total up all rounds — highest score wins!' },
    ]
  },
  'missing-number-play': {
    title: '🔍 Missing Number',
    rules: [
      { icon: '🔢', title: 'Spot the Pattern', desc: 'A number sequence is shown on the TV with one number missing.' },
      { icon: '📱', title: 'Choose the Answer', desc: 'Tap the correct missing number from the options on your phone.' },
      { icon: '⚡', title: 'Fast = More Points', desc: 'Quicker correct answers earn bonus points.' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Highest score across all rounds wins!' },
    ]
  },
  'number-sort-play': {
    title: '🔢 Number Sort',
    rules: [
      { icon: '🔢', title: 'Tap Smallest First', desc: 'Numbers appear on your phone. Tap them in order from smallest to largest.' },
      { icon: '⚡', title: 'Speed Counts', desc: 'Finish as fast as possible. Your time is tracked!' },
      { icon: '❌', title: 'No Mistakes', desc: 'Tapping the wrong number resets your current attempt.' },
      { icon: '🏆', title: 'Fastest Time Wins', desc: 'Best total time across all rounds wins the match!' },
    ]
  },
  'lumeno-play': {
    title: '💡 Lumeno',
    rules: [
      { icon: '💡', title: 'Match the Pattern', desc: 'The TV shows a grid with some cells lit up. Recreate the same pattern on your phone.' },
      { icon: '📱', title: 'Tap to Toggle', desc: 'Tap a cell to light it up or turn it off.' },
      { icon: '✅', title: 'Submit When Ready', desc: 'Tap Submit when your grid matches the pattern on the TV.' },
      { icon: '🏆', title: 'Fastest Correct Wins', desc: 'First player to match the pattern exactly wins the round!' },
    ]
  },
  'memory-match-play': {
    title: '🃏 Memory Match',
    rules: [
      { icon: '🃏', title: 'Flip Two Cards', desc: 'Tap a card on your phone to flip it and reveal the image.' },
      { icon: '🧠', title: 'Find Matching Pairs', desc: 'Flip a second card — if both match, they are removed. If not, they flip back.' },
      { icon: '📱', title: 'Take Turns or Race', desc: 'All players can see the TV. The first to find a matching pair claims it.' },
      { icon: '🏆', title: 'Most Pairs Wins', desc: 'Player with the most matched pairs when the board clears wins!' },
    ]
  },
  'maze-play': {
    title: '🌀 Maze',
    rules: [
      { icon: '🕹️', title: 'Move Your Character', desc: 'Swipe on your phone or use the arrow buttons to move through the maze.' },
      { icon: '🏁', title: 'Find the Exit', desc: 'Navigate from start to the exit (marked with a flag or door).' },
      { icon: '⚡', title: 'Race Your Opponents', desc: 'All players run the same maze. Be the first to exit!' },
      { icon: '🏆', title: 'Fastest Exit Wins', desc: 'Best time across 3 mazes wins the match!' },
    ]
  },
  'pattern-sequence-play': {
    title: '🔁 Pattern Sequence',
    rules: [
      { icon: '👁️', title: 'Watch the Pattern', desc: 'Colours or shapes flash on the TV in a sequence. Memorise the order!' },
      { icon: '📱', title: 'Repeat It', desc: 'Tap the same colours/shapes in the exact same order on your phone.' },
      { icon: '📈', title: 'One More Each Round', desc: 'Every round adds one more item to the sequence. Stay focused!' },
      { icon: '🏆', title: 'Last One Standing', desc: 'Last player to make a mistake wins the game!' },
    ]
  },
  'pipe-puzzle-play': {
    title: '🚰 Pipe Puzzle',
    rules: [
      { icon: '🚰', title: 'Rotate the Pipes', desc: 'Tap a pipe segment on your phone to rotate it 90 degrees.' },
      { icon: '💧', title: 'Connect Source to End', desc: 'Rotate all pieces until the path is fully connected from the water source to the drain.' },
      { icon: '✅', title: 'No Leaks', desc: 'All open ends must connect — no dead ends or leaking pipes!' },
      { icon: '🏆', title: 'Fastest Solve Wins', desc: 'First player to complete the connected path wins!' },
    ]
  },
  'ring-sort-play': {
    title: '💍 Ring Sort',
    rules: [
      { icon: '💍', title: 'Sort by Colour', desc: 'Rings of mixed colours are stacked on pegs. Sort them so each peg holds only one colour.' },
      { icon: '📱', title: 'Move Rings', desc: 'Tap a peg to pick up the top ring, then tap another peg to place it there.' },
      { icon: '📏', title: 'Stack Rules', desc: 'You can only place a ring on an empty peg or on a larger ring. Plan ahead!' },
      { icon: '🏆', title: 'Fewest Moves Wins', desc: 'Complete the sort using the fewest possible moves!' },
    ]
  },
  'shopping-list-play': {
    title: '🛒 Shopping List',
    rules: [
      { icon: '📋', title: 'Memorise the List', desc: 'The TV shows a shopping list for a few seconds. Memorise every item!' },
      { icon: '🛒', title: 'Spot the Items', desc: 'Items appear on your phone mixed with distractors. Tap only items from the original list.' },
      { icon: '❌', title: 'Avoid Decoys', desc: 'Tapping something NOT on the list loses you points. Be careful!' },
      { icon: '🏆', title: 'Most Correct Wins', desc: 'Highest accuracy across all rounds wins!' },
    ]
  },
  'sokoban-play': {
    title: '📦 Sokoban',
    rules: [
      { icon: '📦', title: 'Push Boxes to Targets', desc: 'Move your character to push boxes (🟫) onto the target spots (marked ×) on the grid.' },
      { icon: '🕹️', title: 'Swipe to Move', desc: 'Swipe on your phone to move up, down, left, or right.' },
      { icon: '🚫', title: 'No Pulling', desc: 'You can only push, not pull. Careful not to trap a box in a corner!' },
      { icon: '🏆', title: 'Fewest Moves Wins', desc: 'Place all boxes on targets using the fewest moves to win!' },
    ]
  },
  'speed-tap-play': {
    title: '👆 Speed Tap',
    rules: [
      { icon: '🎯', title: 'Tap the Target', desc: 'A target appears on your screen. Tap it as fast as you can!' },
      { icon: '🎨', title: 'Right Colour Only', desc: 'Only tap targets that match the correct colour shown. Wrong taps cost time.' },
      { icon: '⚡', title: 'More Taps = More Points', desc: 'Each correct tap earns a point. Tap as many as possible in the time limit.' },
      { icon: '🏆', title: 'Most Taps Wins', desc: 'Highest score when time runs out wins!' },
    ]
  },
  'stroop-colour-play': {
    title: '🎨 Stroop Colour',
    rules: [
      { icon: '🎨', title: 'Read the Ink, Not the Word', desc: 'A colour word is shown in a different colour ink (e.g. "BLUE" in red ink).' },
      { icon: '📱', title: 'Tap the Ink Colour', desc: 'Tap the colour that the text is WRITTEN IN — not the word itself!' },
      { icon: '🧠', title: 'Your Brain Will Trick You', desc: 'It\'s harder than it sounds! Stay focused on the ink colour.' },
      { icon: '🏆', title: 'Fastest Correct Wins', desc: 'Quickest correct tap each round earns the point. Most points wins!' },
    ]
  },
  'word-recall-play': {
    title: '📝 Word Recall',
    rules: [
      { icon: '👁️', title: 'Study the Words', desc: 'A list of words appears on the TV for a short time. Memorise as many as you can!' },
      { icon: '📱', title: 'Type What You Remember', desc: 'After they disappear, type every word you can recall on your phone.' },
      { icon: '✅', title: 'Close Enough Counts', desc: 'Small spelling mistakes are forgiven. Each recalled word earns a point.' },
      { icon: '🏆', title: 'Most Words Wins', desc: 'Player who recalls the most words wins the round!' },
    ]
  },
  'colour-memory-play': {
    title: '🎨 Colour Memory',
    rules: [
      { icon: '👁️', title: 'Watch the TV', desc: 'Colour tiles flash on the TV one by one. Memorise the sequence!' },
      { icon: '📱', title: 'Tap in the Same Order', desc: 'Once the sequence finishes, tap the same colours in the same order on your phone.' },
      { icon: '📈', title: 'Sequence Grows', desc: 'Each round adds one more colour. How long a sequence can you remember?' },
      { icon: '🏆', title: 'First Correct Wins', desc: 'First player to tap the full sequence correctly wins the round!' },
    ]
  },
  'face-memory-play': {
    title: '👤 Face Memory',
    rules: [
      { icon: '👀', title: 'Memorise the Faces', desc: 'The TV shows faces with their names during the study phase. Pay attention!' },
      { icon: '❓', title: 'Who is This?', desc: 'A face appears on the TV without a name. Identify the correct person.' },
      { icon: '📱', title: 'Tap the Name', desc: 'Choose the correct name from 4 options on your phone. First correct tap wins!' },
      { icon: '🏆', title: 'Most Points Wins', desc: 'Each face question is a race. Most points across all questions wins!' },
    ]
  },
};

(function () {
  // ── Detect game key from URL ─────────────────────────────────────────────
  function getGameKey() {
    const path = location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    return path;
  }

  const gameKey = getGameKey();
  const rules   = GAME_RULES[gameKey];
  if (!rules) return; // no rules defined for this page — skip

  // ── Inject modal CSS ─────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .rules-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.85); font-size: 16px; font-weight: 800;
      cursor: pointer; flex-shrink: 0; text-decoration: none;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      font-family: 'Lexend', sans-serif;
      line-height: 1;
    }
    .rules-btn:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.35); }
    .rules-btn:active { transform: scale(0.92); }
    .rules-btn-float {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 10px);
      right: calc(env(safe-area-inset-right, 0px) + 10px);
      width: 32px; height: 32px; font-size: 14px;
      z-index: 9997;
      background: rgba(0,0,0,0.55);
      border-color: rgba(255,255,255,0.3);
      color: #fff;
      box-shadow: 0 2px 10px rgba(0,0,0,0.45);
    }

    .rules-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.72);
      z-index: 9998;
      animation: rulesBackdropIn 0.2s ease;
    }
    @keyframes rulesBackdropIn { from{opacity:0} to{opacity:1} }

    .rules-modal {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px;
      pointer-events: none;
    }
    .rules-modal-box {
      background: #1a1f2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      padding: 28px 24px 24px;
      width: 100%; max-width: 480px;
      max-height: 90vh; overflow-y: auto;
      pointer-events: all;
      animation: rulesBoxIn 0.22s cubic-bezier(0.23,1,0.32,1);
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    }
    @keyframes rulesBoxIn { from{opacity:0;transform:scale(0.94) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }

    .rules-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .rules-modal-title {
      font-size: 20px; font-weight: 800; color: #fff;
      font-family: 'Lexend', sans-serif;
    }
    .rules-modal-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.7); font-size: 18px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .rules-modal-close:hover { background: rgba(255,255,255,0.18); }

    .rules-list {
      display: flex; flex-direction: column; gap: 12px;
    }
    .rules-item {
      display: flex; align-items: flex-start; gap: 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px; padding: 14px;
    }
    .rules-item-icon { font-size: 28px; flex-shrink: 0; line-height: 1; margin-top: 1px; }
    .rules-item-body { flex: 1; }
    .rules-item-title {
      font-size: 14px; font-weight: 700; color: #fff;
      font-family: 'Lexend', sans-serif; margin-bottom: 3px;
    }
    .rules-item-desc {
      font-size: 13px; color: rgba(255,255,255,0.55); line-height: 1.5;
      font-family: 'Lexend', sans-serif;
    }
  `;
  document.head.appendChild(style);

  // ── Build modal DOM ──────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'rules-backdrop';
  backdrop.style.display = 'none';

  const modalWrap = document.createElement('div');
  modalWrap.className = 'rules-modal';
  modalWrap.style.display = 'none';
  modalWrap.innerHTML = `
    <div class="rules-modal-box">
      <div class="rules-modal-header">
        <div class="rules-modal-title">How to play ?</div>
        <button class="rules-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="rules-list">
        ${rules.rules.map(r => `
          <div class="rules-item">
            <div class="rules-item-icon">${r.icon}</div>
            <div class="rules-item-body">
              <div class="rules-item-title">${r.title}</div>
              <div class="rules-item-desc">${r.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modalWrap);

  function openRules() {
    backdrop.style.display = 'block';
    modalWrap.style.display = 'flex';
    // reset animation
    const box = modalWrap.querySelector('.rules-modal-box');
    box.style.animation = 'none';
    box.offsetHeight; // reflow
    box.style.animation = '';
  }
  function closeRules() {
    backdrop.style.display = 'none';
    modalWrap.style.display = 'none';
  }

  backdrop.addEventListener('click', closeRules);
  modalWrap.querySelector('.rules-modal-close').addEventListener('click', closeRules);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRules(); });

  // ── Inject ? button into top bars ───────────────────────────────────────
  function makeBtn() {
    const b = document.createElement('button');
    b.className = 'rules-btn';
    b.setAttribute('aria-label', 'How to Play');
    b.textContent = '?';
    b.addEventListener('click', openRules);
    return b;
  }

  function injectButton() {
    let injected = false;

    // TV playing header
    const tvHeader = document.querySelector('.tv-playing-header');
    if (tvHeader) { tvHeader.appendChild(makeBtn()); injected = true; }

    // TV lobby title bar
    const tvLobbyBar = document.querySelector('.tv-lobby-titlebar');
    if (tvLobbyBar) { tvLobbyBar.appendChild(makeBtn()); injected = true; }

    // Mobile: any known top bar class
    const topBar = document.querySelector(
      '.play-topbar, .game-header, .top-bar, .playing-header, .play-header, ' +
      '.wordle-topbar, .top-info, .race-hud, .minigame-header, .page-header, header'
    );
    if (topBar) { topBar.appendChild(makeBtn()); injected = true; }

    // Fallback: floating fixed button (top-right) for pages with no top bar
    if (!injected) {
      const fb = makeBtn();
      fb.classList.add('rules-btn-float');
      document.body.appendChild(fb);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
