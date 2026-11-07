# M3i9dat Ba Mbarek: ordering system

Real-time ordering for the snack shop in Meknès: a touch cashier that shows two 80mm tickets (downloadable as PDF), a touch kitchen screen with « En préparation » and « Terminées » zones, and an admin back office. Next.js 16 (App Router) + Firebase (Auth, Firestore, Storage). Prices in MAD, UI in French (all strings in `lib/i18n/fr.ts`).

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Firebase (Auth, Firestore).

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/login` | everyone | Email/password sign-in, then each account goes to its station |
| `/cashier` | cashier, admin | Product grid, cart with per-line sauce choice, "Valider la commande" saves the order and opens its two tickets in a window |
| `/kitchen` | kitchen, admin | Two zones: « En préparation » (oldest first, a « Terminé » button per card) and « Terminées » (today's last 20, newest first, « Manuel » / « Auto ») |
| `/admin` | admin | Products (CRUD, photo, availability, order), sauces, « Cuisine » (prep time), order history by day with daily total |
| `/preview/*` | development only | The three screens on fixture data (real menu, sample orders) for design review; 404 in production. `/preview/cashier` runs the whole flow with a local save, `/preview/tickets` opens the tickets window on a sample N° 007 with Arabic names, `/preview/kitchen` has orders in every state (tap « Terminé » to try it), `?n=14` crowds it, `?sound=prompt`, `?sound=locked` or `?sound=real` show the sound states |

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Firebase web config (Project settings > Your apps). These values are public by design; the rules do the protecting.
3. Firebase console:
   - **Authentication > Sign-in method**: enable Email/Password.
   - **Firestore**: create the database (it exists on `m3i9dat`).
   - **Storage > Get started**: needed for product photos. New projects need the Blaze plan for Storage. Without it, run the menu import with `--no-upload` (see below).
4. Deploy the rules (Firebase CLI, `npm i -g firebase-tools`, then `firebase login`):
   ```
   firebase deploy --only firestore:rules,storage
   ```
   On the first deploy the CLI asks to let Storage read Firestore (storage.rules checks the admin role in `users/{uid}`): answer yes, or photo uploads are refused.
5. Recommended: **Authentication > Settings > User actions**, untick "Enable create (sign-up)". Staff accounts come from the script below; nobody needs to self-register. (The rules already give an account without a role nothing.)
6. `npm run dev`, open http://localhost:3000

## Users and roles

Roles live in `users/{uid}.role` (`admin`, `cashier`, `kitchen`). The rules only let an admin assign roles, so accounts are created with the Admin SDK:

1. Firebase console > Project settings > Service accounts > **Generate new private key**. Save the JSON **outside the repo** and set its path in `.env.local`:
   `GOOGLE_APPLICATION_CREDENTIALS=C:\keys\m3i9dat-service-account.json`
2. Create the first admin, then the staff:
   ```
   npm run user:create -- --email patron@example.com --role admin
   npm run user:create -- --email caisse@example.com --role cashier
   npm run user:create -- --email cuisine@example.com --role kitchen
   ```
   Without `--password` a random one is printed once. Running it again for an existing email changes the role (and the password if given).

## Menu import (Glovo)

```
npm run import:glovo -- --dry-run      # fetch the Glovo page, write seed/products.json, touch nothing
npm run import:glovo                   # + copy photos into Storage and create the products
npm run import:glovo -- --no-upload    # keep Glovo's image URLs (Storage not enabled)
npm run import:glovo -- --from-json seed/products.json   # import a hand-edited file
```

The script reads the menu embedded in the public store page. Last run (2026-11-06): 21 products in 5 categories. Products are created with stable ids (`glovo-<id>`), so a re-run skips existing ones unless `--overwrite`. Things to check after importing:

- Prices are Glovo prices, which can differ from in-shop prices. Edit them in `/admin`.
- Names are kept exactly as on Glovo (several are in Arabic).
- Products where Glovo asks "حار / بدون حار" get the Tomate and Piquante sauces; drinks and معيقدات get none. Adjust per product in `/admin`.
- Glovo's other options (drink choice in combos, egg or no egg) and ingredient descriptions are not imported. They are kept for reference in `seed/products.json`. The cashier's per-line note covers them.

If the page ever blocks the script or changes shape, it stops without importing anything; fill `seed/products.template.json` by hand and use `--from-json`.

## How it works

- **Order numbers** restart at 1 every day (Africa/Casablanca). One Firestore transaction bumps `counters/{YYYY-MM-DD}` and creates the order; the rules only accept the two together (the counter moves by exactly one and names the order created in the same write), and the day must be today's.
- **No duplicate orders.** The cashier screen picks the order's document id (a Firestore auto-id) before the first save attempt and keeps it in `localStorage` until the save is confirmed. Every retry uses the same id; the transaction first reads `orders/{id}` and, if an earlier attempt was saved but its answer lost, returns that order (same number) and writes nothing. The id is dropped after a confirmed save or when the cashier taps "Vider" to start a new cart. If the cart was edited between the lost save and the retry, the screen says so: the tickets show the saved order, the one the kitchen has. Item prices and totals are computed by the cashier screen and only bounded by the rules; full server-side price checking would need a Cloud Function. Transactions need the network: offline, validation fails with a clear message and the cart is kept (also in `localStorage`, so a reload keeps it).
- **Order numbers on tickets** read `N° 007` (three digits, more if needed). Each shop day starts at 1: the day key is the date in **Africa/Casablanca** (`lib/i18n` `dayKey`), so the counter rolls over at midnight in Meknès (23:00 UTC normally, 00:00 UTC during Ramadan when Morocco is on UTC+0). Unit tests cover the rollover.
- **Tickets** (no printer: class/demo setup). After « Valider la commande » a window shows both tickets side by side (stacked on a phone): the **TICKET CLIENT**, light, with unit prices, line totals and the total; and the **TICKET MAGASIN**, with an orange banner, the number in very large type, large bold items and sauces, notes, the time, and no prices. « Nouvelle commande » (or Esc) closes it; the cart is already empty.
- **PDF download**: « Télécharger » under each ticket, or « Télécharger les 2 tickets » for both, saves `ticket-client-N007.pdf` / `ticket-magasin-N007.pdf` (two separate files). Generated in the browser, no server: the ticket as the browser draws it (`html-to-image`, with the page's fonts inlined) is placed on a `jsPDF` page **80mm wide**, height fitted to the ticket. That keeps the PDF identical to the screen and renders the Arabic product names correctly (Noto Sans Arabic is loaded for them; jsPDF's own text engine does not shape Arabic reliably). The PDF text is therefore an image, not selectable. A browser may ask once to allow "multiple downloads" for the two-ticket button.
- **Prep time.** `settings/kitchen = { prepDurationSec }` (default 300, between 30 s and 60 min), set in /admin > « Cuisine ». The cashier copies the current value onto each new order (`orders.prepDurationSec`), so a change only affects new orders. Create the document once with `npm run seed:settings` (it never overwrites an admin's value; the cashier falls back to 300 s if it is missing).
- **Order status.** New orders are `status: "preparing"`. « Terminé » on the kitchen screen writes `status: "completed"`, `completedAt` (server time) and `completedBy: "kitchen"`, nothing else (the rules enforce it, from preparing to completed only). An order still « preparing » after `createdAt + prepDurationSec` is **completed automatically**: the screens derive it (« Auto »), nothing is written, so it works after a refresh and even when no kitchen screen was open. Orders made before statuses existed count as « preparing » with 300 s.
- **Kitchen screen.** Server time on a 1-second tick (each screen measures its clock against Firestore every 10 minutes, `clock/{uid}`), so a refresh shows the same board. It listens to today's and yesterday's orders (an order made just before midnight can still be in preparation); « Terminées » shows today's only, the last 20. Each zone scrolls on its own; touch targets are 64px.
- **Kitchen sound**: a short, loud two-note chime (generated with the Web Audio API, no audio file) plays for each new order, never for the orders already on screen when the page loads. Browsers block audio until someone touches the page, so:
  - at startup `/kitchen` shows an **"Activer le son"** screen once per browser session: one tap, click or key press unlocks the sound and it disappears;
  - after a refresh the browser locks audio again: the header shows **"Son désactivé : touchez l'écran pour l'activer"** until someone taps anywhere;
  - **kiosk option** (nothing to tap, ever): start Chrome with `--autoplay-policy=no-user-gesture-required`, ideally with `--kiosk`, e.g. `chrome.exe --kiosk --autoplay-policy=no-user-gesture-required https://<your-site>/kitchen`. Audio is then allowed at load and neither the start screen nor the indicator appear.

  The orange flash on new orders works in every case. The screen also asks the browser to stay awake (Wake Lock).

## Commands

| Command | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (cart and sauce rules, order retries without duplicates, zones and auto completion, prep-time snapshot and settings, new-order detection, tickets and day rollover) |
| `npm run seed:settings` | Creates `settings/kitchen` (300 s) and `settings/sauces` if missing |
| `npm run typecheck`, `npm run lint` | TypeScript, ESLint |
| `npm run smoke-test` | Checks the **deployed** rules on the live project, role by role (needs `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`, and the same for `CASHIER` and `KITCHEN`, as environment variables only). Covers « Terminé » (kitchen only, completion fields only), prep-time bounds and the snapshot. Creates test orders and deletes them, puts today's counter and `settings/kitchen` back as they were |

## Without Firebase Storage (current setup)

Storage is not enabled on `m3i9dat` (it needs the Blaze plan), so `storage.rules` is in the repo but **not deployed**, products keep their Glovo photo links, and `/admin` shows an image-URL field instead of the upload button. To switch uploads on: enable Storage in the console, `firebase deploy --only storage`, set `NEXT_PUBLIC_STORAGE_ENABLED=true` in `.env.local` (and in the hosting environment), rebuild. Optionally re-import with `--overwrite` to copy the Glovo photos into Storage.

## Known limits

- Rules have not been run in the Firebase emulator (it needs Java). Deploy them to a test project first, or run `firebase emulators:start` where Java is available.
- Changing a product image deletes the old file; deleting a sauce from the list does not remove it from products (it simply stops being offered).

## Arabic later

Copy `lib/i18n/fr.ts` to `ar.ts`, translate the values (TypeScript checks the keys), register it in `lib/i18n/index.ts` and set `dir = "rtl"`. Layout uses logical properties where it matters (the kitchen progress bar already flips in RTL).
