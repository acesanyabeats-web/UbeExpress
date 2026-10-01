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

### 2026-10-01 — shelf life now comes from the real labels (resolves section J)
**What was wrong**: the Label List used a guessed 24h (fresh) / 72h
(homemade batches) shelf life, and never labelled sweets/garnish stock.

**What changed**: shelf life is now stored per ingredient
(`ingredient_photos.shelf_life_hours`) and editable in the admin
Ingredients table. 22 ingredients were set straight from the 30 Sep
label photos (3 days fresh produce, 6 days Pineapple, 7 days Tinned
Lychee, 14 days Popping Balls/Glace Cherries, 28 days Desiccated
Coconut/Lime Cordial/Homemade Lemonade). The guessed defaults are gone —
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

---

## Unresolved

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
