Verification
Run npx vercel dev locally
Test GET http://localhost:3000/api/daily-challenge - should return 2 daily games
Open http://localhost:3000/math-cross - should launch Math Cross game directly
Open http://localhost:3000/?gameId=math-cross - should still work (backward compat)
Open http://localhost:3000/ - should show normal home screen