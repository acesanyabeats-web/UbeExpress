# Data Integrity Report — Ube Express

Compiled 30 Sep 2026, at Alex's direct request, for reference in future
development decisions. This is the durable record: every real
inconsistency found across the project's history, split cleanly into
**resolved** (with a real date and what actually changed) and
**unresolved** (open, waiting on Alex's own call). Nothing here is
guessed — every claim below is backed by one of:

- **Git history** (`git log`, `git show`) — the only place a CODE change
  is dated and diffed.
- **Supabase `created_at`/`updated_at`** on `cocktails` — the only signal
  for whether a DATA row has ever been touched since insertion (there is
  no audit/history table, so this can say *whether* and *when*, never
  *what changed*, for anything not also in a git commit).
- **`notes_flagged_recipe_issues.md`** — the running flag log kept
  alongside every data-entry batch.
- **Real photos** — the official printed menu (10 photos, 29 Sep) and
  the bar's own physical prep/use-by labels (4 photos, 30 Sep).

**Headline finding, stated plainly**: of the ~30 real inconsistencies
flagged across this project's whole history, exactly **2 code-level
fixes** (covering 3 cocktails) have ever actually been resolved.
Everything else — every batch, every discrepancy — is still exactly as
first entered. This isn't a guess; it's what `cocktails.updated_at`
actually shows across all 86 rows.

> **Superseded 1 Oct 2026 (session close-out, see the last section):** that
> headline was true on 30 Sep and isn't any more. A full day of fixes has
> landed since — step merges, ingredient renames/merges, the Mint split, the
> label-machine mapping, shelf lives, and every menu-vs-app conflict moved into
> the live **🍻 Cheers Trav** tracker. Read the session close-out at the bottom
> for the current picture.

---

## Resolved

### 2026-09-29, 02:12 UTC — `6daaa3f` — real per-step amount bug + 3 name mismatches
**What was found**: Pink Gin Sling's Raspberries showed the same master
total (3, itself wrong) at every build step that used it, because there
was no way to record a different amount per step — the recipe's own
instructions already specify a real split (2 muddled, 2 into the glass,
1 for garnish = 5 total).

**What was fixed**: a real per-step `ingredient_amounts` override was
added (Live Build Mode now shows the true per-step amount; the detail
overview shows the true total with a "total" tag). Pink Gin Sling's
master Raspberries amount corrected **3 → 5** in Supabase. Separately,
in the same pass, real ingredient-*name* mismatches between a step's own
instruction text and the master ingredient list were found and fixed
across **3 cocktails** (Peach Pony Club, Pink Gin Sling, Witching Hour —
the only 3 rows in the entire `cocktails` table whose `updated_at`
differs from `created_at` at all): "ASUKI Yuzu Citrus 17% Liquor" vs.
"ASUKI Yuzu Citrus", and similar drift for Real - Peach Puree, Fever
Tree - Ginger Ale, Mint - Fresh, and Milk Semi Skimmed — renamed to the
fuller branded name already used in the step text, since the mismatch
meant the amount could never be shown. A stray "Oranges" step reference
was corrected to the real "Orange Zest" ingredient (amount 0 → 1).

**This is almost certainly what `notes_flagged_recipe_issues.md`'s own
opening line means by "the earlier 3-cocktail pass"** — the file
references it as precedent but never recorded what it actually was.
Real evidence for the match: exactly 3 cocktails, exactly these 3,
exactly this timeframe, nowhere else in the table's history.

### 2026-09-29, 02:22 UTC — `a67aaf2` — real amounts for Witching Hour's cold foam
**What was found**: the prior commit had cleaned up Witching Hour's
cold-foam step text into real candidate ingredient names (Lemon Sorbet,
Soda Water) but explicitly flagged them as having "no master ingredient
row/amount yet."

**What was fixed**: Alex's exact spec (one scoop of lemon sorbet, soda
water added to taste until a snow-sludge consistency, mixed with a
barspoon) was captured for real — `scoop` and `to taste` added as real
selectable units, Lemon Sorbet set to 1 scoop, Soda Water to-taste with
a null amount, the barspoon technique folded into the step's own
instruction text, and the step's equipment changed glass → bar_spoon to
match. A real, separate display bug was caught and fixed in the same
pass: a unit-only ingredient like "to taste" rendered with a stray
leading space in one place and vanished entirely in Live Build Mode in
another — a shared `fmtAmtUnit()` helper now makes all three display
sites consistent.

**Still open despite this fix**: the Sep 29 physical-menu cross-check
(see Unresolved, below) later found Witching Hour tracks several
ingredients (Lemon Sorbet, Lime Juice, Mixed Berry Coulis, Soda Water)
that don't appear on the real printed menu at all, and is missing
"sugar syrup," which does. This 02:22 fix resolved a real *amount* gap;
it did not resolve — and predates the discovery of — a real *content*
mismatch against the actual menu. Two different bugs on the same drink.

### 2026-10-01 — direct data edit (no commit hash, content-only) — Blue Heat's steps 3–5 merged
**What was found**: walking Blue Heat step-by-step via the new step-photo
frames (real hands-on use of the feature, not a code review) surfaced
that 3 of its 5 steps were each too small to warrant their own frame:
"Add two black straws," "Top with crushed ice cap," and "Garnish with
dehydrated lime and birds eye chilli" — three separate taps for what's
really one continuous finishing sequence.

**What was fixed**: those 3 steps merged into 1 ("Add two black straws,
top with crushed ice cap, then garnish with dehydrated lime and birds
eye chilli"), carrying over both real ingredients (Dried Lime Slices,
Birds Eye Chillies) and the one real photo already set on the garnish
step (the other two had none). Blue Heat: 5 steps → 3. Verified via a
direct Supabase re-query post-edit — `jsonb_array_length` = 3, all
content present, zero data lost.

**The broader pattern this surfaced — see Unresolved L, below.**

### 2026-10-01 — direct data edit (no commit hash, content-only) — Galaxy Soda, same treatment, rule now explicit
**What was found**: Alex went through Galaxy Soda step-by-step the same
way and named the actual rule driving these merges, rather than leaving
it to per-drink judgment: **a step with no photo merges forward into
the next step that has one.**

**What was fixed**: applied mechanically across Galaxy Soda's real 8
steps. 3 no-photo steps each absorbed into the next photo'd step —
"Add the sala syrup and mix" into "Add a straw"; "Add 10 drops of
butterfly pea..." into "Add the blue curacao..."; "Cap with crushed
ice" into "Garnish with blueberry and strawberry boba and a mint
sprig." Galaxy Soda: 8 steps → 5. Verified via direct re-query: 5
steps, 0 missing a photo — every resulting step now has one, which is
the actual point of the rule, not just a smaller step count.

**Open edge case, not yet hit by either real example**: the rule has no
defined behavior for a TRAILING no-photo step with no later photo'd
step to merge forward into (Blue Heat and Galaxy Soda both happened to
end on a photo'd step). Will need a real answer — merge backward
instead, or leave it standalone — whenever a cocktail actually has one.

### 2026-10-01 — direct data edit — 4 more drinks' steps merged, by Alex's own call
Same rule as Blue Heat/Galaxy Soda (each merged step keeps the one photo
and frame size it already had; instructions joined, ingredients and
per-step amounts carried over, nothing dropped):
- **Peach Pony Club**: step 2 + 3 merged ("…to side of glass, then top
  with ginger ale and ice cap"). 4 steps → 3.
- **Pink Gin Sling**: 2 + 3 merged; 4 + 5 + 6 merged ("Add 2 black
  straws and a crushed ice cap, then garnish…"). Per-step raspberry
  amounts (2 / 2 / 1) kept. 6 steps → 3.
- **Sakura Pink**: the sala-syrup pipette (old step 5) moved to step 3;
  old 3 + 4 merged into the garnish step as the new step 4 ("Add two
  black straws and top with crushed ice cap, then garnish…"). 6 → 4.
- **Berry Butterfly**: 1+2, 3+4, 5+6, 7+8 merged. 8 steps → 4.

Verified by direct re-query: all 14 resulting steps have a photo. No
staff photo candidates were pending for these drinks, so none needed
re-pointing.

### 2026-10-01 — shelf life now comes from the real labels (resolves section J)
**What was wrong**: the Label List used a guessed 24h (fresh) / 72h
(homemade batches) shelf life, and never labelled sweets/garnish stock.

**What changed**: shelf life is now stored per ingredient
(`ingredient_photos.shelf_life_hours`) and editable in the admin
Ingredients table. 20 ingredients were set straight from the 30 Sep
label photos (10 fresh produce at 3 days, 6 days Pineapple, 7 days
Tinned Lychee, 14 days 4 Popping Balls + Glace Cherries, 28 days
Desiccated Coconut/Lime Cordial/Homemade Lemonade). *(Corrected same
day: first logged as "22" — a miscount in the write-up; a live re-query
confirms 20, which matches the label list exactly.)* The guessed defaults are gone —
an ingredient with no known shelf life now says "shelf life not set"
instead of printing a made-up date. Sweets/garnish items are labelled
too. The label time is saved when a colleague presses **Done** on the
Label List; expiry = label time + shelf life, and anything expiring
tomorrow or earlier appears on Fruit Prep's "Throw Out Tonight" list.

**Deliberately left blank, needing Alex's call**: plain "Mint" (the
label says "Mint – Fresh"), "Giant Marshmallows" (the label says
"Marshmallows" — maybe not the same product), "Popping Balls –
Blueberry", "Homemade Raspberry Lemonade – Batch", "Lime Juice – Fresh".
Still untracked from the labels: "Popping Balls – Mango", "Guest
Sweets". The pink handwritten note is still not transcribed.

**Follow-up fix, same day — a real bug Alex's own renames exposed**:
Fruit Prep decided which ingredients appear on its lists from a
hard-coded list of names in the app's code. After Alex renamed 4 of
them in the Ingredients table ("Homemade Raspberry Lemonade - Batch",
"Sprinkles (Hundreds&Thousands)", "Food Colouring - Green", "Freeze
Dried Raspberries - NEW"), those 4 silently dropped off Fruit Prep.
Fixed at the root: each ingredient now carries its own Fruit Prep group
(`ingredient_photos.prep_group`), seeded from the old lists (21 Fruit &
Syrups + 44 Sweets & Garnish, verified to match exactly), editable in
the Ingredients table roll-down, and carried along by renames, swaps
and merges.

### 2026-10-01 — Alex's pink list transcribed + label mapping + 2 merges
The pink handwritten note (re-sent clearly) is now transcribed. It
lists which printed label the bar actually uses for products whose own
name has no label. Now stored per ingredient (`label_name`, `no_label`)
and shown on every Label List card ("Use label: …" / "No label exists"):

| Ingredient | Label used | Shelf life set |
|---|---|---|
| Birds Eye Chillies | Red Chilli | 3 days (unchanged) |
| Blackberry | Raspberries (Alex: "???") | 3 days |
| Cherries | Glace Cherries | 14 days |
| Homemade Raspberry Lemonade | Homemade Lemonade | 28 days |
| Lime Juice – Fresh | Cordial – Lime | 28 days |
| Lychee | Tinned Lychee | 7 days |
| Mint – Fresh | Mint Leaves | 3 days (unchanged) |
| Giant Marshmallows | Marshmallows | 7 days |
| Popping Balls – Blueberry | Popping Balls – Mango | 14 days |
| Peach, Pomegranate Seeds, Chai Seeds, Dried Dragonfruit | **no label exists** | — |

Orange Zest is on the list with no label named — left blank. A small
circled note next to Cherries, Lychee and Orange Zest is not legible
enough to act on (possibly "(ai)") — waiting on Alex.

**Merges (Alex-confirmed)**: "Mint" → "Mint – Fresh" (8 drinks, 0
using both; now 49 drinks) and "Mixed Berry Coulis – VAT PACK" →
"Mixed Berry Coulis" (Pink Moon). Done directly on ingredient rows and
step ingredient lists only — step text left untouched. 158 → 156
ingredients.

**Real bug found and fixed while doing this**: the swap/merge tool
rewrote the old name inside step text case-insensitively — merging
"Mint" that way would have turned every "a mint sprig" into "a Mint –
Fresh sprig" across 30+ drinks. It now only replaces an exact,
same-case name.

---

## Unresolved

> **1 Oct 2026 — where these now live.** Every *menu vs Chilled Pubs app* item in
> sections A–E below moved into the app's own **🍻 Cheers Trav** table
> (`menu_discrepancies`), which is now the source of truth for them — check
> there, not here. Status per row as of close-out:
> - **In Cheers Trav, open:** Galaxy Soda (now only strawberry vs *raspberry* —
>   blueberry was added), Mad Scientist, Witching Hour, Coco Loco, Pornstar
>   Martini, Mermaid Shake, Give me S'mores, Sweet Shop, Key Lime Pie (C),
>   Baby Bath (B), Apple Cooler / Strawberry Wizz Fizz / Homemade Ginger-ade /
>   Bathtub (D), plus a new one: Homemade Raspberry-ade's batch name.
> - **Removed by Alex as not needed:** Dancing Queen, Pick Me Up, Pink Gin Sling,
>   the Raspberry/Passionfruit Cooler naming question, and the systemic
>   "boba balls" question (E).
> - **Still only here (app-internal, not menu-vs-app, so not in Cheers Trav):**
>   Mojito Blackberry, Pimms Jug 125/150ml, Homemade Cherry Cola's method,
>   Dragon's Potion pencil/chai, the 501ml lemonade, Mango Syrup 50g, Lemon
>   0.05g, Chai vs chia, Coconut "Dessicated", and everything in F.

Organized by which two things disagree — the same split used in the
[artifact version of this list](https://claude.ai/artifact/25wHFNYnzLGYhhKz7e4MZL),
kept here as the durable, dated source of truth.

### A. App vs. the physical menu
*(the tracked recipe says something the real printed menu doesn't, or is missing something it says)*

| Drink | What's wrong | Flagged |
|---|---|---|
| Dancing Queen | Tracks "freeze dried raspberries" (ingredient + garnish agree with each other); menu says "freeze-dried **strawberry** pieces" | 29 Sep |
| Galaxy Soda | Tracks strawberry boba (ingredient + garnish agree); menu says "blueberry + **raspberry** boba" | 29 Sep |
| Mad Scientist | Missing "fresh lemon juice" and "soda water," both on the real menu | 29 Sep |
| Witching Hour | Tracks Lemon Sorbet, Lime Juice, Mixed Berry Coulis, Soda Water — none on the real menu; menu's "sugar syrup" isn't tracked | 29 Sep |
| Coco Loco | Tracks "Tails Porn-star Martini Mix" with no connection to this drink on the real menu — possible copy-paste leftover | 29 Sep |
| Pornstar Martini | Missing "Mexican lime juice" and a separate passionfruit juice (distinct from the puree already tracked) | 29 Sep |
| Mermaid Shake | Tracks Ube Extract, not on the real menu for this drink; menu's "double chocolate syrup" isn't tracked (only white is) | 29 Sep |
| Give me S'mores | Missing "marshmallow paste," the FIRST ingredient on the real menu | 29 Sep |
| Sweet Shop | Tracks Post Mix Lemonade, not on the real menu's list | 29 Sep |
| Pick Me Up | Tracked as "Sugar – Granulated"; menu says "sugar syrup" | 29 Sep |
| Pink Gin Sling | Gin tracked as "Chilled Raspberry Pink Gin"; real product name on the menu is "Chilled Pub's Lychee & Raspberry Gin" — possibly a different bottle | 29 Sep |
| "Raspberry, Passionfruit & Lemon Cooler" (menu) vs. Passionfruit Cooler (app) | Genuinely unclear if same drink renamed or two drinks — not merged, not duplicated | 29 Sep |
| Mojito Blackberry | Puree, method text, and garnish all say raspberry; only the fruit-chunk row says Blackberry | Batch 1 |
| Pimms Jug | Method says 125ml Pimm's; ingredient row says 150ml | Batch 1 |
| Homemade Cherry Cola | Method mentions a lemon wedge and homemade lemonade mix; neither exists in this recipe's own ingredients | Batch 1 |
| Dragon's Potion | Garnish text says "strawberry pencil"; tracked ingredient is "Cherry Pencils" | Batch 1 |
| Homemade Lemonade – 501ml | Identical, implausible value in both Key Lime Pie and Mango Smooth | Batch 4 |
| Real - Mango Syrup – 50g | Gram unit on what's almost certainly an ml syrup | Batch 4 |
| Lemon – 0.05g (Honey and Lemon Soda) | Same "lemon in grams" class as Batch 1's 0.25g instances | Batch 4 |

### B. App inconsistent with itself
*(the app's own fields disagree with each other, independent of the menu)*

| Drink | What's wrong | Flagged |
|---|---|---|
| Baby Bathtub | Real three-way conflict: ingredient row says passionfruit boba; the app's own garnish field says "mango bubbles"; the menu says "passionfruit boba bubbles" | 29 Sep |

### C. App inconsistent with an earlier entry source
*(conflicts with a different screenshot batch used to enter the same drink originally, not with this menu)*

| Drink | What's wrong | Flagged |
|---|---|---|
| Key Lime Pie | Tracks Vanilla Gelato — not on this menu's ingredient list at all, but present in Batch 4's own original screenshot source | 29 Sep |

### D. Naming-only (ingredients match; display name differs from the real menu)
- Apple Cooler (app) vs. "Apple N Raspberry Cooler" (menu)
- Strawberry Wizz Fizz (app) vs. "Baby Wizz Fizz" (menu)
- Homemade Ginger-ade (app) vs. "Homemade Lemon N Gingerade" (menu)
- Bathtub (app, no boba tracked, garnish says only "rubber duck, mint
  sprig, lemon/lime slices") vs. "Chilled Bathtub" (menu, £14, for-2,
  has boba) — may genuinely be two different real menu items, not a
  renamed duplicate
- Dragon's Potion — ingredient row "Chai Seeds" vs. method text "chia
  seeds" (source-side typo, transcribed as shown)
- Coconut Dessicated vs. "desiccated" in method text

### E. One systemic naming question covering several drinks
The real menu consistently says **"boba balls"** everywhere the app
tracks `Popping Balls – [flavour]` (Double Dutch, Pop Stars, both
Bathtubs, several Homemade Sodas). Popping boba (bursts with liquid) and
standard chewy boba are genuinely different real products — worth one
answer that resolves every instance at once, not a per-drink fix.

### F. Structural gaps
- **No price column anywhere in the schema.** Every menu photo was full
  of real prices; nowhere to store them. Prices for this batch's 8 new
  drinks are known; the other ~78 aren't.
- **Butterfly Pea** fits neither Fruit Prep classification list
  (Batch 4) — left uncategorized on purpose.
- **Dragon Fruit and Lychee Soda**'s method text was cut off in its
  original screenshot source — entered with real ingredients, empty
  method (Batch 4).
- **Glass icon gap** — several real vessels (handled jar/mug, mini
  bathtub, goldfish bowl, mermaid glass) have no dedicated icon; mapped
  to the closest existing one. Data is right, icon may not be.

---

## Source-to-source cross-check: workplace app screenshots vs. physical labels vs. printed menu

A different question from everything above: not "does the app disagree
with one source," but "do the three real sources disagree with *each
other*." Real method, stated plainly: I no longer have the original
workplace-app screenshot image files — they were shown earlier in this
conversation and their pixels aren't retained in my context. What I do
have is every Batch 1/4 recipe's **current, untouched Supabase data**,
which the Resolved section above already proved is a faithful proxy for
what those screenshots said — nothing has been edited since entry except
the 3 cocktails covered there. So "screenshot source" below means that
untouched data, cross-checked against the newer label and menu photos.
**If you resend the original workplace-app screenshots, I can re-verify
against the actual pixels instead of this proxy** — worth doing if you
want full confidence rather than this reconstruction.

### G. A naming conflict I introduced myself — decided
- **Lime Cordial** — entered two batches ago as a new, unmatched
  ingredient for Electric Reef because nothing in the tracked vocabulary
  fit. The real physical label for the same product reads **"Cordial -
  Lime."** Same real bottle, wrong word order on my part. **Decided
  2026-10-01: keep the app's existing "Lime Cordial" naming** — not
  renamed to match the label.

### H. Real product-identity questions the labels surface, unresolved
- **Birds Eye Chillies** (tracked in-app, used in Blue Heat) vs. **"Red
  Chilli - Prepped"** (label) — genuinely unclear whether this is the
  same specific chilli variety under a shorter label name, or a second,
  different chilli the app has never tracked at all.
- **Grapefruit Pink** (tracked in-app, several drinks) vs. plain
  **"Grapefruit - Prepped"** (label, no "pink" qualifier) — plus my own
  newly-invented "Grapefruit Soda"/"Grapefruit Gin" for Grapefruit
  Bliss, both unconfirmed brands. Real question whether the bar stocks
  plain grapefruit as a separate line from pink, which the app has never
  distinguished.
- **Giant Marshmallows** (tracked in-app, Give me S'mores) vs. plain
  **"Marshmallows"** (label) — the same open naming question the Sep 29
  batch already raised, now backed by a second, independent source using
  the shorter name.

### I. Absence as evidence — flagged cautiously, not concluded
- **Coconut Shaved** is tracked in 3 real recipes (Coconut Cloud, Dragon
  Fruit Cloud, Ube Cloud), but no "Coconut Shaved" label appeared among
  the 4 photos — only "Coconut - Dessicated" did. Could mean shaved
  coconut doesn't get its own use-by label (derived from the desiccated
  stock rather than a separate line), or it simply wasn't in this
  particular batch of photos. Four photos is a partial capture of a
  longer prep list, not proof either way — not treated as a real
  conflict, just named.

### J. A real, precisely-known shelf-life gap
- **Homemade Lemonade** — the real label shows a genuine 28-day shelf
  life (an "opened product" format, not a daily-prep one). The app's own
  placeholder (`LONG_SHELF_LIFE_ITEMS`, `PREP_SHELF_LIFE_HOURS_LONG`) is
  72 hours. That's not just "wrong" the way the 24h default was flagged
  as a guess when built — it's now a known, precise **9x undershoot**,
  since real evidence exists to measure it against.

### K. Checked and clean — recorded, not left silent
Glace Cherries, Tinned Lychee, Oranges, Pineapple, Passion Fruit, and
Popping Balls – Lychee/Strawberry/Raspberry/Passionfruit all match
cleanly across whichever of the three real sources mention them. Stated
here so a future pass doesn't have to re-check them from scratch.

### L. Step granularity — a real, now-explicit rule, gated on photos existing first
Alex's own direct observation, walking Blue Heat step-by-step: "most
recipes will have steps merge, no point in many steps where it can be
combined." Galaxy Soda's pass (above) made the actual rule explicit:
**a step with no photo merges forward into the next step that has
one.** Mechanical, not a per-drink judgment call each time — the only
real per-drink work left is writing the merged instruction so it reads
naturally (a plain "X, then Y" has worked for both real cases so far)
and double-checking equipment stays consistent across what's being
folded together.

**2 of 86 done**: Blue Heat (5→3 steps) and Galaxy Soda (8→5 steps),
both re-verified post-edit with zero data lost and every resulting step
carrying a real photo.

**Real, checked finding, 2026-10-01**: queried all 86 cocktails'
`method_steps` directly before touching anything further — every one of
the other **84 cocktails has zero photos on any step.** The merge rule
has nothing to anchor to on any of them; "next step with a photo"
doesn't exist yet for a single one. Put to Alex directly rather than
guessed: **confirmed decision — hold off on merging a cocktail until it
has real step photos.** Step-photo-taking (via the app, same as Blue
Heat/Galaxy Soda) comes first, drink by drink; the merge follows
naturally once photos exist, same two-step order both real cases
actually happened in. Not a blanket "merge everything now" pass, and
not applied blind ahead of real photo evidence.

**Open edge case, named in Resolved above, not yet hit**: a trailing
no-photo step with no later photo'd step to merge into — the rule as
stated has no defined behavior for that shape yet.

---

## New real evidence, 30 Sep — the bar's own physical prep/use-by labels

Alex sent 4 photos of real printed shelf-life labels already in use at
the bar (a separate, existing commercial label system — not Ube
Express's own Label List output, which uses a plainer "Prepped /
Use by" format with no team ID or day-colour grid). Real, transcribed
shelf-life data, all labels dated PREPPED 29/09/26:

| Item | Real shelf life (labelled) |
|---|---|
| Mint – Fresh, Limes, Passionfruit, Oranges, Raspberries, Grapefruit, Lemon, Red Chilli, Cucumber, Strawberries | **3 days** |
| Pineapple | ~6 days |
| Tinned Lychee (opened) | 7 days |
| Marshmallows | 7 days |
| Popping Balls (Strawberry, Raspberry, Passionfruit, Mango, Lychee), Glace Cherries | **14 days** |
| Guest Sweets, Coconut – Dessicated, Cordial – Lime, Homemade Lemonade (opened) | **28 days** |

**This directly supersedes a placeholder I built into the app myself.**
The Fruit Prep Label List feature (shipped 29 Sep, commit `4fc33d2`)
uses a flagged, admitted guess — 24h for fresh fruit/herbs, 72h for the
two homemade batches — explicitly logged in the code's own comment as
"a real, clearly-flagged assumption, not this bar's own confirmed
practice." The real labels show the true numbers are **3 days for fresh
produce**, not 24 hours, and several categories (14–28 days) that the
Label List doesn't even generate labels for at all, because Sweets
Garnish Stock was deliberately excluded from labelling on the
assumption that "sealed/restocked items don't need daily food-safety
date labels." **That assumption is now shown to be wrong** — the bar
clearly does track open/use-by dates for sweets and garnish stock, just
on a longer cycle than fresh produce, not never.

**A real new ingredient gap surfaced by these same labels**: "Popping
Balls – Mango" is a real, currently-stocked flavour with no match
anywhere in the app's tracked vocabulary (Lychee, Passionfruit,
Raspberry, Strawberry, Blueberry are the only four tracked). Also new
and untracked: "Guest Sweets" as its own named category, and a possible
"Marshmallows" vs. the already-tracked "Giant Marshmallows" naming
question — needs a look before assuming they're the same product.

**Not yet included**: a fifth photo — a handwritten note, in pink ink,
of discrepancies Alex found going down the Fruit Prep list against real
stock. It's rotated, small, and low-contrast enough that I can't
transcribe it reliably, and I'm not willing to guess ingredient names or
numbers into a document meant to guide real decisions. Please retype it
or send a straighter, closer photo, and I'll fold it in here.

---

## Batch timeline (real commit dates, for reference)

| Date | What shipped |
|---|---|
| 27 Sep | Initial build: cocktail spec lookup + Live Build Mode |
| 28 Sep | Login-hide bug fixed; step-photo capture; bullet-row step display |
| 29 Sep, 02:12–02:22 | The only 2 real resolved fixes in this project's history (above) |
| 29 Sep | Ingredient stock-photo search; flavour-variant grouping; Home screen split; Fruit Prep + printable labels; Cocktail/Mocktail split; menu alphabetised, new-badge deduped, Mojito/Pop Star/Spritz/Pimm's families grouped; 8 new drinks entered from real menu photos, extensive discrepancies flagged |
| 30 Sep | This report; real prep-label shelf-life evidence received |
| 1 Oct | Step-photo frames shipped; Blue Heat + Galaxy Soda step-merges (direct data edits); the explicit merge rule named |

---

## What this collectively points to

Not a recommendation — just the pattern the evidence itself shows, since
this is the document meant to help phrase what comes next:

1. **There is no general resolution mechanism — one narrow, real one now
   exists for exactly one finding type.** ~30 real findings exist across
   this whole report; 4 have ever been fixed (re-verified 2026-10-01:
   the original 2 Sep 29 code fixes, plus Blue Heat and Galaxy Soda's
   step merges). The step-merge loop specifically now has a real,
   repeatable shape — walk a drink via the step-photo frames, merge
   per the explicit rule in section L, log it here — but every other
   finding in this report still has nothing routing it back to a
   decision.
2. **Nothing in Supabase records *what* changed, only *whether* and
   *when*.** `updated_at` now shows 5 rows touched in this project's
   whole life (re-verified 2026-10-01, up from 3) — but the "what" for
   Blue Heat and Galaxy Soda's own edits exists only because this report
   records it by hand; neither was a git commit, so there's no code
   history to fall back on for those two the way there was for the
   original 3. A row edited via the admin UI alone would leave zero
   trace of what it used to say.
3. **The printed menu and the app's tracked recipes are two
   independently-maintained sources of truth, and nothing keeps them in
   sync.** Every "vs. menu" finding above is the same root cause wearing
   a different ingredient's name.
4. **A design assumption I made (Sweets Garnish Stock doesn't need
   date labels) was wrong, and only real physical evidence caught it** —
   worth remembering as a reason to ask for the real number before
   shipping a placeholder, not just to flag the placeholder and move on.

---

## 2026-10-01 — Fruit Prep colour system (stock status, per container)

Alex's own spec, refined through a real interrogation round. Fruit Prep
now tracks **each prepped container separately** (new `prep_batches`
table: prepped time, label time, ended time + reason), and each item is
coloured by its most urgent container. Every colour also carries a text
badge (never colour alone):

| Colour | Meaning |
|---|---|
| Light green | Stocked + labelled |
| Dark green | Stocked, needs a label (appears on the Label List) |
| Amber | Bin at close tonight (expires tomorrow) |
| Black | Past shelf life — bin now (no relabelling; re-prep with an accurate label) |
| Red | Thrown out — needs prepping (until re-prepped) |
| Blue | Out of stock — any colleague sets it, only an admin clears it |
| Red/green + 🆕 | Back in stock — 🆕 stays until 3 days after it first goes light green |

Prepping asks "Prepped and Labelled" (→ light green, label time = now) or
"Prepped / Not Labelled" (→ dark green; Label List "Done" stamps the captured
time). Each container has **Used up** (finished, not waste → no red)
and **Thrown out** (waste → red). Used up was added beyond Alex's spec
because without it an emptied tub would wrongly show as waste.
The old "Untick all" reset is gone (it would wipe real stock state).
Renames/swaps/merges carry an ingredient's containers along with it.

### Needs top up (Oct 1 2026)
New columns `prep_checklist_state.needs_topup` (bool, default false) and
`needs_topup_at` (timestamptz) — additive migration, no existing rows changed.
Any colleague can tap **Needs top up** on a Fruit Prep item (stocked or not)
to flag it for the next opener; flagged items get a ⬆ Top up badge and appear
in a "⬆ Top Up on Next Open" list. The flag clears on **Topped up**, when a new
container is prepped for that item, or when it is marked Out of stock.

### Plain "Needs prepping" merged into red (Oct 1 2026)
Per Alex: plain/grey was the same as red, just a different reason the item
isn't at the station. Red now covers every not-at-station case; the row
badge says why (Thrown out — prep / Back on — prep / Needs prepping). Each
Fruit Prep row now has a slim left column with its colour-key symbol at
checkbox size, and the whole row takes that colour's hue. Display-only change,
no data changed.

### Orange Zest off Fruit Prep; Mint split into Leaves + Sprigs; "Thank you Trav" label mapping (Oct 1 2026)
**Orange Zest** — `prep_group` and `label_name` cleared. Still in Peach Pony Club's
spec; the zest comes from the prepped Oranges, so it is no longer its own prep item.

**Mint** — `ingredient_photos` "Mint - Fresh" renamed **Mint Leaves** (label name now
its own, so "right name"); new row **Mint Sprigs** (fruit_syrup, 72h shelf life,
label machine name "Mint Leaves" → shown as "🙏 Thank you Trav"). Every recipe
step that listed Mint - Fresh was reassigned by its instruction text:
muddle / "mint leaves" → Mint Leaves, every other (garnish/dress/serve) → Mint Sprigs.
Result: 8 drinks use Mint Leaves (Mojito ×5, Apple Cooler, Peach Iced Tea, Pink
Paloma), 50 use Mint Sprigs. Garnish steps that already said "mint sprig" but listed
no mint now list Mint Sprigs, and those drinks gained a `cocktail_ingredients` row
"Mint Sprigs 1 sprig" — the 8 Leaves drinks above (all garnish with a sprig) plus
**Bathtub**, which had no mint listed at all. Existing amounts kept as they were;
the leaves drinks keep their original grams on Mint Leaves.
Judgement calls to confirm: Pimms Jug's mint (step "Serve with… glasses, ice and
straws") went to Sprigs; Dr Popper, Dragon Fruit and Lychee Soda, Orange +
Passionfruit Soda, Peach Crumble, Sweet Shop and Passionfruit Cooler have no step
naming mint, so they defaulted to Sprigs.
Reverse if needed: rename Mint Leaves/Sprigs back to Mint - Fresh in steps and
ingredient lists, delete the added "Mint Sprigs 1 sprig" rows and the Mint Sprigs
registry row.

**Label mapping** — no schema change: Ingredients table now shows Label needed
(`no_label`), Right name (derived: label machine name empty or same) and Name on
label machine (`label_name`) as columns in the Fruit Prep groups; the old fields in
the expander were removed. Label List shows "🙏 Thank you Trav — print <machine
name>" on each wrong-name item plus a banner counting them.

### "Right name" is now Alex's own call, not automatic (Oct 1 2026)
New column `ingredient_photos.label_ok` (bool, default false). Set **true for Mint
Sprigs only** (shares the Mint Leaves label — makes sense, no Thank you Trav). Every
other ingredient whose label-machine name differs stays false → Thank you Trav
(e.g. Popping Balls - Blueberry printing "Popping Balls - Mango"). Admin flips it in
the Ingredients table's "Right name" column; a shared label marked Yes shows a plain
"Use label: …" on the Label List.
Same day, per Alex: `label_ok = true` also for **Lychee** (prints "Tinned Lychee") and
**Giant Marshmallows** (prints "Marshmallows") — sensible shared labels, no Trav.
Same day: `label_ok = true` for **Cherries** (prints "Glace Cherries") too.

### 🍻 Cheers Trav — menu vs Chilled Pubs app discrepancies (Oct 1 2026)
Sibling of the label list's "Thank you Trav": where the printed menu and the
Chilled Pubs app (the source these specs were entered from) disagree. New table
`menu_discrepancies` (drink, cocktail_id link, menu_says, app_says, resolved;
anon read-only, admin writes via /api/write `save_menu_discrepancy` /
`delete_menu_discrepancy`). Seeded with **19 open rows**: the Sep 29 physical-menu
cross-check in `notes_flagged_recipe_issues.md`, each re-checked against live data
first. 18 link to a real drink; 1 ("All boba drinks" — "boba balls" vs "Popping
Balls") is menu-wide. Re-check changed two: Galaxy Soda now has blueberry +
strawberry balls (menu still says blueberry + raspberry); Bathtub now has
passionfruit boba (only the "Chilled Bathtub, £14, for 2" name/sharer question left).
New "🍻 Cheers Trav" home card (everyone; count of open rows), a table page (staff
read-only; admin edits text inline, marks Fixed, deletes, adds rows), and a banner on
each affected drink's spec page. Within-app recipe inconsistencies (method text vs
ingredient list, unit oddities) are NOT in this table — they're app-only, still listed
above in this report.

### Cheers Trav evidence + report (Oct 1 2026)
`menu_discrepancies` gained `menu_evidence_url`, `app_evidence_url` (screenshots,
stored in the same `photos` bucket via `upload_photo` target `discrepancy`) and
`change_needed` (the "what to change" instruction). Table shows both screenshot
slots and a What-to-change column; a "📄 Report" view lays each open discrepancy
out as a numbered card — change instruction, then printed menu vs Chilled Pubs app
side by side with their screenshots — and prints / saves as PDF cleanly. The report
header counts rows still missing a screenshot.

### Cheers Trav admin-only by default (Oct 1 2026)
New table `app_settings` (key, value jsonb; anon read-only, admin writes via
/api/write `set_setting`, whitelisted keys only). `cheers_trav_staff = false`:
staff see no Cheers Trav home card, page or drink banners. Admin always sees it,
plus a "Show Cheers Trav to staff" switch under the home card to turn it on for
everyone. Thank you Trav on the Label List is unaffected (staff need it to print).

### Thank you Trav folded into Cheers Trav (Oct 1 2026)
The Cheers Trav page now has two sections: menu vs Chilled Pubs app, and
"🙏 Thank you Trav — label machine" (every ingredient whose Right name = No, with
what the machine prints vs what it should print; admin "Machine renamed" clears the
machine name). The home-card count covers both. The printable report adds a
"rename on the label machine" table. Both follow the same admin switch: while it's
off, staff's Label List still says "Use label: <machine name>" (so they print the
right sticker) but without the Thank you Trav sign or banner.

### Galaxy Soda steps 1+2 merged; visible Remove Photo (Oct 1 2026)
Galaxy Soda: step 1 ("Fill the glass a third with crushed ice") merged into step 2 —
now "Fill the glass a third with crushed ice, add the sala syrup and mix, then add a
straw", keeping step 2's photo (frame 317), same rule as earlier merges. 5 → 4 steps.
Old step-1 photo (`step/1790814081265-t6u5rbkuqz.jpg`) no longer referenced; file
left in storage. Frame Editor gained a visible "🗑 Remove Photo" button (tap twice)
for step, finished-drink and ingredient photos — previously only reachable inside
the Change Photo menu.

### Lime Juice rename; Peach + Pomegranate on Thank you Trav (Oct 1 2026)
- **"Lime Juice - Fresh" → "Lime Juice"** everywhere: `ingredient_photos`, 28
  `cocktail_ingredients` rows, 23 drinks' method steps (exact-name match only). No
  prep/photo/discrepancy rows used the old name. Label machine still prints
  "Cordial - Lime" → still a Thank you Trav.
- New column `ingredient_photos.label_should_print` — custom "Should print" text when
  the answer isn't simply the ingredient's own name (editable on the Cheers Trav page;
  "Machine renamed" clears it).
- **Peach**: `no_label` false, machine prints "Mango" (no peach label — staff use
  mango), should print "Well, you tell me — 5–7 days shelf life, TBC…". Peach still
  has no shelf life set in the app (`shelf_life_hours` null).
- **Pomegranate Seeds** (arils): `no_label` false, machine prints "No clue, haven't
  been told yet :)", should print "Again, you tell me".

### Blackberry label note; "Homemade Raspberry-ade" rename (Oct 1 2026)
- **Blackberry** (machine prints "Raspberries"): should print set to
  "Bloody blackberry init".
- **"Homemade Raspberry Lemonade" → "Homemade Raspberry-ade"** — the batch
  ingredient now matches the drink's name (Alex: "that should be the name"):
  `ingredient_photos`, 4 `cocktail_ingredients` rows, 4 drinks' method steps; no prep
  rows used it. Label machine still prints "Homemade Lemonade" → still Thank you Trav.
  Because the Chilled Pubs app names the batch "Homemade Raspberry Lemonade", a new
  Cheers Trav discrepancy row was added (change: rename it in the app).
- Cheers Trav rows deleted by Alex on purpose (not needed): Dancing Queen, All boba
  drinks, Pick Me Up, Pink Gin Sling, Passionfruit Cooler. 15 menu rows now open.


---

## SESSION CLOSE-OUT — 1 Oct 2026 (/Bedtime)

Everything shipped since this report was first compiled (30 Sep), in one place.
Each item has its own dated card above; this is the summary. Verified against
`git log` (local `main` = remote `main` = `e5aac4c`) and live Supabase at close.

### Live in the app (pushed to `main`)
**Photos & Build Mode**
- Frame Editor wraps every photo (steps, finished drink, ingredients); visible
  🗑 Remove Photo (tap twice) added today.
- Staff can't edit photos; they submit step-photo candidates for admin review.
- Build Mode re-laid out: photo fills the card, text under it, "Suggest a photo"
  next to the step label.
- Step merges: Peach Pony Club, Pink Gin Sling, Sakura Pink, Berry Butterfly,
  Blue Heat, Galaxy Soda (twice — now 4 steps).

**Ingredients table** — editable, grouped by type A–Z, photo per ingredient,
rename / merge / permanent swap, shelf life (from the real labels), Fruit Prep
membership, and three label columns: Label needed · Right name · Name on label
machine.

**Fruit Prep**
- Per-container stock tracking with colours: light green (stocked & labelled),
  dark green (needs label), amber (bin tonight), black (out of date), red (not
  at station — thrown out / used up / never prepped), blue (out of stock),
  🆕 back in stock (3 days). Rows tinted to their colour, symbol column on the
  left.
- Ticking asks **Prepped and Labelled** / **Prepped / Not Labelled**; unticking
  asks Used up / Thrown out.
- **Needs top up** flag + "Top Up on Next Open" list.
- Throw Out Tonight list; Label List captures the label time when opened.
- Orange Zest removed (zest comes from Oranges); Mint split into **Mint Leaves**
  (muddled, 8 drinks) and **Mint Sprigs** (garnish, 50 drinks).

**🍻 Cheers Trav** (admin-only; switch on the admin home shows it to staff)
- Menu vs Chilled Pubs app: 15 open rows, What-to-change column, menu + app
  screenshot slots, banners on each affected drink.
- 🙏 Thank you Trav — label machine: 7 open (Blueberry balls→Mango, Lime Juice→
  Cordial - Lime, Homemade Raspberry-ade→Homemade Lemonade, Blackberry→
  Raspberries ["Bloody blackberry init"], Birds Eye Chillies→Red Chilli, Peach→
  Mango [TBC], Pomegranate Seeds→"No clue"). Marked fine (shared label):
  Mint Sprigs, Lychee, Giant Marshmallows, Cherries.
- 📄 printable report (Save as PDF) covering both.

**Renames today:** Lime Juice - Fresh → **Lime Juice**; Homemade Raspberry
Lemonade → **Homemade Raspberry-ade**; Mint - Fresh → **Mint Leaves** (+ new
Mint Sprigs).

**New tables/columns:** `menu_discrepancies`, `app_settings`;
`prep_checklist_state.needs_topup(_at)`; `ingredient_photos.label_ok`,
`label_should_print`; evidence/change columns on `menu_discrepancies`.

### Verified how
Every change passed headless-browser tests (phone and desktop width) with the
database mocked, plus Node tests of `api/write.js`. **Nothing has been
hand-tested on the live site or a real phone yet**, and the live Vercel deploy
couldn't be confirmed from here (deploy listing returned nothing). Fruit Prep
has 0 real containers logged so far.

### Waiting on Alex
1. Screenshots for the 15 Cheers Trav rows (none attached yet).
2. Mint split judgement calls: Pimms Jug → Sprigs; six drinks with no mint step
   defaulted to Sprigs (Dr Popper, Dragon Fruit & Lychee Soda, Orange +
   Passionfruit Soda, Peach Crumble, Sweet Shop, Passionfruit Cooler).
3. Peach shelf life (not set); Pomegranate label (TBC).
4. The circled note beside Cherries/Lychee/Orange Zest on the pink list.
5. Add "Popping Balls – Mango" and "Guest Sweets" as products?
6. Older open items above: app-internal recipe errors, no price column,
   Butterfly Pea's category, Dragon Fruit & Lychee Soda's missing method,
   glass icons.

### Housekeeping noted
- Old Galaxy Soda step-1 photo left in storage, unreferenced.
- `_test_portrait.jpg` sits untracked in the repo folder (test image, not
  committed).

**Next session: open with /Routine.**

### Discrepancy categories: Dyslexia + Nonsense; Alex's answers applied (1 Oct 2026, after /Routine)
**Discrepancy lists, as Alex framed them:** menu → app (🍻), app → spec (🔤 Dyslexia,
🤷 Nonsense), labels → spec (🙏 Thank you Trav). **Monetary** (prices across the menu,
the Chilled Pubs app *and the till system*) is deliberately its own future
investigation — no price column added yet. The aim across all of them: surface the
inconsistencies, EHO-standard risks and training gaps.

- `menu_discrepancies.category` added (`menu_app` / `dyslexia` / `nonsense`,
  check-constrained); the Cheers Trav page and report show each as its own section.
- **Dyslexia** (renamed in our app, logged against the Chilled Pubs app):
  "Chai Seeds" → **Chia Seeds** (Dragon's Potion); "Coconut Dessicated" →
  **Coconut Desiccated** (Coconut Cloud).
- **Nonsense**: every ingredient the app measures in grams — 52 rows, one per
  ingredient (amounts + every drink using it), snapshotted before any conversion.
  Mint shows as two rows (Leaves / Sprigs; the Pimms Jug 12g sits under Sprigs
  because it was snapshotted before the Pimms fix) — a merge into one "Mint" row
  was attempted and cancelled; still open.
- **Lemon / Pineapple grams → 1 wedge** in our app: 11 rows (9 lemon incl. the
  Pop Stars, Double Dutches and Honey and Lemon Soda; 2 pineapple).
- **Mint rule (Alex):** garnish = sprigs; making phase = leaves; one shared label.
  Pimms Jug now uses Mint Leaves only (moved into the fruit step, no sprigs).
  Everything else already matched the rule.
- **Peach / Pomegranate:** 5–7 days once open, TBC — `shelf_life_hours` = 120
  (5 days, the safe end) on both; should-print notes updated.
- **Guest Sweets** is a real label grouping name for long-life dry stock — fine,
  not a discrepancy.
- **Dragon Fruit and Lychee Soda**: method entered from Alex's Chilled Pubs app
  screenshot (6 steps) + garnish; its ingredients already matched the screenshot.

## SESSION CLOSE-OUT (addendum) — 1 Oct 2026, second /Bedtime
Since the first close-out: /Routine ran (`daily_priorities_2026-10-01.txt`), then the
Dyslexia + Nonsense categories and Alex's answers (card above, commit `5b5a7ef`).
Live state: 15 menu-vs-app, 2 dyslexia, 52 nonsense, 7 label rows open; staff switch
off; 0 screenshots attached. Vercel deploy still unconfirmed from here (connector
can list the 3 projects but can't open them) — Alex to check `app.js?v=48` in the
page source and which of the 3 Vercel projects is the linked one.
Still open: Mint Nonsense rows merge (cancelled), Popping Balls – Mango product?,
the pink list's circled note, screenshots, hand-test pass, the monetary
investigation (menu / app / till). Next session on Ube Express: open with /Routine.

---

## 1 Oct 2026 — Straws merged into Long / Short (by glass)

Alex: "Merge the straws as straws, depending on glass it long or short."

- **Before:** two straw ingredients. `7.75" Red/White Striped Paper Straw` was used in 22 drinks; `7.75" Green/White Striped Paper Straw` was used only in Cherry Bomb.
- **After:** `Straw - Long` is used in all 15 highball drinks; `Straw - Short` is used in the 8 rocks and coupe drinks (Cherry Bomb, Coconut Cloud, Dragon Fruit Cloud, Dragon's Potion, Mad Scientist, Peach Iced Tea, Ube Cloud, Mermaid Shake).
- 21 method steps that named the old straw were rewritten to the matching new name. A re-check found 0 old names left.
- The two `ingredient_photos` rows were renamed in place (Red/White → Long, Green/White → Short), so their category stays the same.
- Garnish free-text ("red and white straw", "stripy straw") was left as written. It is descriptive text, not an ingredient.

## 1 Oct 2026 — Mint sprigs, glace cherries, straws (long / short / boba)

Alex's rules: mint sprig is 1 per drink; there are no fresh cherries, only glace cherries, 1 each time; straws are only long or short, with no colours; a boba straw goes in drinks that have boba inside the drink, not as the final garnish; wine glass = long; plain "straws" = 1 long; Elmo = long; Bathtub = 2 long (one each side) + 4 short (two per tea cup); Pimm's = 1 long.

- **Mint Sprigs**: every row is now `1 sprig`. That was 36 rows in grams plus 2 with no unit.
- **Cherries → Glace Cherries**: Dr Popper and Homemade Cherry Cola were changed in the ingredient, garnish and method. All 7 Glace Cherries rows are now `1 each`. Two new Cheers Trav (menu vs app) rows flag "Cherries" for both drinks. The Nonsense notes for Mint Sprigs, Glace Cherries and Cherries now say what the app should change to.
- **Straws** (44 ingredient rows added; ingredient-list totals below):
  - `Straw - Boba`: 8 drinks — the 4 Double Dutches and 4 Pop Stars, where boba is layered in the drink. Not added to Galaxy, Pink & Purple or DF&L Soda, where boba is only the final garnish.
  - `Straw - Long`: 41 drinks.
  - `Straw - Short`: 18 drinks. Blue Heat, Sakura Pink, Pink Gin Sling and Yuzu Kiss take 2 each ("two straws" in the method); Bathtub takes 4.
  - All colour wording ("black", "stripy", "striped", "red and white", "curly") was replaced with long/short. 0 instances remain.
  - Each straw is linked to the method step that mentions it.
- **Left as-is**:
  - Dancing Queen's "dry end of a straw" is a tool for the glitter, not a serve.
  - Honey and Lemon Soda already had a long straw in its ingredients, but no step mentions a straw (this was already the case before today).
  - The stray "Cherries" row in Fruit Prep is not yet removed: the delete needs Alex's confirmation.

## 1 Oct 2026 — Mint leaves counted, not weighed; Honey & Lemon straw; Cherries retired

- **Mint Leaves** (Alex): Mojitos get 8 leaves (5 drinks); Pimms Jug gets 12; Apple Cooler, Peach Iced Tea and Pink Paloma get 5. Unit is `leaf`. The Nonsense note is updated to match.
- The app now shows count units in the plural when the amount is above 1 ("8 leaves", "4 sprigs"). The stored unit stays singular so the unit dropdown still matches. Checked: `8 leaves | 1 sprig | 2 each | 4 sprigs | 25 ml`. `app.js?v=49`.
- **Honey and Lemon Soda**: step 5 now reads "Cap with crushed ice and add a long straw" and is linked to Straw - Long.
- **Cherries** (Fruit Prep): the database tool blocks deletes in this session, so the row was moved out of Fruit Prep instead (`prep_group` cleared, category "Retired (not stocked)"). To remove it for good, run `delete from ingredient_photos where name='Cherries';` in the Supabase SQL editor.

## 2 Oct 2026 — Strawberries as garnish only, lemon sorbet in scoops, straw-link correction

- **Strawberries** (Alex): Strawberry Popper and Strawberry Wizz Fizz get 1 strawberry, as garnish only, never in the drink. Como Crush gets 1 strawberry on top.
  - Popper: "put two strawberries cut in half into glass" removed from step 2.
  - Wizz Fizz: strawberry taken out of the shake and added to the dress step and the garnish.
  - All three are now `1 each`. The other 7 strawberry drinks are still in grams, awaiting Alex.
- **Lemon Sorbet** (Alex: "all lemon sorbet as garnish only uses 1 scoop"):
  - 1 scoop in 10 drinks: Baby Bath, Cherry Blossom, Como Crush, the three Homemade -ades, Island Gold, Percy's Party, Spectrum, and Witching Hour (already 1 scoop).
  - 2 scoops in Bathtub and Dragon's Potion, because their own methods say two.
  - Electric Reef was not touched: it has no amounts and no method at all, which is a separate gap.
  - A new Nonsense row was added for Lemon Sorbet (the app used ml).
- **Correction to my own earlier straw pass**: the step-linking matched "straw" inside "strawberry/strawberries". That linked 6 steps in 5 drinks (Galaxy Soda, Mojito Strawberry, Pink and Purple Soda, Strawberry Pop Star, Strawberry Popper) to a straw wrongly. Those links were removed. Re-check: 0 wrong links remain, and every straw is still linked to its correct step.
- Not applied (the tool cancelled it): updating the Strawberries Nonsense note to say 3 of the 10 drinks are fixed.
- **Strawberries, the rest** (Alex: "2 slice is 1 apart from the Pimm's drinks"): read as 1 strawberry in every non-Pimm's drink, with the Pimm's drinks keeping the counts proposed earlier. Now `1 each` for Mojito Strawberry, Pink and Purple Soda, Strawberry Double Dutch and Strawberry Pop Star; `2 each` for Pimms Original and Pimms Royale; `6 each` for Pimms Jug. No strawberry is in grams any more.

## 2 Oct 2026 — Cocktail Spec search now finds flavours inside groups

Alex: typing "lychee" didn't surface Double Dutch; you had to type the group name.
- Each group row (Double Dutch, Pop Star, …) now carries hidden sub-rows for its flavours. When the search matches a flavour but not the group name, the group shows with the matching flavours listed under it (↳ Lychee Double Dutch). Tapping one opens that drink directly, skipping the flavour picker.
- If the search matches the group name itself ("double"), only the group row shows, as before.
- Headless test at phone width:
  - "lychee" shows Double Dutch + ↳ Lychee Double Dutch, Lychee and Ube Soda, and Pop Star + ↳ Lychee Pop Star.
  - "double" shows only the group row.
  - "rasp" shows Pop Star + ↳ Raspberry Pop Star.
  - Tapping ↳ Lychee Double Dutch opens its spec.
  - 0 page errors.
- `app.js?v=50`, `style.css?v=47`.

## 2 Oct 2026 — Fruit Prep: garnish split into sweets vs props & straws

Alex: "the garnish section looks a mess with straws in mix with sweets."
- The single "🍬 Sweets Garnish Stock to Replenish" list is now two sections:
  - **🍬 Sweets & Garnish to Replenish**, sub-grouped by each item's existing Ingredients-page type, in shelf order: Sweets & Candy → Popping Boba → Dried, Tinned & Preserved → Desserts, Gelato & Biscuits → Edible Decorations → Sugar, Honey & Seasonings.
  - **🦆 Garnish Props & Straws**, sub-grouped into **Straws** (Boba / Long / Short) and **Props** (umbrellas, mermaid tails, ducks, disco ball, tassel sticks, ping pong balls, blossom tree).
- No data was changed. It reuses the types already set on the Ingredients page, so re-typing an item there moves it here too.
- Headless test with the live types: every item lands under the right heading; 0 page errors. `app.js?v=51`, `style.css?v=48`.

## 2 Oct 2026 — Fruit Prep: edit a container's label date & time

Alex: ticked off what he had left, but couldn't set the label to the real date.
- Each container on Fruit Prep now has **✏️ Edit** next to Used up / Thrown out. It opens a date & time box on that container, pre-filled with its current label time (or prep time), with Save and Cancel. Saving writes `prep_batches.label_at` for that one container. Its colour, "Good until" and bin day then recalculate from the real date. A container that wasn't labelled yet counts as labelled once saved.
- A time more than 5 minutes in the future is refused ("check the date").
- Headless test: the future date was refused with no write. Saving 30 Sep 14:30 sent a PATCH with exactly that `label_at`, and the container re-rendered "Labelled 30 Sept 2026 14:30 · bin tonight". 0 page errors. `app.js?v=52`, `style.css?v=49`.

## 2 Oct 2026 — Label List "Done" reversed (Alex hadn't labelled them)

- Alex pressed Label List **Done** without actually labelling. That one press stamped 9 open containers with the identical label time 2026-10-02 13:05 (BST): Birds Eye Chillies, Blackberry, Cucumber, Lemon, Lime, Lychee, Oranges, Pineapple and Raspberries. Their `label_at` was reset to empty, so all 9 are back on the Label List as "needs label". Their prep times were kept.
- Only that exact Done timestamp was touched. Containers Alex back-dated individually, and the two boba containers marked "labelled now" when prepped, were left as they are.

## 2 Oct 2026 — Labels & Fruit Prep clean-up, and 6 Cold Foams added

**Label / prep changes (Alex):**
- **Lychee → Tinned Lychee** ("we only use tinned lychee"). Lychee and Ube Soda and Pink Gin Sling now use Tinned Lychee. The "Lychee" item is retired off Fruit Prep, and its open container was moved to Tinned Lychee.
- **Cherry Pencils + Jacks Pencil Sweet → Strawberry Pencils** (Cherry Bomb, Dragon's Potion; garnish and method wording too). Label: **Guest Sweets** (marked correct). Jacks' open container moved over; Cherry Pencils retired.
- **No label needed → off Fruit Prep**: Popping Candy – Wizz Fizz, Vimto Chew Bar, and all 4 Edible Decorations (Drip Icing – Blue, Edible Glitter, Green Food Colouring, Sprinkles). "Label needed" is now No.
- **Label needed → added to Fruit Prep (Fruit & Syrups)**: Gimber, Mixed Berry Coulis, Coconut Water 330ml, Condensed Milk, Lime Cordial, Elderflower Cordial, Elderflower & Rose Cordial. There is no raspberry & lemon cordial anywhere in the spec, so it was not added.
- **Finest Call purées → Real** ("all flavours have only real puree"): Real – Passionfruit Puree (8 drinks, also absorbed the unbranded "Passionfruit Puree"), Real – Raspberry Puree (6), Real – Strawberry Puree (3, plus the new Strawberry & White Choc Cold Foam). Added to Fruit Prep as needing a label. 0 Finest Call purées remain.
- **Denied, not applied**: adding Real Mango/Lychee/Dry Dragon to Fruit Prep, and a Cheers Trav row for the Finest Call → Real switch. Not retried.

**6 Cold Foams added** (Alex's screenshots of the Chilled Pubs app), grouped as one "Cold Foam" menu row with 6 flavours: Mont Blanc, Strawberry & White Choc, S'mores, Biscoff, Tiramisu, Banoffee.
- Put in the Mocktails tab, since there's no alcohol. Wine glass with a long straw, from the photos (stemless glass, long straw).
- Entered as the app shows them, except where a standing rule applies: Straw → Long; Finest Call Strawberry Puree → Real; Strawberries 5g → 1; spelling fixed (Speculooos → Speculoos, Mini Marshmellow → Mini Marshmallows, Mayple → Maple).
- Problems in the source app, entered as shown and flagged to Alex (not "fixed" by guessing):
  - **Mont Blanc** has no milk or cream syrup in its ingredients, but its method adds 50ml milk. It lists orange juice, "Mayple Syrup 25 milligram" and orange; its garnish (cocoa and ladyfinger) is identical to Tiramisu, and neither is in its ingredients. This looks like a copy-paste error in the source app. Maple was entered as 25 ml.
  - Several methods say "25ml syrup" where the ingredient list says 12.5ml (Mont Blanc, Tiramisu, Biscoff, Strawberry). Several say "Add 50ml milk" where the list says 75ml (Strawberry, Tiramisu, Banoffee).

## 2 Oct 2026 — Raspberry & lemon cordial, and a real Cold Foam batch item

- **Raspberry & lemon cordial** = `Belvoir Raspberry n Lemon`. It is used in Passionfruit Cooler, and through the batch mix in Homemade Raspberry-ade. It is now on Fruit Prep (Fruit & Syrups) as needing a label.
- **Cold Foam** (Alex): it is not lemon sorbet + soda. It is 75/25 milk/cream whipped together, batch-prepped each morning with 750ml milk + 250ml double cream, and it goes on the Double Cream label.
  - A new `Cold Foam` item is on Fruit Prep (Fruit & Syrups). Its label is Double Cream, marked correct. No shelf life is set yet.
  - In all 6 Cold Foam drinks, `Double Cream 50ml` is replaced by `Cold Foam 50ml`. The foam step now reads "Pour the cold foam on top without overfilling (cold foam is batch-prepped each morning: 750ml milk + 250ml double cream, whipped)".
  - **Not changed yet**: Witching Hour still says "Make cold foam: lemon sorbet + soda in the shaker" and lists Milk 25ml, Double Cream 50ml, Lemon Sorbet and Soda Water. Waiting on Alex for the correct version. The Finest Call/Real purée brands also stay as they are until Alex sends the brand list (the switch is a brand difference, not a Cheers Trav item).
- **Cold Foam per drink = 100ml** (Alex: 75 milk + 25 double cream). All 6 Cold Foam drinks are updated from 50ml to 100ml.
- **Witching Hour uses Cold Foam** (Alex). The sorbet + soda "cold foam" step is replaced with "Pour the cold foam on top without overfilling (batch: 750ml milk + 250ml double cream, whipped)", linked to Cold Foam. The Lemon Sorbet ingredient became `Cold Foam` (to taste, topped up without overfilling).
  - Milk 25ml + Double Cream 50ml were kept, because they are in the shake, not the foam.
  - The leftover `Soda Water (to taste)` row could not be deleted: the database tool blocks deletes in this session. Alex can delete it from the spec editor, or run `delete from cocktail_ingredients where id='74e32e90-727b-4f64-a1c0-89223eb92a24';`.
- **Double Cream label shelf life = 3 days** (Alex: today's label reads 01/10 – 04/10). `shelf_life_hours = 72` is set on both Cold Foam (which uses the Double Cream label) and Double Cream.

## 2 Oct 2026 — Purée & syrup brands and labels (Alex)

- **Peach Puree is Real** → `Real - Peach Puree` (4 drinks).
- **All Real items go on one label, "Mango Puree" (🙏 Thank you Trav)**: Real – Passionfruit / Raspberry / Strawberry / Peach Puree, Real – Lychee Syrup and Real – Dry Dragon are flagged Trav (label says Mango Puree). Real – Mango Syrup is marked correct. All 7 are on Fruit Prep as needing a label.
- **Elderflower, Elderflower & Rose and Lime cordials are Belvoir** → `Belvoir Elderflower`, `Belvoir Elderflower & Rose`, `Belvoir Lime Cordial`. They share one shelf life with Belvoir Raspberry n Lemon: all 4 are 28 days (the Lime Cordial's existing 672h) and on Fruit Prep with labels.
- **Monin and Finest Call need no labels**: every Monin / Finest Call item is now Label needed = No and off Fruit Prep. That includes the 4 new Monin rows from the Cold Foams (Brown Sugar, Speculoos, Cheesecake, Banana).
- **Gimber shelf life 14 days** (label 26/09 → 10/10). **Mixed Berry Coulis 3 days** (label 30/09 → 03/10).
- **Open**:
  - "Monin Banana" (Banoffee Cold Foam) vs "Monin Banana Syrup" (Minion): probably the same bottle, merge?
  - `Belvoir Pink Grapefruit - Presse` exists but isn't on Fruit Prep. Same shelf life or not?
  - Real items still have no shelf life set.
- **Brown sugar syrup is not Monin** (Alex: "apart from brown sugar, those are Monin"). `Monin Brown Sugar Syrup` → `Brown Sugar Syrup` in the 3 Cold Foams (Banoffee, Mont Blanc, Tiramisu). Label needed = Yes, and it is on Fruit Prep. Brand and shelf life still to confirm. Monin Speculoos / Cheesecake / Banana stay as no label.
- **Monin Banana merged into Monin Banana Syrup** (Alex: same bottle). Both drinks (Minion, Banoffee Cold Foam) now use `Monin Banana Syrup`; the duplicate item is retired.
- **Pink grapefruit is Fever-Tree, not Belvoir** (Alex: "a Fever-Tree tonic, no label"). In Pink Paloma, `Belvoir Pink Grapefruit - Presse` → `Fever-Tree Pink Grapefruit`; Label needed = No; not on Fruit Prep.
- Alex gave a label date of 30/09 → 23/10 (23 days). Waiting on whether that is the Brown Sugar Syrup or the Mango Puree label before setting it.
- **Mango Puree label shelf life = 23 days** (30/09 → 23/10). `shelf_life_hours = 552` is set on all 7 Real items that share that label. Brown Sugar Syrup's shelf life is still to confirm.
- **Correction — Passionfruit, Raspberry and Strawberry purées are Finest Call** (Alex). My earlier Finest Call → Real rename is reverted for those three. They are back to `Finest Call Passionfruit / Raspberry / Strawberry Puree` (8 / 6 / 4 drinks), with no label and off Fruit Prep. The unbranded "Passionfruit Puree" merged earlier stays merged, now under the Finest Call name.
- **Real, on the Mango Puree label, 23 days, on Fruit Prep**: Real – Peach Puree, Real – Mango Syrup (label correct), Real – Lychee Syrup, and the dragon fruit syrup, renamed `Real - Dry Dragon` → `Real - Dragon Fruit Syrup` (5 drinks) so it can't be confused with the dried garnish.
- **Dried Dragonfruit** (the garnish, 4 drinks) prints on the **Guest Sweets** label, marked correct.
- **Brown sugar syrup is Monin after all** (Alex: "make it Monin brown sugar syrup, since it is the spec"). This reverses the earlier "not Monin" change. In the 3 Cold Foams (Banoffee, Mont Blanc, Tiramisu), `Brown Sugar Syrup` → `Monin Brown Sugar Syrup`, in both the ingredients and the method-step links. The item now matches the other Monin syrups: Label needed = No, off Fruit Prep, no shelf life needed.
  - Still open: Mont Blanc and Tiramisu list 12.5ml in their ingredients but say 25ml in the method.
- **Cold Foam per drink = 75ml, plus 25ml syrup** (Alex: "we use 25ml of syrup with 75ml of cold foam"). This changes the earlier 100ml: Cold Foam is now 75ml in all 6 Cold Foam drinks.
  - Open: which syrup goes into the foam, and whether the methods should change. Each drink's syrups add up to about 25ml (e.g. Tiramisu: brown sugar 12.5 + cheesecake 12.5). The methods currently put that syrup in the glass with the coffee.
- **Every Cold Foam drink = a 25ml syrup shot + 75ml cold foam = 100ml** (Alex: "all syrups should come to one shot, then 75ml cold foam, so 100ml regardless").
  - Mont Blanc: Maple Syrup 25 → 12.5ml. Strawberry & White Choc: Monin White Chocolate Syrup 25 → 12.5ml. All 6 drinks now total exactly 25ml of syrup (checked by query).
  - Method step 1 in all 6 now names the syrup shot and its split, linked to both syrups. Step 5 now reads "Pour 75ml cold foam on top".
  - Not changed: Banoffee's 25ml toffee sauce (a sauce, not part of the shot), and the milk amounts (the methods say 50ml in 4 drinks, but the ingredients say 75ml).
- **Manager confirmed** (via Alex) the 6 Cold Foam drinks' syrup splits and the 25ml syrup + 75ml cold foam setup above. No further changes.
