# IITB Free Fire leaderboard

This is a static website backed by Supabase. Visitors can read the standings. Only a Supabase Auth user explicitly added to `tournament_admins` can edit team names or publish match scores. Row Level Security (RLS) enforces that rule in the database, so hiding the organizer controls in the page is not the security boundary.

## One-time setup

1. Create a Supabase project at [supabase.com](https://supabase.com/). In **SQL Editor**, run all of `setup.sql`.
2. In **Authentication → Providers**, keep Email enabled. In **Authentication → Settings**, turn off public sign-ups. Create your own user under **Authentication → Users** (do not share that account).
3. Copy the user's UUID from the Users page. In SQL Editor run `insert into public.tournament_admins(user_id) values ('YOUR-USER-UUID');`.
4. In **Project Settings → API**, copy the Project URL and the publishable/anon key into `config.js`. These are safe to put in a browser page only because RLS is enabled. Never use the service-role key.
5. Upload this whole folder (`index.html`, `style.css`, `app.js`, `config.js`) to a static host such as Netlify. Set the deployed site URL as the Supabase Auth Site URL. Share the deployed `https://…` site URL for view-only access.
6. Open the site, sign in using your organizer credentials, select a group and match, enter each team name, assign every elimination rank once (1 = first eliminated, 12 = Booyah), add kills, then publish. Viewers see the updated leaderboard without signing in.

Keep `setup.sql` and the `config.js` filled with your public URL/key; do not publish database passwords, organizer passwords, or a service-role key. To give another organizer editing rights, create their Auth user and add their UUID to `tournament_admins`; otherwise leave sign-ups disabled.

## Scoring implemented

Kills are 1 point each. Placement points are 0 for ranks 1 and 2, 1 through 9 for ranks 3 through 11, and 12 for rank 12 (Booyah). The website adds kill and placement points per match, discards each team's lowest of five scores, and sums the remaining four. Unplayed matches are omitted until entered.

The project URL and key still need to be added to `config.js`, and the app needs to be deployed to your hosting account before it has a shareable public link. The existing local HTML prototype is not an authenticated shared site.
