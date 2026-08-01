# Audit prompt for MealDeals

Copy everything below the line into a fresh Fable session opened on this repo.

---

You are auditing **MealDeals**, a production web app I own and operate. I am the owner of the
repo, the Supabase project, and the Vercel deployment, so security testing of this codebase is
authorized. Your job is a full-quality pass: security, correctness, tests, performance,
accessibility, and general "is this actually production-grade" review.

## The stack, so you don't have to guess

- **Frontend:** React 19 + Vite 8, no router — the entire app is one ~2,100-line `src/App.jsx`
  plus `src/MapView.jsx` (react-leaflet). Styles are inline `styles.*` objects plus
  `src/App.css` / `src/index.css`.
- **Backend:** Supabase — Postgres with RLS, Supabase Auth, and two Storage buckets
  (`avatars`, `deal-images`). Tables include `profiles`, `deals`, `comments`, `deal_votes`,
  `saved_deals`, `reports`. Postgres RPCs: `cast_vote`, `delete_user`.
- **Edge:** `middleware.js` is a Vercel routing middleware that intercepts `/?deal=<id>` for
  known crawler User-Agents and returns hand-built HTML with Open Graph tags.
- **Config:** `vercel.json` carries the CSP and security headers. `.env.example` lists the
  `VITE_*` vars (Supabase URL + anon key, Turnstile site key, Sentry DSN).
- **Third parties:** Cloudflare Turnstile (CAPTCHA on auth), Sentry, Vercel Analytics,
  Nominatim (OpenStreetMap geocoding), CartoDB basemap tiles.
- **Existing state:** commit `629d422` was a prior OWASP pass; its output lives in
  `supabase/security_review_fixes.sql`. Treat that file as *claimed* fixes, not verified ones —
  it even says the names may not match the live database. There is currently **no test
  framework at all**; `npm run lint` is the only check.

## Rules of engagement

- Read before you conclude. No finding gets reported unless you can point to
  `file:line` and describe a concrete attack or failure path — inputs, who the attacker is,
  what they get. Kill your own speculative findings before writing them down.
- Do **not** attack the live site, the live Supabase project, or any third-party service.
  No load testing, no scanners against production, no hammering Nominatim. Static analysis,
  local runs, and local test suites only. If verifying something requires the live database,
  write the SQL query I should run and tell me what answer would mean a problem.
- Don't invent database state. You can read `supabase/security_review_fixes.sql` but you
  cannot see the deployed schema or policies. Where a conclusion depends on what's actually
  deployed, say so explicitly and give me a verification query.
- Never commit secrets, and never weaken a control just to make a test pass.

## Phase 1 — Security review

Work through these; they're the areas I actually worry about given this architecture.

1. **RLS is the only real authorization boundary.** Every `isModerator` / owner check in
   `App.jsx` is cosmetic — anyone can call PostgREST directly with the anon key, which is
   public by design. For each table and each RPC, tell me what a logged-in user with a raw
   `curl` could read, insert, update, or delete. Specifically: can a non-moderator read
   `reports`? Resolve one? Edit or delete someone else's deal or comment? Update someone
   else's `profiles` row? Set their own `role` to moderator?
2. **The `SECURITY DEFINER` functions** (`cast_vote`, `delete_user`, the role-escalation
   trigger). Check for unpinned `search_path` — the classic Supabase privilege-escalation
   footgun — and for any argument the function trusts without re-deriving. Confirm
   `delete_user` can only ever delete the caller.
3. **Storage buckets.** `App.jsx:359` and `App.jsx:623` upload with `upsert: true` and a
   client-supplied `contentType`. Examine how the object path is constructed: can a user
   overwrite another user's avatar or deal image? Is the bucket public-read? Can an SVG or
   HTML file be uploaded and then served from the Supabase domain as stored XSS? Are MIME
   type and file size enforced anywhere other than the client?
4. **`middleware.js`.** It fetches a deal with the anon key and interpolates
   `title`, `restaurant`, `price`, and `image_url` into HTML. Check: is `escapeHtml`
   sufficient for every context it's used in (attribute values, the `meta http-equiv=refresh`
   URL, the `<a href>`)? Can a user-controlled `image_url` point anywhere it shouldn't? Is
   there a caching or `Vary: User-Agent` problem where a crawler response gets served to a
   real user, or vice versa? Can the reflected `pageUrl` be used for redirect or injection?
   Does the middleware leak deals that shouldn't be publicly visible?
5. **Auth flows.** Signup, login, password reset (`App.jsx:373`, `:1866`, `:1918`). Look for
   account enumeration, the `redirectTo: window.location.origin` reset link, whether Turnstile
   is enforced on *every* path that creates or authenticates an account (including signup vs
   login vs reset), session storage in `localStorage`, and what happens to a stale session
   after `delete_user`.
6. **XSS and injection in the React app.** Audit for `dangerouslySetInnerHTML`, any
   user-controlled value reaching `href`/`src` (`javascript:` and `data:` URLs), and
   user-controlled strings reaching the Leaflet popups in `MapView.jsx`.
7. **CSP and headers in `vercel.json`.** Find the gaps: `style-src 'unsafe-inline'`, the
   absence of `frame-ancestors`, wildcard hosts in `img-src`/`connect-src`, missing HSTS.
   Tell me which are real risk and which are acceptable trade-offs for this app, and give me
   the tightened header block.
8. **Secrets and history.** Confirm only the anon key is ever shipped to the client and that
   no service-role key exists anywhere in the working tree or in git history.
9. **Abuse and rate limiting.** Comment spam, report spam, vote churn, mass deal creation,
   and unauthenticated abuse of the Nominatim geocode call at `App.jsx:582`. What's the
   cheapest way for one person to make this app unusable or expensive?
10. **Dependencies.** Run `npm audit`, check for known CVEs in the pinned versions, and flag
    anything unmaintained.

## Phase 2 — Tests

There are none. Build the foundation:

- Set up **Vitest + React Testing Library + jsdom**, wired into `package.json` as
  `npm test`, with a Supabase client mock so tests never touch the network.
- Write tests that would actually catch a regression — not coverage theater. At minimum:
  day/meal-time filtering (including the "defaults to today" behavior), vote state and
  optimistic UI, save/unsave, comment add and delete, the expired-deal date logic, edit
  permissions for owner vs moderator vs stranger, and the form validation on deal creation.
- Add **unit tests for `middleware.js`**: bot UA vs real UA, missing `deal` param, deal not
  found, Supabase fetch failure, and HTML-escaping of hostile field values.
- Add a small **Playwright** smoke suite (Chromium is already installed at
  `/opt/pw-browsers` — do not run `playwright install`) covering: page loads, filters change
  the visible list, the auth modal opens, and the map view renders.
- Report the final pass/fail output honestly. If a test fails because the *app* is wrong,
  that's a finding — fix it or flag it, don't delete the test.

## Phase 3 — Quality, performance, accessibility

- **`App.jsx` is 2,118 lines.** Propose a concrete decomposition (which components, which
  files, what shared state moves where) and estimate the risk. Don't perform the whole
  refactor unless it can be done without behavior change — if you do split it, keep the diff
  reviewable and prove behavior is unchanged with the tests from Phase 2.
- **Performance:** unnecessary re-renders, missing `useMemo`/`useCallback` on hot paths,
  N+1 Supabase queries, over-fetching (`select("*")`), unbounded lists, image sizes, bundle
  size and whether Leaflet should be lazy-loaded.
- **Accessibility:** keyboard navigation, focus management and escape handling in the modals,
  focus trapping, `alt` text, form label association, color contrast, touch target sizes,
  `prefers-reduced-motion`. Report against WCAG 2.1 AA.
- **Mobile and resilience:** the layout keys off an `isMobile` flag — check the breakpoints.
  Then check what the UI does on slow networks, on Supabase errors, on empty result sets,
  and offline.
- **SEO and PWA:** `index.html` meta, `manifest.json`, `sitemap.xml`, `robots.txt`,
  icon completeness.
- **Privacy honesty:** the in-app privacy policy (around `App.jsx:1561`) makes specific
  claims about data handling. Verify the code matches — especially geolocation, Sentry
  (is PII scrubbed?), and Vercel Analytics.
- **Lint:** `npm run lint` must be clean at the end.

## What to hand back

1. A findings table ordered by severity (Critical / High / Medium / Low / Informational).
   Each row: `file:line`, what an attacker or user does, what happens, and the fix. Mark each
   as **Confirmed** (you proved it in the code or a test) or **Needs DB verification** (it
   depends on deployed Supabase state you can't see).
2. A ranked "fix these first" list — top 5, with reasoning about actual exploitability for a
   small community app, not raw CVSS.
3. The code changes themselves: security fixes and the test suite, committed on a branch
   with clear messages. Keep security fixes and refactoring in **separate commits** so I can
   land them independently.
4. Any SQL I need to run in the Supabase dashboard, in a single file, with a comment above
   each statement saying what it fixes and what it might break.
5. A short list of things you deliberately did not do, and why.

Tell me plainly what's broken. I'd rather hear that the whole authorization model leans on
client-side checks than get a polite summary.
