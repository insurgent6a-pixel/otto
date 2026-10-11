# Setting up Otto

About 30 minutes, once. You need a Supabase account, a Vercel account, Claude, and your iPhone.
Do the steps in order. Every value you copy is marked **like this**.

## 1. Supabase project

1. Go to supabase.com, create a new project named `otto`, region **Southeast Asia (Singapore)**.
2. Open **SQL Editor**, paste all of `supabase/migrations/20261011000001_init.sql`, click **Run**.
3. New query, paste all of `supabase/migrations/20261011000002_full.sql`, click **Run**.
4. Open **Project Settings > API Keys** and keep the tab open. You need:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **Publishable key** (`sb_publishable_...`, the old "anon" key)
   - the **Secret key** (`sb_secret_...`, the old "service_role" key). Never share this one.

### Sign-in: email and password only

Otto signs in with an email and a password. It never sends email, so turn confirmation off:

**Authentication > Sign In / Providers > Email**: switch **Confirm email** off and save.

## 2. Push keys

On your computer, in this folder, run:

```
npx web-push generate-vapid-keys
```

Keep the **Public Key** and **Private Key** it prints.

Also make up a long random string for the **cron secret**, for example by running
`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo (private is fine), then in Vercel click **Add New > Project** and import it. Framework: Next.js, no other changes. (No GitHub? Run `npx vercel` in this folder instead.)
2. Before the first deploy, add these **Environment Variables** (all environments):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the Publishable key |
| `SUPABASE_SECRET_KEY` | the Secret key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the VAPID Public Key |
| `VAPID_PRIVATE_KEY` | the VAPID Private Key |
| `VAPID_SUBJECT` | `mailto:` plus your email |
| `CRON_SECRET` | your cron secret |
| `RESEND_API_KEY` | optional, see step 8 |
| `RESEND_FROM` | optional, e.g. `Otto <otto@yourdomain.com>` |

3. Deploy. Note your address, e.g. **`https://otto-yourname.vercel.app`**.

## 4. Create your account (this makes you the owner)

1. Open your Vercel address and tap **First time? Create your account**.
2. Enter your email and a password of at least 8 characters, then tap **Create account**.
3. Otto claims itself for your account and adds the 16 starting tasks. You land on Today.
4. Back in Supabase: **Authentication > Sign In / Providers**, turn **Allow new users to sign up** off. Nobody else can create an account now, and your sign-in keeps working.

From then on it's just email, password, **Sign in**. Change the password any time in **Settings > Account**.

**Forgot it?** In Supabase's **SQL Editor**, run this with your email and a new password, then sign in with it:

```sql
update auth.users set encrypted_password = crypt('your-new-password', gen_salt('bf'))
where email = 'you@example.com';
```

Your timezone starts as **WITA**. Change it any time in **Settings > Time zone** (WIB, WITA, WIT or any city).

## 5. Install on the iPhone

1. Open your Otto address in **Safari**.
2. Tap **Share > Add to Home Screen > Add**.
3. Open Otto from the home screen and sign in with your email and password. Let the iPhone save the password so next time it's one tap.
4. **Settings > Reminders > Turn on reminders**, allow notifications, then tap **Send test**.

On a Mac: Safari **File > Add to Dock**, or Chrome's **Install** button in the address bar.

## 6. Turn on Otto's clock (reminders, nightly plan, daily score)

1. In Supabase, **Database > Extensions**: enable `pg_cron` and `pg_net` if they aren't on.
2. Open `supabase/cron.sql`, replace `https://YOUR-OTTO.vercel.app` with your address and `YOUR_CRON_SECRET` with your cron secret.
3. Paste it in the **SQL Editor** and run it.
4. Wait 5 minutes, then run `select * from cron.job_run_details order by start_time desc limit 5;`. Status should be `succeeded`.

Supabase pings Otto every 5 minutes. Otto works out what's due in your timezone: the sweep at 00:30, the plan at 06:00, the summary at 08:00, the wrap-up at 17:00, the weekly review on Sunday at 17:00, the score at 23:55, and reminders 10 minutes before each block. Quiet hours (default 21:00 to 08:00) stay quiet.

## 7. Claude

### The Otto project (talk to Otto by voice or text)

1. In claude.ai: **Settings > Connectors > Supabase > Connect**, and allow only the `otto` project.
2. Create a **Project** called **Otto**.
3. In Otto, open **Settings > Claude**, tap **Copy** next to Project instructions, and paste them into the project's instructions.
4. Test it in the Claude app: "Demian meeting tomorrow at 2 for 30 minutes, chase Pak Arief about the Sultan DP Thursday". Both appear in Otto without a reload, each with a "From Claude" tag.

The instructions ask Claude for your timezone from Otto first, so meeting times stay right when you change zones.

### Optional: the smaller Otto connector

Instead of giving Claude your whole database, you can give it six actions only (add tasks, list today, list waiting, move, complete, plan the week):

1. In Otto, **Settings > Claude > Otto connector URL**, tap **Show** and **Copy**.
2. In claude.ai: **Settings > Connectors > Add custom connector**, name it `Otto`, paste the URL.
3. In the Otto project, turn the Supabase connector off and the Otto connector on.

Keep that URL private: it works like a password.

### Optional: a morning routine in Claude Code

If you use Claude Code, you can schedule a routine each weekday at 07:30 with this prompt:

> Using the Otto connector, list today. For any task that looks too big for one sitting, suggest a first step under 15 minutes and add it to that task's notes. For each waiting item due back today, draft a short polite follow-up message into its notes. Don't change dates or priorities.

## 8. Optional extras

- **Email fallback**: if no reminder reaches your phone for 24 hours, the 08:00 summary is emailed instead. Create a free resend.com account, verify a sending domain, set `RESEND_API_KEY` and `RESEND_FROM` in Vercel, then add your address in **Settings > Reminders > Backup email**.
- **Calendar on the iPhone**: **Settings > Calendar feed > Copy**, then on the iPhone: **Settings > Calendar > Accounts > Add Account > Other > Add Subscribed Calendar**, paste. Turn **Remove Alerts** off.

## 9. Siri Shortcut "Otto"

1. In Otto, **Settings > Siri Shortcut**: copy the **URL** and, with **Show**, the **Capture key**.
2. On the iPhone, open **Shortcuts > +**, name it **Otto**.
3. Add **Dictate Text**. Stop Listening: **After Pause**. Language: English (or Indonesian).
4. Add **Get Contents of URL**:
   - URL: the URL from step 1 (`https://your-otto.vercel.app/api/capture`)
   - Method: **POST**
   - Request Body: **JSON**, with two Text fields:
     - `p_secret`: the capture key
     - `p_text`: the **Dictated Text** variable
5. Add **Speak Text** with **Contents of URL** as input.
6. Test: "Hey Siri, Otto", then "chase navajo payment friday". Siri says "Added to Otto: Chase Navaho payment, due Fri ...". Otto fixes the names and reads the dates.

If it fails: "Wrong capture key" means the key doesn't match. A 401 or 404 means the URL is wrong.

(The Phase 0 version of the Shortcut, posting to `https://xxxx.supabase.co/rest/v1/rpc/otto_capture` with an `apikey` header, still works. It saves the words as-is without reading dates.)

## Things only you can fill in

Otto never makes these up:
- Your goals and bucket list (Goals tab).
- Real deadlines for the starting tasks. Otto marks them "deadline unconfirmed" until you confirm.
- The compost batch timeline: write it once in **Settings > Pipelines**, then tap **Start today** for each batch.
- Work hours, work days and high-energy windows: the defaults are 08:30 to 16:30, Monday to Saturday, high energy 08:30 to 11:30. Change them in **Settings > Your day**.
