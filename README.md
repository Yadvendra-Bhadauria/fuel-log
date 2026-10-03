# Fuel log

A local-first nutrition and movement tracker. The React client is a responsive installable PWA; the Express API stores records in SQLite through Prisma. Photo estimates are reviewed before they are logged. The Goals tab can build a target-weight plan from current weight, target weight, height, age, sex, activity, and goal direction, with a starting calorie intake and approximate timeline.

## Structure

- `client/` — React, TypeScript, Vite, Tailwind CSS, PWA manifest, charts, and camera workflows.
- `server/` — Express API, Anthropic image analysis, nutrition lookups, and Prisma persistence.
- `shared/` — Shared API contracts and nutrition scaling.
- `server/prisma/schema.prisma` — SQLite schema for settings, date-based logs, food, and workouts.

## Requirements

- Node.js 20 or newer and npm 10 or newer.
- A Gemini API key from Google AI Studio's Free plan to enable photo meal estimates. Photo scans are capped at three per UTC day.
- A USDA API key is optional; Open Food Facts works without a key.
- No OAuth project or email-sending service is required for account sign-up.
- A Turso Free database URL and auth token for persistent Vercel data storage.

## Setup

1. Install dependencies from the repository root:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and add API keys as needed. Keep `GEMINI_API_KEY` and `USDA_API_KEY` in this server-side file. Vite does not expose these values to the browser.

3. Accounts use an email address and password; no Google Cloud project or OAuth credentials are needed. Passwords must be at least 12 characters and are stored as scrypt hashes. Email addresses are not verified and there is no password-reset flow, so users who forget a password cannot recover that account. Each account has a separate private log. Authentication is required in production; local development can run without signing in.

4. For production, create a new, empty database on the Turso Free plan. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to `.env` and Vercel's environment settings, then run `npm run db:turso:init --workspace server` once. The initializer refuses non-empty databases to avoid overwriting older single-user data. The local SQLite database and its personal logs are not uploaded. Disable Turso overages to keep storage at $0.

5. Create or update the local SQLite database:

   ```sh
   npm run db:push
   ```

6. Start the API and Vite development server:

   ```sh
   npm run dev
   ```

   The client is at `http://localhost:5173`; the API is at `http://localhost:3001`. On a phone, use the computer's LAN address and HTTPS if the browser requires a secure context for camera access.

7. For the Vercel deployment, configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the project's Production environment settings, initialize the empty Turso database, and redeploy. Accounts cannot be created until the database is connected. Photo estimates additionally require `GEMINI_API_KEY`; USDA lookups optionally use `USDA_API_KEY`.

8. To create production bundles:

   ```sh
   npm run build
   ```

   Vercel uses `vercel.json` to route `/api/*` to the Express service and other paths to the Vite app. Connect the private GitHub repository to Vercel and deploy the review branch for a preview.

## Data and privacy

The app starts with no seeded records. Set goals from the Goals tab. Log data is stored in `server/prisma/dev.db`. Meal images are resized in the browser, converted to JPEG, and stripped of metadata before analysis. Images are not retained unless “Keep meal thumbnails” is enabled; then a small thumbnail is attached to the food entry. The original upload is never stored by the API.

Anyone can create an account with an email address and password. Settings, daily records, recent foods, and photo-scan allowances are isolated by account. Passwords are scrypt-hashed, and only a digest of each 30-day session token is stored. Sign-up and sign-in are limited to 10 attempts per minute per IP. Email addresses are not verified and there is no password reset; users must remember their password. Accounts created with this password-based sign-in start with a new private log; older Google-based logs are not automatically transferred. Photo analysis is limited to three scans per UTC day per account and eight requests per minute per client IP. Gemini's Free plan has separate provider quotas which may be lower and can change; there is no paid-model fallback. Do not attach billing to the AI Studio project if you require a hard $0 provider bill. Google's Free tier may use submitted content to improve its products, so photo scans require explicit acknowledgement; avoid photos containing faces or private information.

## Checks

Run the calorie-estimation and nutrition-scaling unit tests with:

```sh
npm test
```