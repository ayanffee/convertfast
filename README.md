# ConvertFast

Free bulk image converter with Stripe subscriptions and Clerk auth.  
Built to deploy on Vercel in under an hour.

---

## Stack

| Layer | Tool |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Hosting | Vercel |
| Auth | Clerk |
| Payments | Stripe |
| Database | Supabase |

---

## Setup Guide

### 1. Clone & open in VS Code

```bash
git clone https://github.com/YOUR_USERNAME/ConvertFast.git
cd ConvertFast
code .
```

---

### 2. Supabase — create database

1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** → paste the contents of `supabase/migrations/001_create_users.sql` → Run
3. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

### 3. Clerk — set up auth

1. Go to [clerk.com](https://clerk.com) → Create application
2. Enable sign-in methods you want (Email, Google, etc.)
3. Go to **API Keys** and copy:
   - Publishable key → paste directly into `public/index.html`, replacing `CLERK_PUBLISHABLE_KEY_PLACEHOLDER`
   - Secret key → `CLERK_SECRET_KEY`

---

### 4. Stripe — set up products and payments

#### Create products
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Products** → **Add product**
2. Create **ConvertFast Pro**:
   - Add price: $9/month recurring → copy `price_XXXX` → `STRIPE_PRICE_PRO_MONTHLY`
   - Add price: $84/year recurring → copy `price_XXXX` → `STRIPE_PRICE_PRO_ANNUAL`
   - Copy product ID `prod_XXXX` → `STRIPE_PRODUCT_PRO`
3. Create **ConvertFast Team**:
   - Add price: $29/month recurring → `STRIPE_PRICE_TEAM_MONTHLY`
   - Add price: $264/year recurring → `STRIPE_PRICE_TEAM_ANNUAL`
   - Copy product ID → `STRIPE_PRODUCT_TEAM`

#### Get API keys
4. **Developers → API Keys** → copy Secret key → `STRIPE_SECRET_KEY`

#### Set up webhook (do this after deploying to Vercel)
5. **Developers → Webhooks → Add endpoint**
   - URL: `https://your-domain.vercel.app/api/webhook`
   - Select events:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.deleted`
6. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

#### Enable Customer Portal
7. **Settings → Billing → Customer portal** → turn it on (lets users cancel themselves)

---

### 5. Deploy to Vercel

#### First time
```bash
npm install -g vercel
vercel login
vercel
```

#### Add environment variables
In Vercel dashboard → Your Project → **Settings → Environment Variables**, add every variable from `.env.example` with your real values.

Or use the CLI:
```bash
vercel env add STRIPE_SECRET_KEY
vercel env add CLERK_SECRET_KEY
# ... etc for all variables
```

#### Redeploy with env vars
```bash
vercel --prod
```

---

### 6. Point your domain

1. In Vercel → **Domains** → add `ConvertFast.io` (or whatever you bought)
2. Follow the DNS instructions (usually add a CNAME at your registrar)
3. Update `APP_URL` in Vercel env vars to your real domain
4. Update Clerk → **Domains** to add your production domain
5. In Stripe webhook, update the URL to your real domain

---

### 7. Test payments

Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.

1. Sign in on your site
2. Click "Get Pro"
3. Complete checkout with test card
4. Confirm you see "Pro" badge in the header
5. Check Supabase → Table Editor → users row updated to `plan: pro`

---

## Local development

```bash
cp .env.example .env.local
# Fill in .env.local with your keys

npm install
vercel dev   # runs both frontend and API functions locally
```

For Stripe webhooks locally, use the Stripe CLI:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhook
```

---

## File structure

```
ConvertFast/
├── public/
│   └── index.html          # The entire frontend app
├── api/
│   ├── me.js               # GET  /api/me — returns user's plan
│   ├── create-checkout.js  # POST /api/create-checkout — Stripe checkout session
│   ├── create-portal.js    # POST /api/create-portal — Stripe customer portal
│   └── webhook.js          # POST /api/webhook — Stripe webhook handler
├── supabase/
│   └── migrations/
│       └── 001_create_users.sql
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

## Revenue flow

```
User clicks "Get Pro"
  → frontend calls POST /api/create-checkout (with Clerk JWT)
  → API creates Stripe Checkout session
  → User pays on Stripe hosted page
  → Stripe fires checkout.session.completed webhook
  → POST /api/webhook updates Supabase: plan = 'pro'
  → Next page load: GET /api/me returns { plan: 'pro' }
  → Frontend sets window.__imgMax = 999999
  → User gets unlimited images
```

---

## Useful links

- [Clerk docs](https://clerk.com/docs)
- [Stripe Checkout docs](https://stripe.com/docs/checkout)
- [Stripe webhook docs](https://stripe.com/docs/webhooks)
- [Supabase docs](https://supabase.com/docs)
- [Vercel serverless functions](https://vercel.com/docs/functions)
