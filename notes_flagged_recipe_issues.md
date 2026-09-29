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
Saved so nothing gets lost while other work (spec sections, fruit prep,
garnish stock) proceeds. Nothing above has been corrected in the live data —
still exactly as entered.
