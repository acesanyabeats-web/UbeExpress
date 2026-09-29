# Flagged recipe issues — pending Alex's correction pass

Saved from the bulk menu-entry session (36 new cocktails: 16 spritz/Pimms/Mojito,
14 Pop Star/novelty jars, 6 mocktails). Entered faithfully from screenshots of
the official Joiners Arms app; nothing below was silently "fixed" — flagged
here for Alex to review and correct in-app like the earlier 3-cocktail pass.

## Recipe/method mismatches (transcribed exactly as shown)

- **Mojito Blackberry** — the puree ingredient, the method text ("raspberry
  puree"), and the garnish text ("raspberries") all say raspberry, despite the
  drink being named Blackberry. Only the fruit-chunk ingredient row itself says
  "Blackberry" (16g). Looks like a copy-paste from Mojito Raspberry with only
  that one row swapped.
- **Pimms Jug** — method text says "add 125ml Pimm's" but the ingredient row
  lists Pimms at 150ml. Entered as 150ml (matches the ingredient table); the
  method step was rewritten generically ("Add the Pimm's...") to avoid
  asserting either specific number.
- **Homemade Cherry Cola** — method mentions "a lemon wedge" and "homemade
  lemonade mix," but neither a Lemon row nor a Homemade Lemonade row exists in
  this recipe's own ingredient list (only Post Mix Coke Zero for the soda
  component). Looks like a copy-pasted method template from a different
  Homemade-lemonade-based drink, never edited for the Coke Zero variant.
- **Dragon's Potion** — the ingredient row is named "Chai Seeds," but the
  method text says "chia seeds" twice. Almost certainly a source-side typo
  (chia is the real bar ingredient; chai seeds isn't a thing) — transcribed
  the ingredient name exactly as shown in the source system.
- **Dragon's Potion** — garnish text says "strawberry pencil cut in half," but
  the tracked ingredient is "Cherry Pencils." Real mismatch, not resolved.

## Odd conversion artifacts (the "give me all cases" ask)

Already-confirmed pattern: 5.145ml = 1 "splash" (internal POS conversion
factor), confirmed by Alex on an earlier pass.

- **Pimms Original** — Post Mix Lemonade shown as 25.725ml in source =
  5 × 5.145. Converted to unit='splash', amount=5.
- **Strawberry Wizz Fizz** — Post Mix Lemonade shown as 5.145ml in source.
  Converted to unit='splash', amount=1.
- **Homemade Cherry Cola** — Post Mix Coke Zero shown as 25.725ml in source =
  5 × 5.145. Converted to unit='splash', amount=5.
- **Pimms Royale** — Post Mix Lemonade shown as 18.375ml in source. Does
  **not** cleanly divide by 5.145 (≈3.57×, not a clean multiple) — left as
  raw ml, NOT converted, flagged as a distinct unexplained decimal-precision
  artifact.

## Likely unit-entry errors (transcribed as-is, not corrected)

- **Raspberry Pop Star, Passionfruit Pop Star, Lychee Pop Star, Strawberry Pop
  Star** — all show "Lemon 0.25 gram." Almost certainly should be 0.25 each
  (a lemon wedge), matching the 0.25-each convention used elsewhere for
  fractional citrus garnish portions.
- **Tropical Cooler** — "Pineapple 0.1 gram." Likely should be 0.1 each,
  matching the same convention used for Oranges/Grapefruit Pink elsewhere
  (0.1 each = a garnish wedge/slice).
- **Homemade Raspberry-ade** — the batch-mix ingredient ("Homemade Raspberry
  Lemonade - Batch") was shown with unit "1 serving(s)" in the source, which
  isn't a real unit in Ube Express. Mapped to 1 each as the closest fit.

## Other real findings, not corrected, just noted

- **Naming collision**: "Homemade Lemonade" is both a finished cocktail on
  the menu AND the name of a raw batched syrup/mix ingredient used inside 7
  other recipes (Baby Bath, Baby Vimto, Tropical Cooler, Homemade Ginger-ade,
  Homemade Raspberry-ade's sibling recipes, etc). No technical conflict
  (different tables), but worth knowing when searching or auditing data.
- **Glass icon gap**: several new cocktails use novelty vessels the app has
  no icon for — handled jar/mason mug (Rocket Fuel, all 4 Pop Stars, Give me
  Smores, Baby Vimto, Homemade Cherry Cola, Tropical Cooler, Homemade
  Ginger-ade, Homemade Lemonade, Homemade Raspberry-ade, Apple Cooler,
  Passionfruit Cooler), mini bathtub (Baby Bath), goldfish bowl (Dragon's
  Potion, Elmo), mermaid tail glass (Mermaid Shake). All mapped to the
  closest existing icon (mostly highball, a few rocks) — the recipe DATA is
  correct, only the glass ICON shown may not match the real vessel. Open
  question: worth adding real icons for these, or leave as approximated.
- **Cherry, Lime, Tequila Spritz** — fixed two obvious source-side typos in
  the method text ("wqith"→"with", "srup"→"syrup") since they were clearly
  spelling errors, not real ambiguity about what to do.

---

## Batch 4 (13 new cocktails: Peach Iced Tea, Ube Cloud, Coconut Cloud, Dragon
Fruit Cloud, Key Lime Pie, Mango Smooth, Honey and Lemon Soda, Berry
Butterfly, Lychee and Ube Soda, Galaxy Soda, Pomegranate and Peach Soda, Pink
and Purple Soda, Dragon Fruit and Lychee Soda). Same discipline: entered
faithfully from screenshots, nothing silently "fixed."

- **Homemade Lemonade 501ml** — appears identically in both Key Lime Pie and
  Mango Smooth, an oddly precise, implausible value for a single serve. Same
  number in two unrelated recipes suggests a systemic copy-paste error in the
  source (perhaps meant to be 50ml or 150ml) for whatever shaken
  Homemade-Lemonade-based template these two were built from. Entered as
  shown (501ml) in both.
- **Real - Mango Syrup 50g** (Mango Smooth) — gram unit for what's almost
  certainly a syrup normally measured in ml, same class as the earlier
  Lemon-in-grams errors below. Entered as shown.
- **Coconut Dessicated** (Coconut Cloud ingredient row) vs. "desiccated"
  (correctly spelled in that same recipe's method text) — real spelling
  inconsistency between the ingredient name and the method. Transcribed the
  ingredient name exactly as the source system shows it ("Dessicated"); the
  same spelling was used for the matching entry in app.js's garnish-stock
  list so the two stay consistent with each other, even though it's the
  "wrong" spelling relative to the method text.
- **Lemon 0.05 gram** (Honey and Lemon Soda) — another instance of the
  "Lemon in grams" unit-error class already flagged in Batch 1 (there it was
  0.25 gram → likely 0.25 each); this one is suspiciously tiny at 0.05. The
  method text mentions "lemon slices" (plural), which doesn't square with
  0.05g of anything. Entered as shown.
- **Butterfly Pea** — a genuinely new ingredient, not fitting either
  classification list in app.js: it's a flavourless natural blue colour
  extract used in tiny doses (~0.05-0.5g/drop), not fresh produce needing
  daily portioning (Fruit & Syrups) and not a sweets/novelty garnish
  consumable (Sweets Garnish Stock). Left uncategorized on purpose rather
  than forced into either list — flagged for Alex to decide where (if
  anywhere) it should be tracked for prep/restock purposes.
- **Dragon Fruit and Lychee Soda** — the method text was cut off below the
  screenshot viewport in both images provided for this cocktail; only the
  ingredients were visible. Inserted with the real ingredient list but an
  empty method (`method_steps: []`) and no garnish, rather than guessing
  steps from the similar "Soda" family pattern used by the other soda
  cocktails in this batch. Needs Alex to supply the real method text.
- **Mango Smooth** — the method text calls for "mango puree," but the
  tracked ingredient row is named "Real - Mango Syrup." Likely the same
  product referred to two different ways — a naming variance, not
  necessarily a real data error.
- **Dragon Fruit Cloud** — the garnish text says "freeze-dried dragon
  fruit," but the tracked ingredient (reused from the existing "Dried
  Dragonfruit" garnish-stock item) is named "Dried Dragonfruit." Minor
  phrasing variance only — no new categorization gap, since it reuses an
  ingredient name already established in an earlier batch.
- **Glass icon gap, continued** — Key Lime Pie and Mango Smooth both specify
  "handled glass" in their method text; no dedicated icon exists for this
  vessel (same open gap as Batch 1's handled jar/mason mug list). Mapped to
  'highball' per the established fallback convention — recipe DATA is
  correct, only the glass ICON may not match the real vessel.

---

## Cocktail/Mocktail split — classification methodology, needs your check

Added a new `is_mocktail` column and split the Cocktail Spec menu into two
sub-tabs. There's no existing "is this alcoholic" field anywhere in the
source data, so this was inferred by checking every one of the 78 cocktails'
ingredient lists for a real spirit/liqueur/fortified-wine ingredient
(Bacardi, vodka, tequila, gin, Aperol, Campari, Pimms, Amaretto, Baileys,
schnapps, Prosecco, ASUKI liquors, etc.) — 33 drinks with none flagged
Mocktail, 45 with at least one flagged Cocktail.

**One real assumption this rests on, please double-check**: several drinks
(Baby Bath, Baby Vimto, Berry Butterfly, Galaxy Soda) use "**Finest Call
Blue Curacao**" — Finest Call is otherwise a non-alcoholic mixer brand in
this data (purees/syrups/grenadine), so I treated this specific product as
their 0%-ABV Blue Curaçao *flavoured syrup*, not the real alcoholic Blue
Curaçao liqueur, and classified those drinks as Mocktails on that basis. If
the bar actually stocks the real spirit under that same ingredient name,
Baby Bath and Galaxy Soda (the two that rely on it with nothing else
alcoholic in the recipe) would need to move to the Cocktails tab. Worth
confirming directly since this is a real service-safety distinction, not
just a menu-organization one.

Every cocktail sharing a "flavour family" (Mojito, Double Dutch, Pop Star,
Pimms) turned out to be uniformly one type or the other in the current
data — no family currently has mixed alcoholic/non-alcoholic flavours — so
the family-grouped menu rows didn't need any special-case handling. Full
per-drink classification and the new admin "Mocktail (no alcohol)" checkbox
(so this never has to be re-derived from ingredients again going forward)
are both live.

---

## Real physical menu cross-check (10 photos, Sep 29) — 8 new drinks entered,
## a real batch of discrepancies found against what's already live. Nothing
## already-entered was silently changed — only flagged below, per the same
## discipline as every prior batch.

### 8 new drinks entered (no method steps or amounts — this printed menu
### never shows quantities or build instructions, only names/prices/blurbs)
- **Grapefruit Bliss** (cocktail, £11.00) — Grapefruit Gin, St Germaine
  Elderflower Liqueur, Elderflower Cordial, Elderflower & Rose Cordial,
  Grapefruit Soda, Grapefruit Pink (garnish). **Real oddity, not
  resolved**: the menu lists THREE separate elderflower-family products in
  one drink (a liqueur + a cordial + an "elderflower & rose" cordial) — an
  unusually large ingredient count for one item; worth a quick sanity check
  that this isn't a menu-writing duplication rather than 3 real bottles.
  "Grapefruit Gin"/"Grapefruit Soda" have no exact match in the tracked
  ingredient vocabulary — entered under those literal names, real brand
  unconfirmed (guessed Fever Tree for the soda based on the house pattern
  elsewhere, not stated on the menu).
- **Electric Reef** (cocktail, £8.00) — Take Tequila - Blanco (menu just
  says "tequila," blanco assumed as the base/default), Blend Melon Liquor,
  Finest Call Blue Curacao, Kulana Pineapple Juice, Lemon Sorbet, Soda
  Water, Gimber, Lime Cordial (new, no existing match), Lemon, Oranges.
- **The Purple One** (cocktail, £8.50) — Boe - Violet Gin, Monin Violette
  Syrup, Peach Schnapps, Edible Glitter, Soda Water, Post Mix Lemonade.
  Garnish: lavender sprig (not edible).
- **Cookie Monster Shake** (mocktail, £5.00) — Milk Semi Skimmed, Squirty
  Cream, Finest Call Blue Curacao, Chocolate Chip Cookie (new), Ping Pong
  Balls (eyeballs, reused from the existing tracked item).
- **Minion** (mocktail, £5.00) — Finest Call Blue Curacao, Monin Banana
  Syrup (new, brand guessed to match the house Monin convention), Homemade
  Lemonade, Double Cream + Milk Semi Skimmed (the "banana cold foam,"
  broken into base components the same way Ube Cloud's cold foam already
  is).
- **Peach Crumble** (mocktail, £6.00) — Real - Peach Puree, Homemade
  Lemonade + Monin Vanilla (a real interpretive call: the menu says "vanilla
  lemonade," which isn't a separately tracked product — assumed it's
  Homemade Lemonade flavoured with the existing Monin Vanilla syrup rather
  than a genuinely distinct SKU; flagging since this is a real assumption,
  not a transcription), Vanilla Gelato, Peach Hearts, Crumbled Shortbread
  (new), Mint - Fresh.
- **Orange + Passionfruit Soda** (mocktail, £5.00) — Kulana Orange Juice,
  Finest Call Passionfruit Puree, Finest Call Blue Curacao, Soda Water,
  Dried Orange Slices, Mint - Fresh.
- **Hugo Spritz** (cocktail, £8.00 assumed — matches every sibling spritz's
  price, the digit itself was glare-obscured on the photo) — built per your
  direct clarification (same as Aperol Spritz, elderflower liqueur instead
  of Aperol): St Germaine Elderflower Liqueur, Da Luca Prosecco, Soda
  Water. Grouped into the existing "Spritz Cocktails" family. **Garnish
  deliberately left blank** — Aperol Spritz's own garnish (orange slice)
  may not suit an elderflower drink; didn't want to guess.
- `chocolate chip cookie` / `crumbled shortbread` added to the Sweets
  Garnish Stock classification list so they show up in Fruit Prep.

### Real discrepancies found between the LIVE app and the physical menu
(nothing changed — flagged for your own correction pass)
- **Dancing Queen** — the app tracks "Freeze Dried Raspberries" (in both
  the ingredient list AND the garnish field, so it's consistent internally)
  but the physical menu explicitly says "freeze-dried **strawberry**
  pieces." A real fruit-type conflict between the two sources, not a typo
  in one field — worth checking which is actually correct.
- **Galaxy Soda** — same shape of conflict: the app consistently tracks
  "Popping Balls - Strawberry" (ingredient row AND garnish both say
  strawberry) but the physical menu says "Blueberry + **raspberry** boba."
  Real fruit-type conflict, not resolved.
- **Baby Bathtub** (menu name) / "Baby Bath" (app name) — a real 3-way
  mismatch: the app's ingredient list says the boba flavour is
  Passionfruit, the app's own garnish field separately says "mango
  bubbles," and the physical menu says "passionfruit boba bubbles." Three
  different claims for what should be one fact.
- **Mad Scientist** — the app's recipe is missing "fresh lemon juice" and
  "soda water," both explicitly listed on the physical menu.
- **Witching Hour** — the app tracks Lemon Sorbet, Lime Juice, Mixed Berry
  Coulis and Soda Water, none of which appear on the physical menu's
  ingredient list; the menu lists "sugar syrup" which isn't tracked at all
  (edible glitter IS already captured, just in the garnish field, not
  ingredients — that part's fine).
- **Coco Loco** — the app tracks "Tails Porn-star Martini Mix," an
  ingredient with no connection to this drink on the physical menu at all
  (Coco Loco is coconut/pineapple/passionfruit, not a Porn Star Martini
  variant) — worth double-checking this isn't a copy-paste leftover.
- **Pornstar Martini** — the app is missing "Mexican lime juice" and a
  separate "passionfruit juice" (distinct from the passionfruit puree
  already tracked), both listed on the physical menu.
- **Mermaid Shake** — the app tracks "Ube Extract," not mentioned anywhere
  on the physical menu for this drink (Ube Cloud/Witching Hour are the
  real Ube drinks); the menu also says "double chocolate syrup," which
  isn't tracked (only white chocolate syrup is).
- **Give me S'mores** — the app is missing "marshmallow paste," explicitly
  the FIRST ingredient listed on the physical menu.
- **Sweet Shop** — the app tracks "Post Mix Lemonade," not mentioned on the
  physical menu's ingredient list.
- **Pick Me Up** — the app tracks "Sugar - Granulated"; the physical menu
  says "sugar syrup" — same unit/form-mismatch pattern already flagged for
  other drinks in earlier batches.
- **Pink Gin Sling** — the app's gin is tracked as "Chilled Raspberry Pink
  Gin"; the physical menu names the real product "Chilled Pub's Lychee &
  Raspberry Gin" — possibly a different real bottle, not just a shortened
  name (lychee isn't in the tracked name at all).
- **Key Lime Pie** — the app tracks "Vanilla Gelato," which does NOT appear
  anywhere in this drink's ingredient list on the physical menu — a real
  conflict between this menu and whatever the original screenshot source
  (Batch 4) showed.
- **"Raspberry, Passionfruit & Lemon Cooler"** (physical menu, £4.50) vs.
  the app's existing **"Passionfruit Cooler"** — genuinely unclear whether
  these are the same drink under two different names, or two different
  drinks. The app's version uses "Belvoir Raspberry n Lemon" + a separate
  passionfruit puree; the menu names a single combined product, "Belvoir
  Raspberry, Passionfruit and Lemon cordial," and adds soda water + crushed
  ice which the app's version doesn't have. **Not inserted as new and not
  merged** — genuinely need your call on this one.

### Real naming-only mismatches (ingredients match fine, just the display name differs)
- "Apple Cooler" (app) vs. "Apple N Raspberry Cooler" (menu) — raspberry IS
  a tracked ingredient, just missing from the name.
- "Strawberry Wizz Fizz" (app) vs. "Baby Wizz Fizz" (menu) — completely
  different name, same recipe.
- "Homemade Ginger-ade" (app) vs. "Homemade Lemon N Gingerade" (menu).
- "Bathtub" (app, no boba/popping-ball ingredient tracked at all, garnish
  says just "rubber duck, mint sprig, lemon/lime slices") vs. "Chilled
  Bathtub" (menu, £14, explicitly "for 2 to share," has passionfruit boba
  balls). Given the price/serving-size framing and the real ingredient
  difference, these might genuinely be two different real menu items (an
  older single-serve version vs. a newer £14 sharer), not just a renamed
  duplicate — worth confirming rather than assuming either way.

### One systemic naming question, worth a single answer covering all of them
The physical menu consistently says **"boba balls"** wherever the app
tracks an ingredient as **"Popping Balls - [flavour]"** — Double Dutch, Pop
Stars, Chilled Bathtub, Baby Bathtub, and the flavour/boba garnish on
several Homemade Sodas all show this same pattern. Popping boba (bursts
with flavoured liquid when bitten) and standard tapioca-style boba (just
chewy) are genuinely different real products behind a bar — worth
confirming once whether the tracked "Popping Balls" ingredient is actually
correct, or whether it should be renamed/split to match what's really
stocked, rather than leaving the app's internal name silently different
from what's printed for customers.

### Real, structural gap: there's no price field anywhere in the app
Every photo in this batch was full of real prices, and the app currently
has nowhere to store them (`cocktails` has no price column at all). Not
added in this pass — a real schema/scope decision, not guessed at. Let me
know if you want prices tracked going forward; if so I'd need either your
say-so to add the column now (I only have prices for the drinks in this
batch, not the other ~78 already entered) or a plan for backfilling the
rest.

### Deliberately skipped, per your direct instruction
The Iced Coffees, Iced Lattes, Iced Matcha, Sweet Iced Tea and Soft Drinks
pages (2 of the 10 photos) were not entered — flagged for later, not
forgotten.

---
Saved so nothing gets lost while other work (spec sections, fruit prep,
garnish stock) proceeds. Nothing above has been corrected in the live data —
still exactly as entered.
