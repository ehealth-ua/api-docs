# Scalar customizations — patch ledger

Single source of truth for **every change we carry on top of vanilla Scalar**
(`@scalar/api-reference` standalone bundle, `assets/scalar.standalone.js`).
Purpose: when Scalar ships a new version we can diff upstream against this
list, see which patches are obsolete, which collide with upstream refactors,
and re-apply the rest.

This file is **kept identical in both repos** and must be updated in the same
PR as any bundle change:

- [`ehealth-ua/api-docs-platform`](https://github.com/ehealth-ua/api-docs-platform) — `SCALAR_PATCHES.md` (tooling repo, sandbox portal)
- [`ehealth-ua/api-docs`](https://github.com/ehealth-ua/api-docs) — `SCALAR_PATCHES.md` (production `docs*.ehealth.gov.ua`)

Narrative/history lives in `api-docs-platform/SCALAR_FORK_TRACKING.md` and
unpatched bugs in `SCALAR_KNOWN_ISSUES.md`; **this file is the compact,
rebase-oriented ledger**. If they disagree, fix both.

## Current build

| | |
|---|---|
| Cache-bust tag (`<script src="…/scalar.standalone.js?v=…">`) | `1.63.0-ehealth-custom.9e7daf33` — see [Bundle cache-bust tag](#bundle-cache-bust-tag) |
| Upstream base | `scalar/scalar` `main` @ `46802789` (2026-07-29), i.e. between `@scalar/api-reference` 1.63.0 (2026-07-20) and 1.64.0 |
| Upstream latest at last review | `1.76.0` (2026-10-23) — reviewed 2026-10-25, **not adopted** (see [Upstream review log](#upstream-review-log)) |
| Bundle format | UMD `dist/browser/standalone.js`, self-contained (`grep -c 'chunks/'` must be `0`) |
| Built how | Source build for the base; patches P3–P11 are **hand edits of the minified output** (not source-level). |

> **Minified names (`Ib`, `TRe`, `Rb`, `y9`…) change on every rebuild.** The
> "Where" column gives the *source* location to re-find the code; the
> before→after snippets are what the old bundle looked like, for orientation only.

## Bundle cache-bust tag

Every page loads the bundle as `scalar.standalone.js?v=1.63.0-ehealth-custom.<hash>`:

- `1.63.0` — **fixed**, never edited by a patch; it is the `@scalar/api-reference` version at our upstream base commit `46802789` (`packages/api-reference/package.json` reads 1.63.0 there; the commit is 1.63.0 plus unreleased upstream work). Change it only when we rebase onto a newer upstream.
- `ehealth-custom` — fixed company marker.
- `<hash>` — **the only part that changes**: the first 8 hex chars of the SHA-256 of `assets/scalar.standalone.js` (`shasum -a 256 portal/assets/scalar.standalone.js | cut -c1-8`). It exists for cache invalidation and change tracking and equals the start of `bundle_sha256` in `manifest.json`.

After any bundle edit: recompute the hash, replace it in all pages (`reference.html`, `observation-oneof-demo.html` in api-docs-platform; `index.html` in api-docs), then regenerate the prebuild (the page hash is in the manifest). Never append patch names or build the tag out of patch ids — the ledger above is where patches are tracked. When two patch PRs touch the bundle, whichever merges last recomputes the hash and manifests.

## Patch ledger

Legend — **Origin**: `upstream` = backport of an upstream PR (drops out once we
rebase past it); `local` = ours alone, must be re-applied/ported.
**Side**: `bundle` = JS edit; `spec` = needs companion change in `portal/specs`.

| ID | Title | Origin | Side | Behavior class |
|---|---|---|---|---|
| P1 | Multiple independent `oneOf`/`anyOf` groups under one `allOf` | upstream [#9732](https://github.com/scalar/scalar/pull/9732) (commit 1) | bundle | fix |
| P2 | `choiceIndex` alignment through `$ref` in `allOf` + `$ref` cycle guard | upstream #9732 (commit `36471bf`) | bundle | fix |
| P3 | `MAX_LEVELS_DEEP` 10 → 25 | local | bundle | config constant |
| P4 | Picker inside array item `allOf:[props,{oneOf}]` drives example | local | bundle | fix |
| P5 | Array-item `allOf` with first-position bare `oneOf` merges instead of splitting | local | bundle | fix |
| P6 | `oneOf` pickers under **response** bodies drive the example | local | bundle + spec | feature |
| P7 | Load performance: skip console-only validation, no eager preload | local | bundle + prebuild | perf |
| P8 | Large request examples keep highlighting + copy button | local | bundle | UX (**held — on branch `scalar-patch-p8-large-examples`, tested on :8095 only, not merged/deployed**) |
| P9 | Request bodies always render all top-level attributes (no "Show additional properties") | local (= upstream config, 1.76) | bundle | config constant |
| P10 | "Expand all / Collapse all" attributes button in the request-body header | local | bundle | UX feature |
| P11 | "Expand all / Collapse all" button in the Responses section | local | bundle | UX feature |
| P12 | Persistent attribute "Example" display, 4 trial styles via `?exstyle=` | local | page asset (CSS/JS, **no bundle edit**) | UX (**trial**) |

### P1 + P2 — multi-group `oneOf` (backport)
- **Upstream:** scalar/scalar#9727 → PR #9732, merged 2026-07-27. Contained in our base `46802789`.
- **Rebase action:** none if the target release is ≥ 1.64.0 (published after the merge). Verify by grepping the new bundle for the `choiceIndex`-ordinal logic / run `observation-oneof-demo.html` (3 independent pickers, no dropped fields). **Drop from ledger once verified.**
- **Where (source):** `packages/blocks/src/schema/helpers/partition-all-of-compositions.ts` (moved from `api-reference` into `blocks` by upstream #10397), `get-example-from-schema.ts`.

### P3 — `MAX_LEVELS_DEEP` 10 → 25
- **Why:** generated `encounter_package` body hit `"[Max Depth Exceeded]"`. Measured max generation depth in our specs is 19 (medical-events); 25 clears with headroom. Schemas are acyclic.
- **Where (source):** `packages/workspace-store/src/request-example/builder/helpers/get-example-from-schema.ts` → `const MAX_LEVELS_DEEP = 10` (constant, no config override).
- **Change:** `Cb=10` → `Cb=25`.
- **Rebase notes:** in upstream 1.76 this constant also derives `MAX_SCHEMA_VALIDATION_DEPTH = MAX_LEVELS_DEEP * 5` and `MAX_COMPOSITION_DEPTH = MAX_LEVELS_DEEP * 5`, so raising it now scales those too (125) — check cost. Upstream #10165 ("truncate deep examples in the declared type") changes what is emitted past the limit; re-check that `[Max Depth Exceeded]` is gone. Run `scripts/check_example_depth.py`.
- **Upstream candidate:** make it a config option.

### P4 — picker in array item `allOf:[{properties},{oneOf}]`
- **Symptom:** `device_requests` POST `parameter[]` — picker label changes, composed example stuck on branch 0. Picker writes `…items.oneOf`, generator reads `…items.0.oneOf`.
- **Where (source):** `getChoiceIndex`-equivalent in `get-example-from-schema.ts` (`Ib` in bundle).
- **Change (bundle):**
  ```diff
  - Ib=(e,t,n,r)=>{let i=n?.compositionSelection?.[SRe(e,t)]; …
  + Ib=(e,t,n,r)=>{let sel=n?.compositionSelection,i=sel?.[SRe(e,t)];
  +   if((typeof i!=`number`||Number.isNaN(i))&&e.length>0&&/^\d+$/.test(e[e.length-1])){
  +     let a=sel?.[SRe(e.slice(0,-1),t)]; if(typeof a==`number`&&!Number.isNaN(a))i=a}
  +   if(!(typeof i!=`number`||Number.isNaN(i)))return Math.max(0,Math.min(i,r-1))}
  ```
  (falls back to the index-less key when the indexed lookup misses and the last path segment is numeric; only adds a hit, never overrides one).
- **Rebase notes:** upstream shipped several `allOf` boundary/index fixes after our base — #10336 (nested allOf object boundaries), #10462 (nested allOf choice boundaries), #10437 (oneOf variant composed with allOf) and a rewritten schema block (#10397). **P4 may be fixed, moot, or broken — must be re-tested empirically**, not assumed.
- **Test:** `device_requests` POST `parameter[]`: select `value_range`, then back through `value_codeable_concept`/`value_quantity`/`value_boolean`.

### P5 — array-item `allOf` with leading bare `oneOf`
- **Symptom:** `device_dispenses` PATCH `…/actions/complete` `details[]` rendered as 2 array items instead of 1 merged object; picker stuck on branch 0.
- **Where (source):** array handler in `get-example-from-schema.ts` (`TRe`): guard for routing `{allOf:[…]}` items through the object-merge path.
- **Change (bundle):** guard from "first `allOf` member has `type:'object'`" to "any member has `type:'object'` or `properties`":
  ```diff
  - let a=r[0 resolved]; if(a&&typeof a==`object`&&`type`in a&&a.type===`object`){…merge via Rb({type:`object`,allOf:r})…}
  + let hasObjMember=r.some(rm=>{let rs=xb.schema(rm);return rs&&typeof rs==`object`&&(rs.type===`object`||`properties`in rs)});
  + if(hasObjMember){…same merge path…}
  ```
- **Affected schemas:** `Device_Dispense_Detail_{Request,EncounterPCG_Request,Response}`.
- **Rebase notes:** same upstream-churn caveat as P4 (re-test; may be obsolete).

### P6 — response-body pickers reactive
- **Symptom:** picker under a response (e.g. `GET …/conditions`, `…/observations`) changed its label but never the "Example Responses" JSON.
- **Cause:** (a) `SchemaComposition` sync logic gated on `schemaContext==='requestBody'`; (b) `ExampleResponse` called the example builder with no `compositionSelection`.
- **Where (source) — upstream moved these:**
  - `packages/blocks/src/schema/SchemaComposition.vue` (was in `api-reference`; **still gated on `requestBody` at lines ~145/213/237 in 1.76**)
  - `packages/api-reference/src/features/Operation/components/ParameterListItem.vue`
  - `packages/api-reference/src/features/example-responses/ExampleResponse.vue` and `ExampleResponses.vue` (**1.76 still passes no `compositionSelection`**)
- **Changes (bundle, 4 edits):**
  1. `SchemaComposition` initial-index computed: drop `t.schemaContext!==`requestBody`||` (depend only on selection ref + non-empty `compositionPath`).
  2. `SchemaComposition` sync watcher: same relaxation.
  3. `ParameterListItem` → `SchemaProperty` gets `compositionPath:[e.name]` (response status code / param name as path root).
  4. `ExampleResponse` gains `responseKey` prop (threaded from `ExampleResponses`'s selected status code), injects the shared selection ref and calls the builder with `compositionSelection` + `schemaPath:[e.responseKey]`.
- **Spec-side companion (mandatory):** `scripts/make_pickers_reactive.py --responses` strips media-level `example` from response bodies containing a picker (done doc-wide on medical-events). A frozen top-level `example` short-circuits the builder.
- **Rebase notes:** HIGH collision risk — upstream's new schema block (#10397) and "select response schema variants" (#10203, adds `get-response-variants.ts`, changes `get-example-from-schema.ts`/`get-example-content.ts`) overlap this area. Re-port against the new component structure rather than patching minified output. Check whether #10203 already covers (some of) the response case.
- **Upstream candidate:** yes — response pickers not driving examples is a general bug.

### P7 — load performance
- **Changes (bundle, 2 one-liners):**
  - `workspace-store` `addDocument`: `if(!Y_(vb,m))` → `if(!1&&!Y_(vb,m))` (skips `Value.Check(OpenAPIDocumentSchemaStrict, doc)`; upstream `client.ts` ~L1189; its only effect is a `console.warn`; 0.6 s/doc).
  - `ApiReference.vue` mount: remove the `preloadDocumentsWhenIdle()` call (`…,xe()` → `…`); upstream ~L1438. Non-active sources load on demand.
- **Companion:** `scripts/scalar_prebuild/prebuild.mjs` ships specs pre-processed as `scalar-docs/<svc>/<env>.json`. It patches the bundle **in memory** using minified-name `GENERATION_PATCHES` anchors — after any rebuild re-check these (it fails loudly) and regenerate all `scalar-docs/`.
- **Measured:** care-plan deep link 6.2 s → ~2.5 s (1× CPU), ~38 s → ~8 s (4×).
- **Rebase notes:** both behaviors still present in 1.76. Upstream added perf work after our base (#10261 cheaper schema walks, #10263 non-reactive store mode, #10264 compact sparse document, `urlRouting:false` #10697) — evaluate whether they reduce the need for P7 / the prebuild step.

### P8 — large request examples keep highlighting + copy button (HELD: branch `scalar-patch-p8-large-examples`, :8095 only)
- **Symptom:** request example > 20 000 chars became unhighlighted plaintext with no copy button. On prod only **2 of 188** request-body operations hit it (`encounter_package/decoded-payload` POST ~58 k chars, PATCH ~61 k).
- **Where (source):** request-example card in `packages/api-reference` (`RequestExample`/`ExampleRequest`: `ScalarVirtualText` swap threshold).
- **Changes (bundle, 2 edits, rebuilt 2026-10-30 on top of P9–P11 from the original working-tree version):** threshold `>2e4` → `>1e5`; the remaining virtual branch is wrapped in `div.group/code-block` and renders the stock `ScalarCodeCopy` (`LY` + backdrop `NY`) fed the FULL text.
- **Cost measured:** those two operations render ~0.2 s slower at 1× CPU (visible 1.3 → 1.5 s, longest task 0.85 → 1.0 s), ~+1 s at 4×; control operation unchanged (905 vs 907 ms). Highlight cost grows with size, hence the 1e5 cap.
- **Rebase notes:** in 1.76 `ExampleResponse.vue` and `ExampleSchema.vue` also carry `VIRTUALIZATION_THRESHOLD = 20_000` — the same limitation likely applies to large **responses** (never patched).
- **Upstream candidate:** make limit configurable / give virtual block a copy button.

### P9 — request bodies: all top-level attributes visible, no "Show additional properties"
- **Symptom:** a request body with more than 12 top-level attributes showed the first 12 and hid the rest behind a **Show additional properties** button (the button sits under a faded card; the hidden attributes only appear after a click, and are absent from Ctrl-F until then).
- **Where (source):** `RequestBody.vue` (`packages/api-reference/src/features/Operation/components/`) — module constant `const MAX_VISIBLE_PROPERTIES = 12` and the computed that splits the schema: `if (properties.length <= MAX_VISIBLE_PROPERTIES) return null` → `{ visibleProperties, collapsedProperties }`. The button is the second `<Schema additionalProperties>` card (i18n key `schema.showAdditionalProperties`).
- **Change (bundle, one literal, in the `RequestBody` component's constants, just before `__name:"RequestBody"`):** `L9=12` → `L9=1e9`. With the cap at 1e9 the `t.length<=L9` guard always returns `null`, so the split never happens and the stock single-card path renders every attribute.
- **Scope check:** that is the only place the bundle collapses a schema behind "Show additional properties". Responses, callbacks, nested schemas, parameters and the models section have no equivalent (the `ShowMoreButton` / `.show-more` component is a different thing: the collapsed Models list and "show all endpoints" in a collapsed tag). So the patch covers every collapsed body; nothing else needed unwrapping.
- **Rebase notes:** upstream added this as config in `@scalar/api-reference` **1.76.0** — `maxVisibleRequestBodyProperties` (default `12`, `0` = unlimited), upstream PR [#10420](https://github.com/scalar/scalar/pull/10420) (2026-10-02, after our base). On upgrade **drop the bundle edit and add `maxVisibleRequestBodyProperties: 0` to the `Scalar.createApiReference(...)` config in `reference.html` / `index.html`** (next to `orderSchemaPropertiesBy`). Verify with a body of > 12 attributes that no button renders.
- **Prebuild:** no effect on the generated `scalar-docs/*.json` (verified byte-identical); only `manifest.json` (`bundle_sha256`, `page_sha256`) changes, so regenerate it on merge.
- **Verified (2026-10-25):** see the PR for numbers. Specs and every `scalar-docs/**/*.json` byte-identical to before; headless-Chrome DOM comparison old vs new bundle over every request-body operation (prod, all 4 services): bodies with ≤ 12 attributes identical; bodies with > 12 render exactly what the old bundle showed after clicking the button; no button anywhere; composed example + pickers still react.
- **Review plan:** per-patch manual review list is in the PR body (section "MANUAL REVIEW PLAN"): open a > 12-attribute operation (no button, attributes in the same order, nothing duplicated), a ≤ 12-attribute control (unchanged) and the picker routes (`device_requests` POST `parameter[]`, `encounter_package`).

### P10 — "Expand all / Collapse all" attributes button (request body)
- **Symptom/need:** a deep body (e.g. `POST …/encounter_package/decoded-payload`, ~1350 nested attributes) has to be opened level by level, one "Show child attributes" click each.
- **Where (source):** `RequestBody.vue` (header row: title · schema name · required · content-type) and `Schema.vue` (the `Disclosure` that owns the Show/Hide child attributes toggle; `defaultOpen` = `noncollapsible || expandAllSchemaProperties(cycle-safe) || on-target-path`).
- **Mechanism:** the existing option `expandAllSchemaProperties` already makes every nested `Schema` open — but only at mount (`Disclosure` is uncontrolled). So the button owns a per-body ref `EXP` and passes `expandAllSchemaProperties:EXP.value` in the `options` of the body's `Schema`; `Schema`'s Disclosure gets `key: collapsible && expandAll ? 1 : 0`, so flipping the flag re-mounts that node with the new `defaultOpen` (all open / all closed). Cycle guard unchanged (`o`), so recursive schemas stay finite. Flag off = renders exactly as before.
- **Speed (large trees):** opening all ~1350 attributes of `encounter_package/decoded-payload` in one go was one 1.6 s main-thread task (6.3 s at 4× CPU). Now the open is **staged one nesting level per animation frame**: `RequestBody` provides a depth ref under `Symbol.for('ehealth.expandDepth')`; `Schema`'s `c` computed also requires `level <= depth` when that ref is injected. First levels paint after ~0.4 s, longest task 1.6 s → 0.4 s (1×), total time about the same. Stepping stops when two frames add no `.schema-card`, or at 64 levels; clicking again cancels it. The top (non-collapsible) node keeps `key` 0, so it is not re-mounted on click.
- **Related finding (why a first stepping attempt was 10× slower):** every `SchemaComposition` (oneOf/anyOf picker) writes its index into the shared `compositionSelection` ref in an *immediate* watcher on mount, and each write regenerates the whole request example (`ORe`/`Rb`, ~2 s for this body). Staged mounting therefore regenerated it once per level. Fix (4th edit below): skip that write when it would only record the default — `index 0`, no entry yet, first branch not `type:null` — which the generator treats identically (`Ib(...)??0`; the response path's `find(first non-null)` returns the same branch). Any non-default pick, or a null-first branch, is written as before.
- **Change (bundle, all inside `RequestBody`, `Schema`, `SchemaComposition`):**
  1. `RequestBody` setup: `EXP` (flag), `EXPD` (depth ref, provided), `runExp(on)` (stepper, rAF).
  2. the 3 `Schema` usages in its template: `expandAllSchemaProperties:e.options.expandAllSchemaProperties` → `…:EXP.value`.
  3. header right-hand group (after the content-type selector): `<button class="request-body-expand-all …">` with an inline-SVG unfold-more / unfold-less icon, `title` + `aria-label` "Expand all attributes" / "Collapse all attributes", `aria-pressed`, `onClick: runExp(!EXP.value)`. **Vue trap:** hand-written vnodes in a compiled (block) tree need `patchFlag 16` on the button and a `key` on the `svg`, otherwise props/children never re-patch (the first attempt expanded the tree but left the button stuck).
  4. `SchemaComposition`: a deep (level > 2) picker hides its content behind a **"Show schema details"** button whose state `m` is read once from the option — a second hidden-content mechanism besides the child-attribute toggles. A watcher now keeps `m` in sync with `expandAllSchemaProperties`, otherwise Expand all misses those (found by comparing counts: 245 vs 275 attributes on `diagnostic_report_package/decoded-payload`).
  5. `Schema`: `{key:0,defaultOpen:d.value}` → `{key:l.value&&c.value?1:0,defaultOpen:d.value}` and `c` gains the depth gate; `SchemaComposition` immediate selection watcher: skip default-only writes (above). When the stepper ends (or is capped) the depth ref is set to ∞, so anything mounted later also follows Expand all.
- **Rebase notes:** upstream 1.76 has a schema-expansion store (`packages/blocks/src/schema/helpers/schema-expansion.ts`, `expandAll()` / `collapseAll()`); re-implement the button on top of it instead of re-mounting. `maxVisibleRequestBodyProperties` (P9) lives in the same component — re-apply both together.
- **Out of scope (not done):** response bodies and parameter sections have no such button; the same `EXP` pattern can be added to `ExampleResponse`'s schema if wanted.
- **Verification & review plan:** in the PR (MANUAL REVIEW PLAN).

### P11 — "Expand all / Collapse all" in the Responses section
- **Need:** same as P10, for the left-column **Responses** list (each status code is a collapsed item holding an attribute tree).
- **Where (source):** `OperationResponses.vue` (heading + list) and `ParameterListItem.vue` (the per-status `Disclosure`; `collapsableItems`).
- **Mechanism:** identical to P10 (state `EXP`, depth ref `EXPD` provided under `Symbol.for('ehealth.expandDepth')`, staged one level per frame by `runExp`), plus: the status item itself must open. `OperationResponses` passes `options:{...e.options, expandAllSchemaProperties: EXP}` to every item; `ParameterListItem`'s Disclosure gets `key` / `defaultOpen` from `collapsableItems && options.expandAllSchemaProperties`, so each status code opens and re-mounts with its tree. Path/query/header lists (`collapsableItems` false) are untouched.
- **Change (bundle, 3 edits):**
  1. `OperationResponses` setup: `EXP`, `EXPD`, `runExp`, `OPTR` (options with the flag), `hasTree` (any response with content/headers).
  2. its template: heading `<div>` → flex row `[<span>Responses</span>, <button class="response-expand-all …">]` (same icon/aria/`patchFlag 16` + svg `key` rules as P10), items get `options: OPTR.value`.
  3. `ParameterListItem`: `{defaultOpen:d.value}` → `{key:…,defaultOpen:d.value||!!(collapsableItems&&options?.expandAllSchemaProperties)}`.
- **Rebase notes:** same as P10 (use upstream's schema-expansion store if present); keep P10 + P11 consistent — the stepper code is duplicated in `RequestBody` and `OperationResponses` (separate module scopes in the minified bundle).
- **Verification & review plan:** in the PR.

### P12 — persistent attribute "Example" display (trial styles; NOT in the bundle)
- **Symptom / request:** in a schema attribute tree the property's example(s) appear only in a hover/focus popup (`Example` label → popup). With a leaf `example` on most scalar fields the reader cannot scan sample values without hovering every row. Wanted: example visible in the row, copy-on-click kept.
- **Upstream:** 1.76.0 has no option for this (`SchemaPropertyExamples.vue` — popup pinned on click, hover/focus CSS, no config) → local patch.
- **Mechanism: no bundle edit.** `portal/assets/example-styles.js` (same file in both repos, loaded by a plain `<script src="…/example-styles.js?v=p12">` right before the Scalar bundle in `portal/reference.html` / `portal/index.html`) re-skins the **existing** DOM with CSS. It is opt-in: with no `?exstyle=` (and nothing in `sessionStorage['ehealth-exstyle']`) it returns immediately — no `<style>`, no listeners, no DOM/attribute change, so the default render is byte-identical to before. `?exstyle=inline|nextline|pill|block|row|rowright|chip` injects `<style id="ehealth-example-styles">`, sets `<html data-exstyle=…>`, shows a small bottom-right switcher (live switching, `default` = back to stock) and remembers the choice per tab in `sessionStorage` (Scalar rewrites the URL while navigating); `?exstyle=default` clears it. A lazy `mouseover`/`focusin` delegate sets `title=<full value>` on the value button so truncated values have a native tooltip.
- **Styles (the "Example" label is hidden in all):** group **A** (value after the type, wraps to its own line when the row is full): `inline` muted `e.g. value` after the type (1 line, ellipsis at 42ch); `nextline` mono chip on its own line under the name (2-line clamp); `pill` compact bordered pill after the type (28ch); `block` full value on its own line with an accent rail, wrapping, 7.5em scroll cap. group **B** (value always on the field's own row, takes the remaining width with ellipsis): `row` and `rowright` (fill boxes), group **C** `chip`, `chipsoft`, `chiptint` (content-hugging chips, 3 backgrounds)  — old: `chip` (own row, exactly the stock popup chip: `--scalar-background-2`, border, radius, mono; no rail). All keep the original `button.property-example-value` (click = copy, focusable, copy icon revealed on hover/`:focus-visible`), handle `example` and `examples` (several values wrap / stack), use only `--scalar-*` variables (light + dark) and never exceed the column width.
- **Scalar DOM/classes the CSS depends on (re-check on every Scalar upgrade):** `.property-heading` › `.property-example` (label `button:first-child` + `.property-example-value-list` popup of `button.property-example-value` › `span` + `svg`). Upstream component: `packages/blocks/src/schema/SchemaPropertyExamples.vue` (compiled scoped CSS `[data-v-370db0bd]` in our 1.63 base: `.property-example-value-list` is `display:none; position:absolute`, shown on `:hover`/`:focus-within`). Our selectors are `html[data-exstyle…] .property-heading > .property-example …` so they outrank the scoped rules; if upstream renames these classes the styles silently do nothing (default view is still fine — verify with `scripts/p12_example_styles_check.mjs`).
- **Rebase notes:** after a Scalar upgrade run the check script; if the classes changed, fix the selectors at the top of `example-styles.js` (variables `H0/V0/B0/L0`). Once a style is chosen: delete the other three style blocks and the switcher/`sessionStorage` code, make the remaining rules unconditional (drop the `[data-exstyle]` qualifier and the `?exstyle` gate, inject the `<style>` always — or move the rules into Scalar's `customCss` option), bump the `?v=p12` cache tag on every edit of the file, regenerate the prebuild (the page hash changes), update this entry.
- **Evidence tooling:** `scripts/p12_example_styles_check.mjs` (platform) / `build/p12_example_styles_check.mjs` (api-docs): default view baseline-vs-candidate (`#app` outerHTML + screenshot), per style: console errors, horizontal overflow at 1280/390 px, every value visible, clipboard == example text, oneOf picker still reacts. `p12_example_styles_shots.mjs`: screenshots per style × light/dark × phone. Both repos' PRs carry the numbers.
- **Upstream candidate:** a `showSchemaExamples: 'inline' | 'popup'` style option would be a small upstream PR.

## Spec-side & tooling dependencies (what a bundle swap can break)

| Dependency | Why it matters on upgrade |
|---|---|
| `scripts/scalar_prebuild/prebuild.mjs` + `scalar-docs/**/*.json` + `manifest.json` | Patches the bundle in memory by minified anchors; JSON is generated by the bundle's own pipeline. Re-anchor, regenerate, `--check` in `deploy.sh`. |
| Specs with no top-level `example` on picker paths (`make_pickers_reactive.py`) | Precondition for P1/P2/P4/P5/P6. Upstream changes to example short-circuiting could alter this. |
| Specs shaped as `allOf:[props chunk,{oneOf},props chunk]` (`restore_oneof_groups.py`) | Requires the fork's "oneOf never a sibling of `properties`" rendering rule (P1/P2). |
| Config: `orderSchemaPropertiesBy:'preserve'` and other options in `reference.html` / `index.html` | Verify options survive the 1.69 schema-layout removal. |
| `portal/observation-oneof-demo.html` | Regression page for P1/P2. |

## Upgrade procedure (rebase checklist)

1. `npm view @scalar/api-reference time --json` → pick target; read `packages/{api-reference,blocks,workspace-store}/CHANGELOG.md` between versions.
2. For each patch above: open the **Where (source)** files at the target tag; decide *obsolete / still needed / needs re-port*. Prefer re-porting at **source level** (new patch files under a `patches/` dir in a Scalar checkout) over hand-editing minified output; record the commit SHA built from.
3. Build: `pnpm turbo build --filter=@scalar/api-reference...`; vendor only `dist/browser/standalone.js`; confirm `grep -c 'chunks/'` = 0.
4. Re-apply/verify P3–P11 (P9 → config `maxVisibleRequestBodyProperties: 0` on ≥ 1.76), then `prebuild.mjs` (re-anchor), regenerate `scalar-docs/`.
5. **Zero-regression gate:** for every service × env, compare rendered output old-bundle vs new-bundle (the generated `scalar-docs/*.json` for the same YAML, and DOM/example text for sampled routes: all pickers listed in P4–P6, `encounter_package`, `/decoded-payload` ops, observation demo). Specs themselves must be byte-identical (`git diff --stat portal/specs` empty).
6. Sandbox (`:8095`) first, then both repos in the same PR set; update the cache-bust hash everywhere (`reference.html`, `index.html`, `observation-oneof-demo.html`) per the rule below.
7. Update this file: build table, per-patch status, review log.

## Upstream review log

### 2026-10-25 — reviewed 1.63.0-base → 1.76.0 (not adopted)
- **Distance:** 13 minor releases, ~700 commits since our base. No security-only reason to move.
- **Collision map** (upstream commits touching files our patches edit, since `46802789`): `get-example-from-schema.ts` ≥12 commits (P3/P4/P5), `SchemaComposition.vue` + `partition-all-of-compositions.ts` rewritten in #10397 (207 files, P1/P2/P4/P5/P6), `ExampleResponse.vue` 7 commits (P6), `ParameterListItem.vue` 12 (P6), `client.ts` 12 (P7), `ApiReference.vue` 12+ (P7). **Every patched area was touched.**
- **Still-needed signals (checked in 1.76 source):** `MAX_LEVELS_DEEP = 10`; `Value.Check(OpenAPIDocumentSchemaStrict…)` in `client.ts`; `preloadDocumentsWhenIdle()` in `ApiReference.vue`; `requestBody`-only gating in `SchemaComposition.vue`; no `compositionSelection` in `ExampleResponse.vue`; `20_000` virtualization thresholds. → P3, P6, P7, P8 are **not** fixed upstream. P4/P5 **unknown** (area heavily changed — needs runtime test). P1/P2 obsolete after upgrade.
- **Main risks:** visual change of the attribute tree (new tree/rail layout default in 1.69, legacy layout removed, breaking), re-port of P6 into the new schema block, minified-anchor churn in `prebuild.mjs`.
- **Notable upstream gains:** perf (#10261 schema walks, non-reactive store, compact sparse document), response variant example selection (#10203), recursive-schema example fix (#10599), nested-`allOf` boundary fixes, `expandAllParameters`, `maxVisibleRequestBodyProperties`, `hideModelNames`, `showExtensions` allowlist, `urlRouting:false`, Copy-as-Markdown for operations, OpenAPI 3.2 support, multi-document selector filter. Mostly AsyncAPI work otherwise (irrelevant to us).
