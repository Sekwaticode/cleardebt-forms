# Clear Debt — Supabase Setup Guide

This connects your existing site (`index.html`, the three form pages, and
the dashboard) to a real Supabase database. Follow these steps in order.

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Pick a name, a database password (save it somewhere safe), and a region
   close to your users (e.g. an EU or `af-south-1`-adjacent region if
   available — South Africa isn't a native Supabase region yet, so pick
   the closest one).
3. Wait for the project to finish provisioning (~2 minutes).

## 2. Run the database schema

1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql` (included in this
   delivery) and click **Run**.
3. This creates:
   - the `submissions` table with the right columns, checks, and indexes
   - Row Level Security policies (public can submit forms; only signed-in
     admins can view/edit/delete)
   - two private Storage buckets: `signatures` and `pdfs`, with their own
     access policies

Check **Table Editor** → you should now see a `submissions` table, and
**Storage** → you should see `signatures` and `pdfs` buckets.

## 3. Create your admin login

The dashboard requires a signed-in user — there's no separate "admin"
concept, any Supabase Auth user can sign in.

1. Go to **Authentication → Users → Add user**.
2. Enter the email/password you (or your team) will use to log into
   `/pages/dashboard.html`, and create it. Repeat for each staff member.
3. Leave "Auto Confirm User" checked so it doesn't require an email
   confirmation step.

## 4. Get your API keys

Go to **Project Settings → API**. You'll need:

- **Project URL** (e.g. `https://abcdefgh.supabase.co`)
- **anon public** key
- **service_role** key (⚠️ never put this in frontend code — it's only
  used in step 6, inside the Edge Function's environment)

## 5. Wire up the frontend

Open `js/api.js` and replace the placeholders near the top:

```js
const SUPABASE_URL = "https://abcdefgh.supabase.co";       // your Project URL
const SUPABASE_ANON_KEY = "eyJhbGciOi...";                   // your anon public key
```

That's the only file that needs editing — `forms.js` and `dashboard.js`
already import from it.

## 6. Deploy the PDF-generation Edge Function

This needs the Supabase CLI (it can't be done from the dashboard UI alone).

1. Install the CLI if you don't have it: `npm install -g supabase`
2. From your project's root folder (the one containing the `supabase/`
   directory from this delivery), log in and link the project:
   ```
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (`YOUR_PROJECT_REF` is the subdomain in your Project URL, e.g.
   `abcdefgh`.)
3. Deploy the function:
   ```
   supabase functions deploy generate-pdf
   ```
4. The function needs the service-role key and URL as secrets (these are
   usually auto-injected in Supabase's hosted functions, but set them
   explicitly to be safe):
   ```
   supabase secrets set SUPABASE_URL=https://abcdefgh.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

Test it from the dashboard: submit a form, then click **PDF** for that
row — it should generate and preview a PDF on first click.

## 7. Deploy the static site

Host `index.html`, `dashboard.html`, the three form pages, and the `js/`
and `css/` folders anywhere that serves static files — Netlify, Vercel,
Cloudflare Pages, GitHub Pages, or your own server all work fine, since
everything talks directly to Supabase from the browser.

Make sure the folder structure on your host matches the paths already
used in the HTML (`/js/...`, `/css/...`, `/pages/...`) — no server-side
code is needed for the site itself.

## 8. Test the full flow

1. Open a form page, fill it in, draw a signature, click **Submit**.
2. Open `/pages/dashboard.html`, sign in with the admin account from
   step 3.
3. Confirm the new submission appears, **View** shows the field data and
   signature, **PDF** generates and previews a document, and **Edit**
   reopens the form pre-filled for further changes.

---

### Notes & things to decide later

- **Editing an anonymous draft.** Right now, only a signed-in admin can
  update a row (see the RLS policy comment in `schema.sql`). A client who
  saves a draft and closes the tab can't come back and edit it themselves
  unless you add an account system or a per-draft secret link — say if
  you want that built.
- **Email notifications** (e.g. notify a reviewer when a form is
  submitted) aren't wired up — Supabase can trigger a Database Webhook or
  Edge Function on insert if you want this next.
- **Approve/Reject actions** aren't in the dashboard UI yet, only
  View/Edit/PDF/Delete — the `status` column already supports `approved`
  and `rejected` if you want buttons added for those.
