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
Saved so nothing gets lost while other work (spec sections, fruit prep,
garnish stock) proceeds. Nothing above has been corrected in the live data —
still exactly as entered.
