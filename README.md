# 🥫 PantryPal

**Never waste food again.** PantryPal is a mobile app that helps households track what's in their pantry, get AI-generated recipe ideas from what they already have, share a family shopping list, and cut down on food waste — with real data behind every screen, not just mockups.

Built as a solo project to learn full-stack mobile development: React Native on the front end, a real cloud database on the back end, and a live AI model for recipe generation.

---

## ✨ Features

- **📷 Barcode scanning** — point the camera at any product barcode; PantryPal looks it up via Open Food Facts and auto-fills the item name and brand. Falls back to quick manual entry (category picker, quantity stepper, smart expiry-date defaults) when a product isn't found.
- **🍳 AI recipe suggestions** — pulls your actual pantry contents and asks an AI model (via Groq) for recipes that use what you already have, flagging exactly what's missing for each one.
- **🛒 Shared shopping list** — a live, checkable list the whole household can add to, with notes per item ("get the low-fat one") and who added what.
- **📊 Waste insights** *(in progress)* — tracks which items get used vs. wasted over time, surfacing patterns by category and estimated savings.
- **🏠 Dashboard** — at-a-glance view of what's expiring soon, total items on hand, and quick access to every other screen.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| App framework | React Native + Expo (Expo Router for navigation) |
| Backend / database | Supabase (Postgres) |
| AI recipe generation | Groq API |
| Barcode → product lookup | Open Food Facts API |
| Camera | `expo-camera` |
| Language | TypeScript |

## 📱 Screens

| Dashboard | Add Item | Recipes | Shopping List | Insights |
|---|---|---|---|---|
| Live pantry stats, expiring items, quick actions | Barcode scan + manual entry with smart expiry defaults | AI-generated recipes from real pantry contents | Shared, real-time family checklist | Waste trends and savings *(in progress)* |

## 🚀 Getting Started

```bash
git clone <your-repo-url>
cd pantrypal
npm install
```

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GROQ_API_KEY=your_groq_api_key
```

Run it:

```bash
npx expo start
```

Scan the QR code with the [Expo Go](https://expo.dev/go) app on your phone.

### Database setup

Run this in your Supabase project's SQL Editor:

```sql
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text not null,
  quantity int not null default 1,
  expiry_date date,
  added_by text,
  created_at timestamp with time zone default now()
);

create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  category text,
  added_by text,
  checked boolean default false,
  created_at timestamp with time zone default now()
);

create table waste_log (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  category text,
  action text not null check (action in ('used', 'wasted')),
  created_at timestamp with time zone default now()
);
```

## 🗺️ Roadmap

- [ ] Real waste analytics dashboard (charts from `waste_log`)
- [ ] Household accounts / multi-user auth
- [ ] Row Level Security once auth is in place
- [ ] Push notifications for items about to expire

## 📄 License

MIT