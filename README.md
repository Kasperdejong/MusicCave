# 🎵 MusicCave

**MusicCave** is a full-stack SaaS platform and Chrome Extension that magically transfers playlists between Apple Music and Spotify. Instead of relying on strict API limits, MusicCave uses custom DOM automation to physically read your screen, cross-reference a PostgreSQL database to prevent duplicates, and automatically build your playlists on the target platform.

## Disclaimer:

MusicCave is an independent, open-source project and is not affiliated with, authorized, maintained, sponsored, or endorsed by Apple Inc., Spotify AB, or any of their affiliates or subsidiaries. All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.

---

## Live Deployment

- **Frontend (Client):** [Deploying on Vercel] _(Add your Vercel URL here)_
- **Backend (Server):** [Deploying on Render] _(Add your Render URL here)_
- **Database:** Supabase (PostgreSQL)

---

## Architecture: How it Works

MusicCave is split into three distinct parts that communicate with each other:

1. **The Client (React/Vite):** The central dashboard where users log in, view their transfer history, and select which playlists to transfer.
2. **The Server (Express.js/Supabase):** Handles authentication, memory caching, fuzzy-matching (The "Remix Engine" for duplicate prevention), and tracking user transfer histories.
3. **The Bridge (Chrome Extension):** The core magic. It receives commands from the React dashboard, uses a Content Script to scrape tracklists directly from the DOM of Apple Music/Spotify, and uses a Robot script to physically inject/click songs into the target platform.

---

## Installation & Setup Guide

If you want to run this project locally, you must set up all three components.

### 1. Install the Chrome Extension

Because the extension physically controls your browser, it must be loaded locally into Chrome.

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Turn on **"Developer mode"** (top right corner).
3. Click **"Load unpacked"** and select the `extension` folder inside this repository.
4. **⚠️ IMPORTANT:** Copy the **Extension ID** that Chrome generates for you.
5. Open `client/src/App.jsx` and replace the `EXTENSION_ID` variable with your new ID:
   ```javascript
   const EXTENSION_ID = "paste_your_new_id_here";
   ```

### 2. Setup these files if you want to run everything from the code

1. Open extension/manifest.json. Ensure your local testing environment and live URLs are in the externally_connectable list:

```
"externally_connectable": {
  "matches": [
    "http://localhost:5173/*",
    "https://your-vercel-app.vercel.app/*"
  ]
}
```

(Note: If you move the project folder on your computer, you must remove the extension from Chrome and "Load unpacked" again from the new location).

2. Set up the Backend (Server)
   Open a terminal and navigate to the server folder: cd server
   Install dependencies: npm install
   Create a .env file in the server folder and add your Supabase keys:

# put this in

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_or_anon_key
PORT=4000
```

Start the server: node server.js

3. Set up the Frontend (Client)
   Open a new terminal window and navigate to the client folder: cd client
   Install dependencies: npm install
   Create a .env file in the client folder:

# put this in

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Start the React app: npm run dev
Open http://localhost:5173 in Chrome. Log in and start transferring!

## Notes Les documentatie

- Maak een ERD (niet alleen voor mezelf maar ook voor anderen voor overzicht van de Database)

- Een van de beoordelingscriteria is dat je bewust hebt gedocumenteerd. (server, extensie, client, ERD(database))
  Ik wil zorgen dat de volgende onderdelen goed gedocumenteerd staan in de code en/of wiki/readme:
  De Server (API Endpoints)
  De Extensie (Background workers, DOM manipulatie)
  De Client (State management, API calls)
  ERD (Supabase architectuur)
