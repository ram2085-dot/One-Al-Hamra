# Phase 1 Accessibility: Static Code Audit (live keyboard walkthrough still required)

**Date:** 2026-08-24
**Auditor:** Claude (automated static code review)
**Method:** Static reading of committed source (Tasks 13–17). No dev servers, browser,
or live interaction were used.

## Important — read before relying on this document

This machine has no Node.js, npm, or Docker available, so the dev servers
(`npm run db:up`, `npm run start:dev`, `npm run dev`) could not be started and no
browser could be opened. **A live keyboard-only walkthrough, as specified in the
original Task 18 brief and required by spec §8/§9, was NOT performed.**

What follows is a **static accessibility audit**: every interactive element in the
Tasks 13–17 source files was read and assessed against keyboard-accessibility rules
(native semantics, focus-visible styling, DOM/tab order, labels). This catches a
real, meaningful class of defects, but it **cannot** catch:

- Runtime focus-management bugs (e.g., focus not moving to newly revealed content,
  focus lost after an async state update)
- Dynamic content focus loss (e.g., after the "report issue" form submits and
  unmounts, or after an admin table row re-renders following a status change)
- Actual browser/OS-level focus-ring rendering, z-index/overlap issues that hide a
  visible focus ring in practice, or focus trapped by third-party widgets
- Screen reader announcement behavior (only rough ARIA correctness was checked)
- Timing-sensitive issues (e.g., the 250ms debounce in `CatalogHome`'s search)

**A real keyboard-only walkthrough in a running browser is still required before
Phase 1 is considered accessibility-complete.** This document does not replace that
step; it reduces the odds of gross defects being present when that walkthrough
finally happens.

## Files audited (all read in full)

- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/CatalogHome.tsx`
- `apps/web/src/pages/ServiceDetail.tsx`
- `apps/web/src/pages/admin/AdminConsole.tsx`
- `apps/web/src/pages/admin/ServiceForm.tsx`
- `apps/web/src/pages/admin/EntitlementEditor.tsx`
- `apps/web/src/pages/admin/AliasEditor.tsx`
- `apps/web/src/components/AppHeader.tsx`
- `apps/web/src/components/SearchBar.tsx`
- `apps/web/src/components/CategoryFilter.tsx`
- `apps/web/src/components/ServiceTile.tsx`
- `apps/web/src/components/EmptyState.tsx`

## Audit criteria

1. **Native keyboard semantics** — is every interactive control a real semantic
   element (`<button>`, `<input>`, `<a href>`, `<form onSubmit>`, `<textarea>`,
   `<label>`) rather than a `<div>`/`<span>` with `onClick` and no `role`/`tabIndex`/
   `onKeyDown`?
2. **Focus visibility** — any `outline-none`/`focus:outline-none` must have a visible
   replacement (`focus:ring-*`/`focus:border-*`) on the same element.
3. **Tab order** — does DOM/JSX order match logical reading order, with no positive
   `tabIndex`?
4. **Labels** — does every form input have an associated `<label htmlFor>` (or, at
   minimum, an `aria-label` acting as its accessible name), and does every icon-only
   or ambiguous button have an `aria-label`?

## Results

| Flow / Component | Audit verdict | Notes |
|---|---|---|
| Login form (`LoginPage.tsx`) | PASS | `<form onSubmit>`, `<label htmlFor="email">` bound to `<input id="email">`, native `<button type="submit">`. Input's `focus:outline-none` is paired with `focus:border-accent focus:ring-2 focus:ring-accent` on the same element — visible replacement present. Submit button has `focus:ring-2 focus:ring-accent focus:ring-offset-2`. Tab order: email input → submit button, matches visual/DOM order. No `tabIndex` used. |
| Catalog search (`SearchBar.tsx`) | PASS | Native `<input type="search">` with `aria-label`. `focus:outline-none` is paired with `focus:border-accent focus:ring-2 focus:ring-accent`. No visible `<label>` element — relies on `aria-label` instead, which is an acceptable accessible name per WCAG 4.1.2, though a visible label would be preferable for low-vision/cognitive-load users. Not treated as a defect. |
| Catalog category filter (`CategoryFilter.tsx`) | PASS | Toggle-pill buttons are native `<button type="button">` with `aria-pressed`, grouped in a `role="group"` container with `aria-label`. No `outline-none` used, so default browser focus ring is preserved (not suppressed). No `tabIndex`. Order matches visual left-to-right layout. |
| Favorite toggle (star button) (`ServiceTile.tsx`) | PASS | Native `<button type="button" aria-label=... aria-pressed=...>`, icon-only glyph (★/☆) correctly has `aria-label` (`Add to favorites` / `Remove from favorites`). No `outline-none`. |
| Open service tile → detail (`ServiceTile.tsx`) | PASS | Service name is a native `<button>` wrapping text inside an `<h3>`, not a clickable `<div>`. Tab order: name button, then favorite button — matches the rendered left-to-right layout (name left, star right). |
| Empty / no-results states (`EmptyState.tsx`) | PASS | Category shortcut buttons and the mailto help-desk link are native `<button>`/`<a href>`. The disabled "Request a new service" button correctly uses the native `disabled` attribute (removed from tab order, which is the expected/correct behavior for an inert "coming soon" control) plus `aria-disabled="true"` and a `title`. |
| Service detail — launch button (`ServiceDetail.tsx`) | PASS | Native `<button type="button" onClick={onLaunch}>`. No `outline-none` used, default focus ring preserved. |
| Report issue form (`ServiceDetail.tsx`) | PASS | Native `<form onSubmit>`, `<label htmlFor="issue-description">` bound to `<textarea id="issue-description">`. `focus:outline-none` on the textarea is paired with `focus:border-accent focus:ring-2 focus:ring-accent`. Submit button is native. Toggling the form in (`setReporting(true)`) inserts it after the two top buttons in DOM order — logical. **Cannot verify from source** whether focus is actually moved into the textarea when the form appears, or back to a sensible element after submission clears `reporting` — this is exactly the class of runtime behavior a static audit cannot catch; flag for the live walkthrough. |
| Admin: create service (`ServiceForm.tsx`) | PASS | All four inputs use wrapping `<label>` elements that also carry explicit `htmlFor`/`id` pairs (belt-and-suspenders labeling). Native `<form onSubmit>` and `<button type="submit">`. No `outline-none` used. Tab order (name → category → description → support contact → submit) matches the JSX/visual order. |
| Admin: deactivate/retire/activate | **FIXED** (was a real, if minor, defect) | Buttons were native `<button>` elements (correct semantics, no `outline-none` issue), but every row in the table rendered visually-identical button text ("Deactivate", "Retire", "Manage entitlements/aliases") with no accessible way to distinguish which service a given button acts on outside the visual table layout — a real ambiguous-control defect under WCAG 2.4.6/4.1.2 for screen-reader users who navigate by a flat buttons list. **Fixed** in `apps/web/src/pages/admin/AdminConsole.tsx`: each action button now also carries `aria-label={\`${label} ${serviceName}\`}` (e.g. `"Deactivate Foo Service"`), and the expand/collapse "Manage entitlements/aliases" / "Hide" button additionally got `aria-expanded={expanded === s.id}` to announce its toggle state. |
| Admin: expand entitlement/alias editors (`EntitlementEditor.tsx`, `AliasEditor.tsx`) | PASS | Both use `sr-only` `<label htmlFor>` bound to their `<input id>`, native `<form onSubmit>` and `<button type="submit">`. The expand toggle in `AdminConsole.tsx` is a native button (see row above for the `aria-expanded` addition). **Cannot verify from source** whether keyboard focus is preserved/managed sensibly when a table row's nested editors mount/unmount (React re-render on `expanded` state change) — flag for the live walkthrough. |
| Global nav / logout (`AppHeader.tsx`) | PASS | Nav links are React Router `<NavLink>` (renders as `<a href>`), logout is a native `<button>`. No `outline-none` used. Order: logo (non-interactive) → Catalog link → Admin link (if admin) → Logout button, matches rendered left-to-right layout. |

## Summary

- **Native keyboard semantics:** PASS across all 12 files audited. No `<div onClick>`
  or `<span onClick>` patterns were found anywhere; every interactive control uses a
  real semantic HTML element.
- **Focus visibility:** PASS. Every `outline-none`/`focus:outline-none` occurrence
  found (`LoginPage.tsx` input and button, `ServiceDetail.tsx` textarea,
  `SearchBar.tsx` input — 4 occurrences total, verified by full-repo grep of
  `apps/web/src`) has a `focus:ring-2 focus:ring-accent` (Design System accent token)
  replacement on the same element. No invisible-focus defects found.
- **Tab order:** PASS. No `tabIndex` attribute of any kind exists anywhere in
  `apps/web/src` (verified by full-repo grep). DOM/JSX order matches visual/reading
  order on every page reviewed.
- **Labels:** PASS with one real defect found and fixed (see "Admin:
  deactivate/retire/activate" row above). All form inputs have a `<label htmlFor>`
  (visible or `sr-only`) or `aria-label`; the one icon-only button
  (`ServiceTile.tsx` favorite star) already had a correct `aria-label`.

## Fixes made

- `apps/web/src/pages/admin/AdminConsole.tsx`: added `aria-label` (service-name
  qualified) to the Deactivate/Activate/Retire/Manage-entitlements-aliases/Hide
  buttons in the admin services table, plus `aria-expanded` on the
  expand/collapse toggle. This is the only source change made as a result of this
  audit; no other component required a change.

## What remains outstanding

- [ ] **The actual live keyboard-only walkthrough** (spec §8/§9) has not been done.
      Once Node.js/npm/Docker are available, run `npm run db:up`,
      `cd apps/api && npm run start:dev`, `cd apps/web && npm run dev`, and manually
      walk Login → Catalog home (search, category filter, favorite toggle, open a
      tile) → Service detail (launch, report issue form) → Admin console (create
      service, deactivate/retire/activate, expand entitlement/alias editors) using
      only Tab / Shift+Tab / Enter / Space / Arrow keys.
- [ ] Pay particular attention during that walkthrough to the two spots flagged
      above as unverifiable from source: focus movement when the "report issue"
      form appears/submits in `ServiceDetail.tsx`, and focus behavior when an admin
      table row's entitlement/alias editors expand/collapse in `AdminConsole.tsx`.
- [ ] Re-run the per-component axe-core checks (already embedded per Tasks 14–17)
      after any further changes, and confirm they still pass.

Phase 1 should **not** be considered accessibility-complete until the live
walkthrough above is performed and its results recorded here or in a follow-up
document.
