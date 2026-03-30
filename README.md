# MealDeals

A community-driven app for finding and sharing food deals in your area.

**Live:** [mealdeals.vercel.app](https://mealdeals.vercel.app)

---

## Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (Postgres + Auth + RLS)
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

- Authentication via Supabase with Cloudflare Turnstile CAPTCHA
- Row Level Security (RLS) enabled on all tables
- Vote integrity enforced at the database level
