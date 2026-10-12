# Wills Clothing

Online store for Wills Clothing with two parts:

- **Customer portal** (`/`): browse products, pick sizes and quantities, add to cart, and send the order on WhatsApp with Cash on Delivery or bank transfer.
- **Admin portal** (`/admin`): secure login to add, edit and delete products, upload images, set prices, sizes and stock, mark products available / sold out / unavailable, update inventory, and set the WhatsApp number and bank details.

Everything runs on free tiers: **Supabase** (database, admin login, image storage, live updates) and **Vercel** or **Netlify** (hosting).

## How the business rules are enforced

| Rule | How |
| --- | --- |
| Adding to cart never reduces stock | The cart is stored only in the customer's browser. Nothing is written to the database. |
| Only admins can change stock / mark sold | Supabase row-level security: visitors can only read. Every write checks the `admins` table. Stock changes go through the `adjust_stock` function, which rejects non-admins. |
| Stock stays the same until an admin changes it | Placing an order only opens WhatsApp. Admins update stock from **Admin → Inventory** after the sale. |
| Orders go to WhatsApp, no payment gateway | Checkout builds a `wa.me` link with every item, size, quantity, line price, total, payment method and delivery details. |
| COD or bank transfer | Chosen at checkout. Bank details (set in Admin → Settings) are shown when bank transfer is picked. |
| Updates show on the shop automatically | The shop subscribes to Supabase Realtime and refreshes when products, stock or settings change. |

Every stock change is recorded in an inventory log (who, when, how much, why), visible in Admin → Inventory.

## One-time setup (about 15 minutes, all free)

### 1. Create the Supabase project

1. Sign up at <https://supabase.com> and create a **New project** (free plan). Pick the region closest to your customers and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. This creates the tables, security rules, image bucket and live updates.
3. Open **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Admin accounts are created by you, not by visitors.
4. Open **Authentication → Users → Add user → Create new user**, enter the admin email and a strong password, and tick "Auto Confirm User".
5. Back in **SQL Editor**, make that user an admin (replace the email):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

   Repeat steps 4 and 5 for each additional admin.
6. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key. (The anon key is safe to put in the website; the security rules protect the data. Never use the `service_role` key in the website.)

### 2. Deploy the website (Vercel)

1. Sign up at <https://vercel.com> with your GitHub account.
2. **Add New → Project**, import this repository. Vercel detects Vite automatically.
3. Under **Environment Variables** add:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key
4. Press **Deploy**. Your shop is live at `https://<project>.vercel.app`, and the admin portal at `/admin`.

Netlify works the same way (`netlify.toml` is included): import the repo and add the same two environment variables.

### 3. Store settings

Sign in at `/admin`, open **Settings** and fill in:

- **WhatsApp number** for orders, with country code and no `+` or leading zero (for example `94771234567`). Use "Send a test message" to check it.
- **Currency label** (default `Rs.`).
- **Bank transfer details** shown to customers who choose bank transfer.

Then add your products under **Products → Add product**.

## Daily use

- **New stock arrived**: Admin → Inventory, enter the quantity next to the size, choose "Restock", press **+**.
- **Order confirmed on WhatsApp**: Admin → Inventory, choose "Sale", enter the quantity, press **−**.
- **Hide a product**: set its status to "Unavailable (hidden)". "Sold out" keeps it visible with a badge but stops orders.

## Local development

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

Without `.env.local` the shop runs in **demo mode** with sample products, so you can preview the design before Supabase is set up.

`npm run build` type-checks and builds to `dist/`.

## Free-tier notes

- Supabase free plan: 500 MB database, 1 GB file storage, 50,000 monthly active users. A free project is **paused after 7 days without any activity**; normal shop traffic keeps it awake, and a paused project can be resumed from the dashboard.
- Keep product photos under 5 MB (the admin portal enforces this). Around 300–500 KB per photo keeps the shop fast and lets you store thousands of images.
- Vercel / Netlify free plans comfortably cover a small store's traffic.

## Project structure

```
supabase/schema.sql      Database tables, security rules, storage bucket
src/lib/                 Supabase client, data access, cart, WhatsApp message
src/pages/               Customer portal pages (shop, product, cart)
src/components/          Shared layout and product card
src/admin/               Admin portal (login, products, editor, inventory, settings)
```
