# My Reading List

A tiny GitHub Pages reading-list app with Firebase Firestore sync. Every saved
link is turned into a narrated podcast episode — pick **TLDR** (~2-3 min) or
**Deep dive** (~9-12 min) when saving, then listen with the built-in player.

## Run Locally

```bash
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Firebase Setup

1. Create a Firebase project on the no-cost Spark plan.
2. Create a Firestore database in production mode.
3. Open Firestore Rules.
4. Paste and publish `firestore.rules`.
5. Add a Web App in Firebase project settings.
6. Copy the web app config values for `apiKey`, `authDomain`, `projectId`, and `appId`.

## Sync Setup

Open the app once with this URL format:

```text
https://YOUR_GITHUB_PAGES_URL/#fb_api_key=YOUR_FIREBASE_API_KEY&fb_auth_domain=YOUR_FIREBASE_AUTH_DOMAIN&fb_project_id=YOUR_FIREBASE_PROJECT_ID&fb_app_id=YOUR_FIREBASE_APP_ID&sync_key=YOUR_PRIVATE_SYNC_SECRET
```

The app stores the Firebase config and a hash of your private sync secret in the browser. After setup, it removes the fragment from the visible URL.

Use the same setup URL once on each computer.

## GitHub Pages

Publish this repository with GitHub Pages from the root of the `main` branch. The root `index.html` redirects to `app/index.html`.

## Podcast Pipeline Setup

A GitHub Actions workflow (`.github/workflows/podcast.yml`) runs every 30
minutes (plus a manual **Run workflow** button under Actions). It finds saved
links without episodes, extracts the article, writes a narration script with
`gpt-4o-mini`, voices it with `gpt-4o-mini-tts`, commits the MP3 under
`app/episodes/`, and writes the episode status back to Firestore so the app
shows a title, duration, and play button.

One-time setup:

1. In the Google Cloud console for your Firebase project, create a service
   account with the **Cloud Datastore User** role and download a JSON key.
2. In this repo's **Settings → Secrets and variables → Actions**, add:
   - `OPENAI_API_KEY` — an OpenAI API key.
   - `FIREBASE_SERVICE_ACCOUNT` — the full JSON key file contents.
3. Re-publish the updated `firestore.rules` in the Firebase console (the
   client now saves a `format` field).

Pipeline lives in `pipeline/` (Node 20+). Run it locally with:

```bash
cd pipeline && npm install
OPENAI_API_KEY=... FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run generate
npm run finalize   # after committing/pushing the generated MP3s
```

Approximate cost: ~$0.04 per TLDR, ~$0.15 per deep dive (OpenAI usage only —
Actions and Pages are free on a public repo).

## Notes

- GitHub Pages only hosts the static website. Firebase Firestore is the database.
- Firebase web app config is designed to be public in browser apps.
- The private sync secret is what separates your reading list from anyone else's.
- The reading list itself stays private behind the sync secret, but generated
  episode MP3s are committed to this public repo under unguessable hashed paths.
