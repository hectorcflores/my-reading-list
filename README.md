# My Reading List

A tiny GitHub Pages reading-list app with optional Supabase sync.

## Run Locally

```bash
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Paste and run `supabase/schema.sql`.
4. Copy your project URL and anon public key from Supabase project settings.

## Sync Setup

Open the app once with this URL format:

```text
https://YOUR_GITHUB_PAGES_URL/#sb_url=YOUR_SUPABASE_URL&sb_key=YOUR_SUPABASE_ANON_KEY&sync_key=YOUR_PRIVATE_SYNC_SECRET
```

The app stores the Supabase URL, anon key, and a hash of your private sync secret in the browser. After setup, it removes the fragment from the visible URL.

Use the same setup URL once on each computer.

## GitHub Pages

Publish this repository with GitHub Pages from the root of the `main` branch. The root `index.html` redirects to `app/index.html`.

## Notes

- GitHub Pages only hosts the static website. Supabase is the database.
- The Supabase anon key is designed to be public in browser apps.
- The private sync secret is what separates your reading list from anyone else's.
- The app intentionally stores only the URL and creation time.
