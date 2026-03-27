Court Vision Web Foundation

Backend:
- `cd /Users/ant/Desktop/QuizFolder/quiz_web_backend`
- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r requirements.txt`
- `uvicorn main:app --reload`

Frontend:
- `cd /Users/ant/Desktop/QuizFolder/quiz_web_frontend`
- `python3 -m http.server 4173`
- Open `http://127.0.0.1:4173`

How the frontend finds the API:
- Local development uses `/Users/ant/Desktop/QuizFolder/quiz_web_frontend/config.js`
- Default local value:
  - `window.COURT_VISION_API_BASE = "http://127.0.0.1:8000/api";`
- For production, point that value at your deployed backend URL, for example:
  - `window.COURT_VISION_API_BASE = "https://court-vision-api.onrender.com/api";`

Recommended public deployment:
- Backend: Render Web Service
- Frontend: Render Static Site
- Database: Render Postgres

Render backend settings:
- Root directory: `quiz_web_backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment variable:
  - `DATABASE_URL=<Render Postgres internal/external connection string>`

Backend database behavior:
- Local development falls back to SQLite automatically.
- Production switches to PostgreSQL whenever `DATABASE_URL` is set.

Render frontend settings:
- Root directory: `quiz_web_frontend`
- Build command:
  - `printf 'window.COURT_VISION_API_BASE = "%s";\n' "$COURT_VISION_API_BASE" > config.js`
- Publish directory:
  - `.`
- Environment variable:
  - `COURT_VISION_API_BASE=https://your-backend-service.onrender.com/api`

Suggested go-live checklist:
1. Push the repo to GitHub.
2. Create a Render Postgres database named `court-vision-db`.
3. Attach its connection string to the backend as `DATABASE_URL`.
4. Deploy the backend and copy its public URL.
5. Deploy the frontend and set `COURT_VISION_API_BASE` to the backend URL plus `/api`.
6. Test:
   - `/api/health`
   - loading quiz questions
   - leaderboard reads/writes
   - profile saves
   - headshots and school logos
7. Add your custom domain after both services work.

Custom domain steps on Render:
1. Open your Render service.
2. Go to `Settings` -> `Custom Domains`.
3. Add your domain, such as `play.yourdomain.com`.
4. Copy the DNS record Render gives you.
5. Add that record where your domain is hosted.
6. Wait for Render to verify SSL and DNS.

Recommended domain setup:
- Frontend custom domain:
  - `play.yourdomain.com`
- Optional backend custom domain:
  - `api.yourdomain.com`

What is ready:
- leaderboard API
- profile API
- daily challenge API
- question sample API
- playable browser quiz flow
- typed and multiple-choice web play
- leaderboard submission from the browser
- static headshot/logo asset routes

What still needs a future pass for full parity:
- authentication
- hosted deployment for true online multiplayer/leaderboards
- polished responsive game screens
- harder desktop feature parity like power-ups, achievements, and 2-player web mode
