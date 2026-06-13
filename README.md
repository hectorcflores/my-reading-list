# My Reading List

A tiny GitHub Pages reading-list app with Firebase Firestore sync.

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

## Notes

- GitHub Pages only hosts the static website. Firebase Firestore is the database.
- Firebase web app config is designed to be public in browser apps.
- The private sync secret is what separates your reading list from anyone else's.
- The app intentionally stores only the URL and creation time.
