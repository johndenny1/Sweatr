# Sweatr

Put in a parlay and follow every leg live: player stat progress, scores and hit/miss status.

**Stack:** Vite + React · Supabase (logins + saved parlays) · SportsDataIO (live data) · Vercel (hosting + `/api` server function)

## Setup (all doable from a phone browser)

### 1. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public key**.
4. Optional for testing: **Authentication → Providers → Email**, turn off "Confirm email" so you can sign in right away.

### 2. SportsDataIO
1. Sign up at sportsdata.io and get API keys for NFL, NBA, MLB, CFB and CBB.
2. Free trial data is delayed and **scrambled** (stats are deliberately off), so expect weird numbers until you're on a paid plan.

### 3. GitHub
Upload this folder to a new repo. Keep the structure exactly as it is: `api/`, `src/`, `supabase/`, `index.html` and `package.json` must sit at the **top level** of the repo, not inside a `sweatr/` folder.

### 4. Vercel
1. Import the repo. Vercel auto-detects Vite.
2. Add the environment variables from `.env.example`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SPORTSDATA_API_KEY` (one key), **or** `SPORTSDATA_KEY_NFL`, `_NBA`, `_MLB`, `_CFB`, `_CBB` (one per league)
   - `GEMINI_API_KEY` from aistudio.google.com (free tier) **or** `ANTHROPIC_API_KEY`, for screenshot scanning
3. Deploy.

## How it works

| File | Job |
|---|---|
| `api/sports.js` | Server function. Checks the user is signed in, then fetches from SportsDataIO with the secret key. |
| `api/_sportsdata.js` | Endpoint paths per league + converts each league's data into one shape. **If a league errors, fix its path here.** |
| `src/lib/stats.js` | Prop markets per league (Points, PRA, Passing Yards, Hits…). Add new props here. |
| `src/lib/evaluate.js` | Decides if each leg is pending / live / hit / miss / push. Overs lock in as soon as they clear, unders bust as soon as they go over. |
| `api/scan.js` | Sends a bet-slip screenshot to Gemini (free) or Claude and returns the legs as JSON. |
| `src/lib/scan.js` | Shrinks the screenshot, then matches each leg to a real game and player (handles nicknames and abbreviation differences). |
| `src/components/LegForm.jsx` | League → date → game → bet type → player/stat/line. |
| `src/components/ParlayView.jsx` | Live tracker. Polls every 30s until every game is final. |

## Known gaps / next up
- Endpoint paths for CFB/CBB are the most likely to need tweaking for your plan; the error message shows the exact path that failed.
- Players who are injured or inactive are hidden from the roster list.
