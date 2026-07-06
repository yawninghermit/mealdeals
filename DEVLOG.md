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
