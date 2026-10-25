# P11 — persistent "Example" display: MANUAL REVIEW PLAN

Trial host (sandbox, container `scalar-trial-b`, **do not use for anything else**):
`http://94.131.243.236:8102` — serves the **api-docs** PROD build at `/` (path routing, what
docs.ehealth.gov.ua will ship) and the **api-docs-platform** portal at `/platform/`
(hash routing). Both load the same `assets/example-styles.js`.

Four styles, chosen with `?exstyle=`; `default`/no parameter = today's stock behaviour
(hover popup). A switcher (bottom-right) flips styles live without reloading; the choice
is remembered per browser tab (`exstyle=default` clears it).

| `exstyle` | Look | Long values |
|---|---|---|
| `inline` | muted `e.g. value` right after `type · required`, one line | ellipsis at 42ch, full text in native tooltip |
| `nextline` | monospace chip on its own line under the name, `EXAMPLE` micro-label | 2-line clamp, tooltip |
| `pill` | compact bordered pill after the type, `e.g.` prefix | ellipsis at 28ch, tooltip |
| `block` | full value on its own line, accent rail, `EXAMPLE` micro-label | wraps (anywhere), max 7.5em then scrolls |

In every style the value is the **original copy button**: click = copy, Tab-focusable, a
copy icon appears on hover / keyboard focus.

## Routes to review (api-docs URLs; `…` = `http://94.131.243.236:8102`)

Append `?exstyle=<style>` to any of them (replace `inline` below to compare).

| # | Why this route | URL |
|---|---|---|
| 1 | Dense field list + base64 `signed_data` (very long string) + JSON-ish examples | `…/medical-events/tag/medical-events/POST/api/patients/{id}/encounter_package?exstyle=inline` |
| 2 | **Longest values**: `/decoded-payload` page, ~700 examples, object-valued examples (`encounter`), nested trees — expand "Show Child Attributes" | `…/medical-events/tag/medical-events/POST/api/patients/{id}/encounter_package/decoded-payload?exstyle=block` |
| 3 | oneOf pickers in the request body (pickers must still change the Request example) | `…/medical-events/tag/approvals/POST/api/patients/{patient_id}/approvals?exstyle=nextline` |
| 4 | Dense + pickers (`device_requests`) | `…/medical-events/tag/device-requests/POST/api/patients/{patient_id}/device_requests?exstyle=pill` |
| 5 | Response with oneOf, GET collection | `…/medical-events/tag/medical-events/GET/api/patients/{patient_id}/conditions?exstyle=inline` |
| 6 | General MIS: signed op (long `signed_content`) | `…/general-mis/tag/public-medical-service-provider-integration-layer/PATCH/api/v3/declaration_requests/{id}/actions/sign?exstyle=nextline` |
| 7 | General MIS: short fields (phone numbers, enums) | `…/general-mis/tag/public-medical-service-provider-integration-layer/POST/api/verifications?exstyle=pill` |
| 8 | eHealth PIS | `…/ehealth-pis/tag/public-patient-information-system/PATCH/api/pis/declaration_requests/{id}/actions/sign?exstyle=block` |
| 9 | eHealth Trusted PIS | `…/ehealth-trusted-pis/tag/public-patient-information-system/POST/api/pis/sign-up?exstyle=inline` |
| 10 | Platform portal (hash routing, same CSS) | `…/platform/reference.html?env=prod&exstyle=inline#medical-events-prod/tag/medical-events/POST/api/patients/{id}/encounter_package` |

Note: the specs contain no schema with a plural `examples` today; that case (several values
in one popup) is covered by CSS (values wrap / stack) and was checked synthetically by
cloning value buttons into a live list (no overflow in any style) — nothing to eyeball on
the real content.

## What to look at, per style

1. **Scan-ability**: can you read id / type / required / sample at a glance on route 1 and 7?
   Which style is least noisy on route 2 (hundreds of rows)?
2. **Long values** (routes 1, 2, 6): base64 and JSON-object examples are cut/clamped sensibly;
   the row never grows absurdly tall (`block` caps at ~7 lines); no horizontal page scroll.
3. **Copy**: click a value → paste somewhere → equals the full example (including the
   truncated ones). Hover shows the copy icon; Tab to a value and press Enter/Space also copies.
4. **Pickers / oneOf** (routes 3, 4, 5): change a picker; the Request/Response example on the
   right still changes, and the example under the newly selected branch appears inline.
5. **Dark theme**: toggle with the sun/moon switch at the bottom of the left sidebar (or set
   the OS to dark); check contrast of the muted `e.g.`, chip/pill borders and the `block` rail
   on route 1 and 2.
6. **Narrow widths**: resize to ~390 px (or phone emulation): values wrap or truncate inside
   the column, nothing overflows (the switcher floats over the bottom edge; harmless).
7. **Density verdict**: pick one style for the final default (see "Finalizing").

## Regression checklist — default view must be unchanged

Open each URL **without** `exstyle` (use a fresh tab, or click `default` in the switcher /
open `?exstyle=default`):

- [ ] Example label is the stock dotted-underline `Example` / `Examples`; hovering it shows
      the stock popup; clicking the value in the popup copies it.
- [ ] No switcher, no data-exstyle attribute (`document.documentElement.dataset.exstyle` is
      `undefined`), no `<style id="ehealth-example-styles">` in `<head>`.
- [ ] Left sidebar, search, `Test Request`, code samples, response tabs, "Show Child
      Attributes" all behave as before; pickers on routes 3–5 still drive the examples.
- [ ] Compare against the stock sandbox `http://94.131.243.236:8095` (same route, same width):
      identical layout.
- [ ] A different env still loads (platform: `?env=preprod|demo|stage`).

Automated evidence is in the PRs (default-view DOM + screenshot identity on 20 routes across
all four services; per-style console/overflow/clipboard/picker checks; generated
`scalar-docs/*.json` and specs byte-identical).

## Finalizing once a style is chosen

1. Tell the owner which style (`inline` / `nextline` / `pill` / `block`).
2. In `assets/example-styles.js` keep only that style's rules, drop the `?exstyle` gate, the
   switcher and the `sessionStorage` code, remove the `[data-exstyle]` qualifier, inject the
   `<style>` unconditionally (or move the CSS into Scalar's `customCss` config).
3. Bump `?v=p11` → `?v=p11-final` in `reference.html` / `index.html`, regenerate the prebuilt
   Scalar docs (`prebuild.mjs`, see CLAUDE.md), update `SCALAR_PATCHES.md` P11 (status
   "shipped", single style), keep `scripts/p11_example_styles_check.mjs` as the regression
   gate (adapt the per-style loop), ship to all four `docs*` hosts in the same change.
