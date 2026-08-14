# Dev Log

## 2026-07-05 — OWASP Top 10 security review

Went through the client codebase (`src/App.jsx`, `src/MapView.jsx`, `vercel.json`, `.env.example`) against the OWASP Top 10.

**Findings:**

1. **A01 Broken Access Control — `profiles.role` self-escalation risk.** All owner/moderator checks in the UI are client-side only; if the RLS `UPDATE` policy on `profiles` doesn't restrict which columns a user can change, a user could `PATCH` their own row to set `role=moderator` directly via the API.
2. **A01 Broken Access Control — `increment_votes` trusts a client-supplied delta.** `handleVote` computes the vote delta in the browser and passes it straight to the RPC; calling the RPC directly with an arbitrary `delta` could inflate/tank any deal's vote count.
3. **A01 Broken Access Control — `reports` table visibility.** Needed to confirm regular users can't `SELECT`/`UPDATE` other users' reports (moderator-only).
4. **A04 Insecure Design — storage bucket scoping/MIME types.** Avatar and deal-image uploads weren't restricted to the uploader's own folder or to image MIME types at the bucket level.
5. **A04 Insecure Design — `delete_user` RPC.** Needed to confirm it always deletes `auth.uid()` and never accepts a target user id from the client.
6. **A04 Insecure Design — deal image filename handling.** `uploadDealImage` used the raw file extension (`file.name.split(".").pop()`) with no sanitization, so a crafted filename (e.g. `x.png/../evil`) could inject a slash into the storage path. (Avatar upload already sanitized this.)
7. **Housekeeping — dead code.** Unused hardcoded placeholder `const TURNSTILE_SITE_KEY = "YOUR_TURNSTILE_SITE_KEY"` left in `App.jsx`; the real key is read from `import.meta.env.VITE_TURNSTILE_SITE_KEY`.
8. **A04 Insecure Design — no upload validation.** No client-side file-type/size checks before uploading avatars (only checked in a fallback branch) or deal images (no check at all).

**Fixed in code** (commit `a361cf5`, `src/App.jsx`):
- Sanitized the deal-image file extension the same way avatars already were (#6).
- Added file-type + size validation before uploading avatars and deal images (#8).
- Removed the unused Turnstile placeholder constant (#7).

**Written but not yet applied** (commit `a361cf5`, `supabase/security_review_fixes.sql` — requires running in the Supabase SQL editor, which needs dashboard access this session doesn't have):
- Trigger blocking users from changing their own `profiles.role` (#1).
- New `deal_votes` ledger table + `cast_vote()` RPC that derives the vote delta server-side instead of trusting the client, replacing `increment_votes` (#2).
- RLS policies scoping `reports` `SELECT`/`UPDATE` to the reporter and moderators only (#3).
- Storage RLS policies scoping `avatars`/`deal-images` uploads to the uploader's own folder, plus a note to restrict bucket MIME types to images only (#4).
- A checklist item to confirm `delete_user()` hardcodes `auth.uid()` (#5).

**Follow-up once the SQL is applied:** update `handleVote` in `App.jsx` to call `cast_vote({ p_deal_id, p_direction })` instead of `increment_votes({ deal_id, delta })`, and move vote-arrow state off `localStorage` onto the server (`deal_votes` table) so it can't be forged and survives across devices. Not done yet — held back until the migration is confirmed live, since it can't be tested against a real Supabase instance from this environment.

npm audit run during the review: 0 vulnerabilities in production dependencies.

## 2026-07-06 — Fixed deal_votes type mismatch, wired up cast_vote client-side

The `security_review_fixes.sql` migration initially failed: `deal_votes.deal_id` was declared `bigint`, but `deals.id` is actually `uuid`. Fixed the column and the `cast_vote(p_deal_id, ...)` parameter to `uuid` (commit `b8c9463`). Migration applied successfully after that.

With `cast_vote` live, updated the client (`src/App.jsx`):
- `handleVote` now calls `supabase.rpc("cast_vote", { p_deal_id, p_direction })` instead of `increment_votes({ deal_id, delta })` — the server derives the vote delta from the `deal_votes` ledger instead of trusting a client-supplied number (closes #2 from the review).
- `votedDeals` is now fetched from the `deal_votes` table on login (`fetchVotes`, mirrors the existing `fetchSaved` pattern) instead of read from `localStorage`, so vote state is per-account and survives across devices/incognito instead of being per-browser.
- Rollback added: if the RPC errors, the optimistic vote-count and arrow-state updates are reverted.
- Corrected the Privacy Policy's "Cookies and local storage" section — it previously claimed votes and saved deals were tracked via `localStorage`, but saved deals were already server-side (`fetchSaved`) and votes now are too. Only the login session actually lives in `localStorage`.

**Verified:** app builds clean; loaded in a headless browser and confirmed no runtime crash from the refactor and the corrected Privacy Policy text renders correctly. **Not verified:** the actual vote flow end-to-end against a live Supabase project (no real credentials available in this environment) — needs a manual click-test of upvote/downvote/switch-vote before this ships. Also worth knowing: any user who voted before this migration has no row in `deal_votes` yet, so their vote arrows will show as un-highlighted on next load even though the deal's vote count itself is unaffected.

## 2026-07-06 — Shareable deal links + Share button

Deals are now deep-linkable via `?deal=<id>` (`src/App.jsx`): read on mount, kept in sync with the deal screen via `history.pushState`, restored on browser back/forward (`popstate`), with a loading state and a "Deal not found" fallback for bad/stale links. Added a "🔗 Share" button on the deal detail page — native share sheet (`navigator.share`) on mobile, clipboard copy + "Link copied!" confirmation as the desktop fallback.

Verified in a headless browser with mocked Supabase responses: deep link to a nonexistent deal shows "Deal not found", clicking into a real deal updates the URL, Share button copies the exact URL, and browser back clears the `?deal=` param. (One red herring during testing: a mocked deal with `days: ['Fr','Sa']` didn't render — turned out to be the app's existing "filter to today" default correctly excluding it, not a bug.)

## 2026-07-06 — Dynamic Open Graph tags for shared deal links

The Share button above only helps if the resulting link unfurls into a rich preview card (title/photo/price) in iMessage/Discord/group chats — otherwise every shared link shows the same generic site-wide preview. Since this is a client-rendered Vite SPA with no server-side rendering, `index.html`'s OG tags are static and can't vary per deal on their own.

Added `middleware.js` at the repo root (Vercel Routing Middleware, framework-agnostic — no `vercel.json` changes needed, auto-detected by file location). On each request to `/`:
- If there's no `?deal=` param, or the User-Agent doesn't match a known link-preview crawler (Facebook, Twitter/X, Discord, Slack, WhatsApp, Telegram, LinkedIn, iMessage, etc.), it returns `undefined` immediately and Vercel serves the normal SPA untouched — real users are never affected.
- Otherwise, it fetches that deal from Supabase (same anon key/public read access the client already uses) and returns a small standalone HTML document with deal-specific `<title>`, `og:*`, and `twitter:*` tags (title, restaurant + price as the description, the deal's photo or the site default), plus a `<meta http-equiv="refresh">` so a real browser that somehow lands here still reaches the app.
- Falls through to the normal SPA (returns `undefined`) on any failure: missing env vars, deal not found, or the Supabase fetch throwing — this never blocks or breaks the real site.

**Verified:** invoked the exported middleware function directly in Node (it's plain Web-standard `Request`/`Response`/`fetch`, no Vercel-specific APIs) with mocked `fetch`, covering: real-browser passthrough, no-`?deal=`-param passthrough, a Facebook-bot and a Discord-bot request both producing correctly escaped deal-specific HTML (including a deliberately hostile deal title containing `<script>` and quotes, to confirm `escapeHtml` prevents injection), deal-not-found passthrough, and Supabase-fetch-failure passthrough.

**Not verified — needs your action after deploy:** I could not confirm Vercel actually wires up `middleware.js` the way I expect for this project. Vercel's own docs pages 403'd every `WebFetch` attempt from this environment, and there's no Vercel CLI/account access here to run `vercel dev` against the real project (login also failed — no network path to Vercel's auth from this sandbox). The request-handling logic above is solid; what's unverified is strictly the Vercel-side wiring (whether `middleware.js` at the project root is auto-detected for a Vite project, and whether `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are available to it at runtme, not just at Vite's build time). After deploying, check with:
```
curl -A "facebookexternalhit/1.1" "https://mealdeals.vercel.app/?deal=<a-real-deal-id>"
```
— you should see the deal-specific HTML above, not the normal `index.html`. If it doesn't fire, the most likely culprits are the middleware not being picked up (check the Vercel deployment's Functions tab for a `middleware` entry) or the env vars not being marked available at runtime. Also worth running the URL through Facebook's Sharing Debugger and Twitter's Card Validator once it's live, since those cache old unfurls aggressively.

**Update — confirmed live in production.** The PR's preview deployment turned out to be behind Vercel's Preview Deployment Protection (SSO wall), which redirected Facebook's scraper to `vercel.com/login` before it ever reached our middleware — a Vercel platform behavior, not a bug in this code. Reset the branch onto master (PRs #3/#4 had already squash-merged, so the branch's original commits were replayed as a clean cherry-pick to avoid a stale-merge-base conflict) and merged directly, then re-tested against production with Facebook's Sharing Debugger:
```
og:title: "Meatball Monday — MealDeals"
og:description: "Meatball Monday at mclanahans — $4"
```
Confirmed working. `og:image` correctly fell back to the site default since that particular deal has no photo. The only debugger warning was a missing optional `fb:app_id` (only needed for Facebook Insights analytics, not required for the preview card to render).

## 2026-08-03 — Custom domain: ih8fullprice.com

Bought `ih8fullprice.com` through Cloudflare Registrar; swapped every hardcoded
`mealdeals.vercel.app` URL over to it:

- `index.html` — `og:url`, `og:image`, `twitter:image`, `<link rel="canonical">`.
- `public/sitemap.xml` — the `<loc>` entry.
- `public/robots.txt` — the `Sitemap:` line.
- `middleware.js` — the fallback `og:image` used when a shared deal has no photo.
- `README.md` — the "Live" link.

Chose the apex (`ih8fullprice.com`, no `www`) as the canonical hostname, so `www`
should be configured to redirect to it rather than serve in parallel — two hostnames
serving identical content splits SEO and makes the canonical tag inconsistent.

Nothing in `src/` needed changing: the app never hardcodes its own origin. Auth
redirects use `window.location.origin` (`App.jsx:373`, `:1866`) and share links are
built from the current location, so both follow the domain automatically — provided
the new origin is allowlisted in Supabase Auth (see below). The `vercel.json` CSP is
also origin-relative (`'self'`, plus third-party hosts) and needs no edit.

**Dashboard steps this commit does NOT cover** — the code is domain-correct but the
site won't actually serve from the new domain, and auth/CAPTCHA will break on it,
until these are done by hand:

1. **Vercel** > Project > Settings > Domains: add `ih8fullprice.com` and
   `www.ih8fullprice.com`, set the apex as primary.
2. **Cloudflare DNS**: add the exact records Vercel shows on that screen. Cloudflare
   Registrar domains must stay on Cloudflare nameservers, so Vercel's "change your
   nameservers" path is not an option here — DNS records are the only route. Set the
   records to **DNS only** (grey cloud), not proxied, so Vercel can issue its TLS cert.
3. **Cloudflare Turnstile** > the widget for this site > Hostname Management: add
   `ih8fullprice.com`. Turnstile validates against its hostname allowlist, so without
   this, signup and login fail on the new domain while still working on the old one.
4. **Supabase** > Authentication > URL Configuration: set Site URL to
   `https://ih8fullprice.com` and add it to Redirect URLs. Password-reset and
   confirmation emails are generated server-side from Site URL, and `redirectTo:
   window.location.origin` is rejected unless the origin is allowlisted.
5. **Google Search Console**: add the new property and submit the new sitemap.

Keep `mealdeals.vercel.app` alive and redirecting for a while — old shared deal links
(`?deal=<id>`) are already circulating and will 404 otherwise.

## 2026-08-14 — Multiple photos per deal; numeric normal-price field

**Multiple photos.** Deals could only ever carry one image (`deals.image_url`).
Added `deals.image_urls text[]` (`supabase/add_multiple_deal_images.sql`) and reworked
the post form to accept up to 5.

`image_url` is deliberately kept and mirrored to `image_urls[1]` on every write, rather
than dropped: `middleware.js` reads it directly to build the `og:image` for link
previews, so dropping it would break the unfurl on every deal link already shared.
Reads go through a new `dealImageUrls()` helper that falls back to `image_url` when the
array is empty, so pre-migration rows render without a special case.

Client changes (`src/App.jsx`):
- `imageFile`/`imagePreview` (single) replaced by one `images` array of
  `{ id, url, file? }` — `file` set only for photos picked this session and not yet
  uploaded, in which case `url` is an object URL. Object URLs are revoked on removal,
  form reset, and when opening a different deal for edit.
- Post form shows a thumbnail grid with per-photo remove buttons and a "Cover" badge on
  the first, since that one becomes `image_url`. Reordering isn't supported yet — to
  change the cover you remove and re-add.
- Deal detail uses a new `ImageGallery` component: scroll-snap strip with dot
  indicators for 2+ photos, plain `<img>` for one. Feed cards still show only the first
  photo, with a `📷 N` badge when there are more.
- Account deletion now collects storage paths from both `image_url` and `image_urls`
  (deduped) — it previously only cleaned up the single cover image, so extra photos
  would have been orphaned in the bucket.

Two bugs fixed while in here, both introduced-by-this-feature rather than pre-existing:
- Upload paths were `${user.id}/${Date.now()}.${ext}`. Uploading several photos at once
  lands them in the same millisecond, and combined with `upsert: true` the later upload
  silently overwrote the earlier one. Paths now include a `crypto.randomUUID()` and
  upload with `upsert: false`.
- File validation was `file.type.startsWith("image/")`, which accepts `image/svg+xml` —
  an SVG in a public bucket is a stored-XSS vector on the Supabase origin. Replaced with
  an explicit allowlist (JPEG/PNG/WebP/GIF), shared by the picker and the uploader.
  This is the client half of finding #4 from the July review; the bucket-level MIME
  restriction in the Supabase dashboard is still the actual enforcement and still needs
  doing.

**Normal price.** Now numeric-only: a `sanitizeMoney()` helper strips anything that
isn't a digit, allows a single decimal point, and caps at two decimal places, with the
"$" re-applied for display. Field is `inputMode="decimal"` so mobile gets the number pad.
It was always optional at the data layer (nullable, `.trim() || null`, no submit check),
but nothing said so — the label now carries an explicit "(optional)" marker matching the
Photos section. The *deal* price field is deliberately left as free text, since its
placeholder invites values like "$1/slice" and "50% off".

**Verified:** `npm run build` clean; app built with dummy Supabase credentials and
loaded in headless Chromium — renders with no page errors (only the expected network
failures to the dummy host). `npm run lint` shows the same 1 pre-existing error
(`fetchDeals` used before declaration) and 3 warnings as master — nothing new.

**Not verified:** the actual post/edit flow end-to-end. It needs a logged-in session
against a real Supabase project, which this environment has no credentials for. Before
trusting it, click-test: posting a deal with 3 photos, editing a deal to remove the
middle photo, editing to remove all photos, and confirming a pre-migration single-photo
deal still renders and can be edited without losing its image.

**Deploy order matters:** run `supabase/add_multiple_deal_images.sql` in the Supabase
SQL editor *before* deploying this code. The client writes `image_urls` on every
insert/update and will fail with "column image_urls does not exist" until the column
exists. The migration is backward-compatible, so running it early is safe.
