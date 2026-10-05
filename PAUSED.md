# Ube Express — PAUSED (5 Oct 2026)

**Why paused (Alex):** waiting on a one-on-one with the manager. Colleagues haven't engaged (no effort on cocktail photos, no enthusiasm for a system that makes their shift easier), so further build effort is on hold until there's real buy-in.

**The idea is still alive:** Ube Express as a **service for hospitality staff**: cocktail spec lookup + Build Mode + Fruit Prep/labels/close-down prep + menu-vs-app discrepancy tracking (Cheers Trav), offered to bars beyond this one. Revisit after the manager meeting.

## State at pause (all live on ubeexpress-nine.vercel.app, main @ see git log)
- 97 drinks (54 cocktails / 43 mocktails). 95 have a full method; every amount is filled in except Hugo Spritz.
- Shipped Oct 1–5:
  - Grouped-cocktail search
  - Fruit Prep: garnish/props split, label date edit, 🌙 Make at Close mixes
  - 5 Halloween drinks (grouped, "Upcoming" badge, `is_upcoming`)
  - Cold Foam drinks (25ml syrup shot + 75ml foam)
  - Suggest-a-photo fixes (stale-token retry, real errors, home card refresh)
  - Back = screen history (incl. Android back + Build Mode steps) + floating thumb Back + "pick up where you left off" resume
  - iPhone home-screen install (icons, manifest, Add-to-Home-Screen hint)
  - Method audit + 7 methods filled from the Joiners Arms specs
- Full change log: `data_integrity_report.md`.

## Open when resuming
**Specs to get:**
- Dr Popper method
- Hugo Spritz (whole spec)
- Homemade Raspberry-ade recipe
- Witches Kiss lemonade ml
- Mont Blanc Cold Foam real spec

**To confirm:**
- Midnight Margarita lime 25ml
- Bloody Bathtub premix + red-sludge guess
- Minion foam = house cold foam + yellow (and whether banana syrup goes in the foam)
- Peach Crumble 50ml lemonade
- Grapefruit Bliss freeze-dried raspberries / glass
- Cookie Monster "fish bowl" glass

**Manual deletes** (the DB tool here can't delete):
- the 5 Cold Foam milk rows
- Witching Hour Soda Water row
- retired Cherries row

SQL is in `data_integrity_report.md`.

**Live checks never done on a phone:**
- staff suggest-a-photo end to end
- resume prompt
- iPhone install

**Not started:**
- Rest of the "nonsense" list (raspberries, blackberries, cucumber, oranges, grapefruit, peach, lychee, pomegranate, chilli; sweets batch 2; pantry batch 3)
- Props/straws showing red on Fruit Prep (take them off prep?)
- Halloween garnishes not yet on Fruit Prep
- Untick "Upcoming" on the Halloween drinks at launch
