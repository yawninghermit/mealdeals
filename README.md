# MealDeals

A community-driven app for finding and sharing food deals in your area.

**Live:** [mealdeals.vercel.app](https://mealdeals.vercel.app)

---

## Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Auth protection:** Cloudflare Turnstile (CAPTCHA on signup, login, and password reset)
- **Deployment:** Vercel

---

## Features

- Browse and search food deals by meal time (Breakfast, Lunch, Dinner)
- Post deals with location, price, and schedule
- Upvote / downvote deals
- Comment on deals
- Moderator role for content management
- Map view of nearby deals

---

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your Supabase and Turnstile credentials
3. `npm install`
4. `npm run dev`

---

## Security

### Environment Variables

Supabase credentials and the Turnstile site key are stored in environment variables (`.env`) and never hardcoded. Vite's `VITE_` prefix ensures only client-safe variables are exposed in the bundle.

### Row Level Security (RLS)

All tables have RLS enabled in Supabase. Policies are enforced at the database level regardless of what the frontend does.

#### `deals`
| Operation | Who |
|-----------|-----|
| SELECT | Public |
| INSERT | Authenticated users only |
| UPDATE | Deal owner only |
| DELETE | Deal owner or moderator |

#### `comments`
| Operation | Who |
|-----------|-----|
| SELECT | Public |
| INSERT | Authenticated users only |
| DELETE | Comment owner or moderator |

#### `profiles`
| Operation | Who |
|-----------|-----|
| SELECT | Public |
| INSERT | Authenticated users only (own profile) |

### Vote Integrity

Votes are protected at the database level via a `user_votes` table and a custom `increment_votes` RPC function.

**`user_votes` table:**
- Primary key on `(user_id, deal_id)` — one row per user per deal, physically prevents duplicate votes
- RLS enabled: users can only insert/delete their own rows

**`increment_votes` function (`SECURITY INVOKER`):**
- Rejects unauthenticated calls (`auth.uid() is null`)
- Checks for an existing vote before writing:
  - If toggling the same direction → removes vote, decrements count
  - If switching direction → removes old vote, inserts new vote, adjusts count accordingly
- Vote count in `deals` table is always derived from actual `user_votes` records

This means vote manipulation via localStorage clearing, direct API calls, or repeated RPC calls is blocked at the database level.

### Authentication

- Email/password auth via Supabase
- Cloudflare Turnstile CAPTCHA required on signup, login, and password reset
- Session managed by Supabase (`onAuthStateChange`)
- Role (`moderator` vs standard user) fetched from `profiles` table on login
