# Barangay Abang · User Portal

## Folder structure

```
index.html              → redirects to the user portal
dashboard.html          → redirects to the dashboard page
dev-server.mjs          → local preview: node dev-server.mjs → http://127.0.0.1:4173/

assets/                 → images (barangay seal)
css/
  user.css              → styles for pages/user/* (formatted, semantic additions at the bottom)
  dashboard.css         → styles for pages/dashboard/*
js/
  supabase-client.js    → shared Supabase connection (publishable key only)
  user.js               → user portal app (sectioned: state → helpers → data → navigation → templates → actions → events → boot)
  dashboard.js          → dashboard page logic (login, signup, logout, announcements)
pages/
  user/index.html       → user portal
  user/signup.html      → opens the portal on the signup form
  dashboard/index.html  → dashboard page (home, login, signup, dashboard, announcements sections)
supabase/               → database schema, migrations, edge functions (unchanged)
legacy/                 → old files no page uses anymore (safe to delete)
```

## How buttons work

* **User portal (js/user.js):** every button has a `data-action="..."` and every form a
  `data-form="..."`. One delegated listener per event type looks them up in
  `clickActions`, `formHandlers` and `changeHandlers`. To add a button: add the attribute
  in the template and one entry in the matching table.
* **Dashboard page (js/dashboard.js):** navigation is plain `href="#page"` links; the
  `hashchange` event shows the matching `<section class="page">`, so Back/Forward work.

## What changed

* Semantic HTML: `header`/`nav`/`main`/`section`/`article`/`aside`/`footer`, lists (`ul/li`)
  for nav, tiles, cards and announcements, labelled landmarks, `aria-current` on the
  active link, correct heading order, skip links. Inline styles moved into CSS.
* Dashboard page: it pointed to a missing `script.js` and had no login/signup forms, so
  none of its buttons worked. Rebuilt it, and it now signs in with the same Supabase
  accounts as the portal (the old version saved passwords in plain text in localStorage).
* Portal: no more inline `onclick`; added Back to home on login/signup, Escape and
  click-outside to close the profile menu and complaint popup, focus handling, loading
  state on submit buttons (no double submits), dark-mode fix for the profile menu, styled
  avatar circle, and a friendly message when Supabase cannot load.
* Removed the duplicate `pages/dashboard/dashboard.css` (identical to `css/dashboard.css`).
* Moved unused `login.js`, `signup.js`, `login.css` to `legacy/` (they had placeholder keys
  and no page loaded them).
