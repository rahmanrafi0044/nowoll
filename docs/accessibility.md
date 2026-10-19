# Accessibility audit — WCAG 2.1 AA (step 52, October 2026)

**Accessibility** means the shop works for customers with weak eyesight or colour blindness, shaky hands, or who
use a screen reader (the phone reads the page aloud) or only a keyboard. It also helps everyone on a small phone
in bright sunlight: readable text, clear errors, nothing hidden off the edge of the screen.
**WCAG 2.1 AA** is the international standard for it (and what Google's Lighthouse checks).

**Result: the shop passes. Seven problems found and fixed; every check is now an automatic test.**
Lighthouse accessibility score: **99–100** on the homepage, listings and product page.

## How it was checked

| Check | How | Where |
|---|---|---|
| The WCAG rules a machine can decide: contrast, names of buttons/links/fields/images, headings, landmarks, ARIA, language, zoom | **axe** (the standard checker, by Deque) — WCAG 2.1 A + AA and its best-practice rules | `tests/e2e/specs/accessibility.spec.ts` |
| …on every customer page | 15 pages, phone **and** desktop layout: home, shop, category, product, bag, tracking, sign-in/register/forgot password, blog + post, privacy/terms/returns, 404 | same |
| …in every state a customer passes through | cookie banner (+ its choices), phone menu open, bag drawer, each checkout step, checkout with errors, review, confirmation, all account pages | same |
| Keyboard only | a whole purchase with Tab / arrows / Enter / Escape; **at every stop the focus must be visible**; the bag keeps focus while open, Escape returns it | same |
| Errors | a wrong mobile number / an empty address → the focus lands on the wrong field, which says "invalid" and reads its error | same + unit tests |
| Small screens and zoom | no sideways scrolling at 320 px wide (= 200% zoom on a laptop) | same |
| Admin panel (decision A: scan only) | sign-in + 30 panel pages | same |
| Brand colour (admin-editable) | already refused below 4.5:1 contrast with white text | `packages/validation/src/settings.ts` |
| Code | the linter's accessibility rules (`jsx-a11y`) | every commit |

## What was found and fixed

1. **Errors were silent for screen readers.** After a failed "Continue", the fields showed their errors, but focus
   stayed on the button — a screen-reader user heard nothing. Now focus moves to the first wrong field
   (`useFocusFirstError`, in all 8 forms with field errors: checkout contact + address, register, profile,
   address book, order tracking, reviews, returns).
2. **Address dropdowns had the error inside their label** — read as one name, "Division Choose a division". Now
   the name is "Division" and the error is its description (and the border turns red, like other fields).
   Same linking for the return-reason dropdown.
3. **Product cards hid their keyboard focus** (`outline-none`) — a keyboard user couldn't see which product was
   selected. The focus ring is now drawn around the whole card.
4. **No "Skip to main content" link** — keyboard users had to tab through the header and menu on every page. It is
   now the first Tab on every page.
5. **Checkout review list** (contact / address / delivery / payment): the "Change" buttons broke the list
   structure, so screen readers couldn't pair "Delivery" with its value. Fixed, same look.
6. **Listing pages**: product names (`<h3>`) came right after the page title (`<h1>`); a hidden "Products"
   heading now sits between, for people who move through pages by headings. And on a 320 px phone, "Sort by"
   pushed the page 5 px wider than the screen — the toolbar now wraps.
7. Admin: the announcement preview dimmed its text to unreadable when switched off — it now says "hidden on the
   shop" instead.

## Keeping it right

- **The tests run on every PR** (`pnpm test:e2e`): a new page or change that breaks a rule fails CI.
  A new customer page → add it to `PAGES` in `accessibility.spec.ts`.
- **Product photos need alt text** — the admin already requires it. Good alt text says what a customer would want
  to know: *"Navy cotton panjabi, front view"*, not *"IMG_2034"* or *"photo"*.
- **Forms**: use `<Input>` from `@nowoll/ui` (label, hint and error wired up), call `focusFirstError()` when a
  submit finds mistakes.
- **Never** remove a focus outline without drawing another one.
- `pnpm lighthouse` reports the accessibility score next to the speed score.

## Worth a try yourself (5 minutes)

Turn on **TalkBack** (Android: Settings → Accessibility → TalkBack) and buy a shirt on nowoll.com by swiping
and double-tapping. Automatic tests prove the rules; hearing the shop read aloud shows how it feels.
