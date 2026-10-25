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
| Vendored bundle version tag | `1.63.0-ehealth-maxdepth25-oneofidx-allofitem-respreactive-perf-reqbodyall` (= shipped tag + P9); `…-perf-copyvirt` = P8 on top of the previous tag, **not yet shipped** — merge order decides the final tag, re-tag when P8 lands |
| Upstream base | `scalar/scalar` `main` @ `46802789` (2026-07-29), i.e. between `@scalar/api-reference` 1.63.0 (2026-07-20) and 1.64.0 |
| Upstream latest at last review | `1.76.0` (2026-10-23) — reviewed 2026-10-25, **not adopted** (see [Upstream review log](#upstream-review-log)) |
| Bundle format | UMD `dist/browser/standalone.js`, self-contained (`grep -c 'chunks/'` must be `0`) |
| Built how | Source build for the base; patches P3–P9 are **hand edits of the minified output** (not source-level). |

> **Minified names (`Ib`, `TRe`, `Rb`, `y9`…) change on every rebuild.** The
> "Where" column gives the *source* location to re-find the code; the
> before→after snippets are what the old bundle looked like, for orientation only.

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
| P8 | Large request examples keep highlighting + copy button | local | bundle | UX (**unshipped**) |
| P9 | Request bodies always render all top-level attributes (no "Show additional properties") | local (= upstream config, 1.76) | bundle | config constant |

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

### P8 — large request examples (UNSHIPPED — only in a working tree)
- **Symptom:** request example > 20 000 chars (every `/decoded-payload` op) became unhighlighted plaintext with no copy button.
- **Where (source):** request-example card in `packages/components` / `api-reference` (`ScalarVirtualText` swap threshold).
- **Changes (bundle):** threshold `>2e4` → `>1e5`; the remaining virtual branch is wrapped in `div.group/code-block` and renders the stock `ScalarCodeCopy` (`LY` + backdrop `NY`) fed the FULL text.
- **Rebase notes:** in 1.76 `ExampleResponse.vue` and `ExampleSchema.vue` also carry `VIRTUALIZATION_THRESHOLD = 20_000` — the same limitation likely applies to large **responses** (we never patched those).
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
4. Re-apply/verify P3–P9 (P9 → config `maxVisibleRequestBodyProperties: 0` on ≥ 1.76), then `prebuild.mjs` (re-anchor), regenerate `scalar-docs/`.
5. **Zero-regression gate:** for every service × env, compare rendered output old-bundle vs new-bundle (the generated `scalar-docs/*.json` for the same YAML, and DOM/example text for sampled routes: all pickers listed in P4–P6, `encounter_package`, `/decoded-payload` ops, observation demo). Specs themselves must be byte-identical (`git diff --stat portal/specs` empty).
6. Sandbox (`:8095`) first, then both repos in the same PR set; bump version tag everywhere (`reference.html`, `index.html`, `observation-oneof-demo.html`).
7. Update this file: build table, per-patch status, review log.

## Upstream review log

### 2026-10-25 — reviewed 1.63.0-base → 1.76.0 (not adopted)
- **Distance:** 13 minor releases, ~700 commits since our base. No security-only reason to move.
- **Collision map** (upstream commits touching files our patches edit, since `46802789`): `get-example-from-schema.ts` ≥12 commits (P3/P4/P5), `SchemaComposition.vue` + `partition-all-of-compositions.ts` rewritten in #10397 (207 files, P1/P2/P4/P5/P6), `ExampleResponse.vue` 7 commits (P6), `ParameterListItem.vue` 12 (P6), `client.ts` 12 (P7), `ApiReference.vue` 12+ (P7). **Every patched area was touched.**
- **Still-needed signals (checked in 1.76 source):** `MAX_LEVELS_DEEP = 10`; `Value.Check(OpenAPIDocumentSchemaStrict…)` in `client.ts`; `preloadDocumentsWhenIdle()` in `ApiReference.vue`; `requestBody`-only gating in `SchemaComposition.vue`; no `compositionSelection` in `ExampleResponse.vue`; `20_000` virtualization thresholds. → P3, P6, P7, P8 are **not** fixed upstream. P4/P5 **unknown** (area heavily changed — needs runtime test). P1/P2 obsolete after upgrade.
- **Main risks:** visual change of the attribute tree (new tree/rail layout default in 1.69, legacy layout removed, breaking), re-port of P6 into the new schema block, minified-anchor churn in `prebuild.mjs`.
- **Notable upstream gains:** perf (#10261 schema walks, non-reactive store, compact sparse document), response variant example selection (#10203), recursive-schema example fix (#10599), nested-`allOf` boundary fixes, `expandAllParameters`, `maxVisibleRequestBodyProperties`, `hideModelNames`, `showExtensions` allowlist, `urlRouting:false`, Copy-as-Markdown for operations, OpenAPI 3.2 support, multi-document selector filter. Mostly AsyncAPI work otherwise (irrelevant to us).
