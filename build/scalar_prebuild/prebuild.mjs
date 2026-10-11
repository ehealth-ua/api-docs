#!/usr/bin/env node
/**
 * prebuild.mjs — ship specs to Scalar already in its own processed form.
 *
 *   node scripts/scalar_prebuild/prebuild.mjs <site-root> <page> [<page> ...]
 *   node scripts/scalar_prebuild/prebuild.mjs --check <site-root>
 *
 *   e.g.  prebuild.mjs portal 'reference.html?env=prod' 'reference.html?env=stage' ...
 *         prebuild.mjs ../api-docs index.html
 *
 * WHY. Loading a multi-MB spec, Scalar's client store runs (measured on
 * medical-events prod, fast Mac, 1x CPU): YAML parse 1.3 s, bundle 0.2 s,
 * coerceValue 1.4 s, mergeObjects 0.2 s, then builds the sidebar navigation.
 * All of that is skipped when the document already carries
 * `x-scalar-navigation` — the path Scalar itself uses for documents
 * preprocessed by its server-side store (see workspace-store `client.ts`,
 * "If the document navigation is not already present, bundle ..."). This
 * script produces exactly such documents, so the page loads JSON that needs
 * no bundling/coercion at all. Target visible 5.7 s -> 2.4 s at 1x, ~40 s ->
 * ~7.5 s at 4x CPU throttle (together with bundle patch #7, see
 * SCALAR_FORK_TRACKING.md).
 *
 * HOW. Rather than re-implementing Scalar's pipeline (or running a different
 * code path such as the chunked server store), the page itself is loaded in
 * headless Chrome with the site's OWN vendored bundle, and each processed
 * document is captured right before the store stores it. So the output is,
 * by construction, what that bundle computes from the YAML under that page's
 * config. The page's `sources` must point at `scalar-docs/<X>.json`; while
 * generating, those requests are answered with `specs/<X>.yaml` instead.
 *
 * Two in-memory edits are made to the bundle while generating (never written
 * to disk): a capture hook, and re-enabling the idle preload of non-active
 * sources that patch #7 removed (so one page load processes every source).
 * Both anchors are asserted to match exactly once — a rebuilt bundle whose
 * minified names moved fails loudly here instead of producing junk.
 *
 * VERIFY (always runs). After writing, every page is loaded again serving the
 * generated JSON, and the store's document is compared to the one generated
 * from YAML — byte-identical after JSON.stringify, key order included, except
 * the two keys Scalar derives from the fetched file itself
 * (`x-scalar-original-document-hash`, `x-scalar-original-source-url`).
 *
 * STALENESS. The navigation depends on the YAML, the bundle, and the page's
 * Scalar config (slug, sort options). `scalar-docs/manifest.json` records the
 * SHA-256 of all three per document; `--check` recomputes them (no browser
 * needed) and exits 1 if anything is stale. deploy.sh runs it before pushing.
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'

const GENERATOR_VERSION = 1
const BUNDLE = 'assets/scalar.standalone.js'
const OUT_DIR = 'scalar-docs'
const DERIVED_KEYS = ['x-scalar-original-document-hash', 'x-scalar-original-source-url']
const PAGE_TIMEOUT_MS = 10 * 60 * 1000

// [anchor in the vendored bundle, replacement] — applied in memory only.
const GENERATION_PATCHES = [
  // Capture hook: the processed document, right before the store keeps it.
  [
    'o.documents[u]=Df(yf(mf(m)),{overrides:Of(l[u])})}',
    'window.__scalarPrebuild&&window.__scalarPrebuild(u,JSON.stringify(mf(m)));o.documents[u]=Df(yf(mf(m)),{overrides:Of(l[u])})}',
  ],
  // Undo patch #7's preload removal, so every source gets processed.
  ['c.value?void 0:l.value))});let Ce=', 'c.value?void 0:l.value)),xe()});let Ce='],
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const pageFile = (page) => page.split('?')[0].split('#')[0]
const jsonToYaml = (url) => {
  const m = /^scalar-docs\/(.+)\.json$/.exec(url)
  if (!m) throw new Error(`source url ${url} is not scalar-docs/<X>.json`)
  return `specs/${m[1]}.yaml`
}

function patchedBundle(root) {
  let s = readFileSync(join(root, BUNDLE), 'utf8')
  for (const [anchor, repl] of GENERATION_PATCHES) {
    const n = s.split(anchor).length - 1
    if (n !== 1) throw new Error(`bundle anchor found ${n}x (want 1) — bundle rebuilt? ${anchor}`)
    s = s.replace(anchor, repl)
  }
  return s
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.yaml': 'text/yaml', '.css': 'text/css', '.woff2': 'font/woff2' }

function serve(root, { yamlForJson, bundle }) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
    let file = resolve(root, url || 'index.html')
    if (!file.startsWith(resolve(root))) return res.writeHead(403).end()
    if (url === BUNDLE) return res.writeHead(200, { 'content-type': MIME['.js'] }).end(bundle)
    if (yamlForJson && url.startsWith(`${OUT_DIR}/`)) file = join(root, jsonToYaml(url))
    if (!existsSync(file)) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const hit = candidates.find((p) => p && existsSync(p))
  if (!hit) throw new Error('Chrome not found — set CHROME_PATH')
  return hit
}

/** Loads `page`, returns { slug: processedDocJson } for every source it declares. */
async function capture(browser, origin, page) {
  const tab = await browser.newPage()
  try {
    await tab.setRequestInterception(true)
    tab.on('request', (r) => (r.url().startsWith(origin) || r.url().startsWith('data:') ? r.continue() : r.abort()))
    await tab.evaluateOnNewDocument(() => {
      window.__captured = {}
      window.__scalarPrebuild = (name, json) => (window.__captured[name] = json)
    })
    await tab.goto(`${origin}/${page}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
    const sources = await tab.evaluate(() => sources.map((s) => ({ slug: s.slug, url: s.url })))
    await tab.waitForFunction((n) => Object.keys(window.__captured).length >= n, { timeout: PAGE_TIMEOUT_MS, polling: 250 }, sources.length)
    const out = {}
    for (const s of sources) {
      const json = await tab.evaluate((k) => window.__captured[k], s.slug)
      if (!json) throw new Error(`${page}: source ${s.slug} was not captured`)
      out[s.slug] = { url: s.url, json }
    }
    return out
  } finally {
    await tab.close()
  }
}

const withoutDerived = (json) => {
  const d = JSON.parse(json)
  for (const k of DERIVED_KEYS) delete d[k]
  return JSON.stringify(d)
}

function expectedManifestEntries(root, manifest) {
  const bundleSha = sha256(readFileSync(join(root, BUNDLE)))
  const problems = []
  if (manifest.generator !== GENERATOR_VERSION) problems.push(`generator version ${manifest.generator} != ${GENERATOR_VERSION}`)
  if (manifest.bundle_sha256 !== bundleSha) problems.push(`${BUNDLE} changed since generation`)
  for (const [out, e] of Object.entries(manifest.documents)) {
    if (!existsSync(join(root, out))) problems.push(`${out} missing`)
    if (!existsSync(join(root, e.source)) || sha256(readFileSync(join(root, e.source))) !== e.source_sha256) problems.push(`${e.source} changed since ${out} was generated`)
    if (sha256(readFileSync(join(root, pageFile(e.page)))) !== e.page_sha256) problems.push(`${pageFile(e.page)} changed since ${out} was generated`)
  }
  return problems
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--check') {
    const root = args[1]
    const mf = join(root, OUT_DIR, 'manifest.json')
    if (!existsSync(mf)) {
      console.error(`✗ ${mf} missing — run prebuild.mjs`)
      process.exit(1)
    }
    const problems = expectedManifestEntries(root, JSON.parse(readFileSync(mf, 'utf8')))
    if (problems.length) {
      console.error(`✗ Scalar prebuilt docs are STALE (${root}):\n  - ${problems.join('\n  - ')}\n  re-run scripts/scalar_prebuild/prebuild.mjs`)
      process.exit(1)
    }
    console.log(`✓ Scalar prebuilt docs up to date (${root})`)
    return
  }
  const [root, ...pages] = args
  if (!root || pages.length === 0) {
    console.error('usage: prebuild.mjs <site-root> <page> [<page> ...] | --check <site-root>')
    process.exit(2)
  }
  const { default: puppeteer } = await import('puppeteer-core')
  const bundle = patchedBundle(root)
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true })
  const manifest = { generator: GENERATOR_VERSION, bundle_sha256: sha256(readFileSync(join(root, BUNDLE))), documents: {} }
  const generated = {}
  try {
    // 1. Generate: pages read the YAML (served under the JSON urls).
    let server = await serve(root, { yamlForJson: true, bundle })
    let origin = `http://127.0.0.1:${server.address().port}`
    for (const page of pages) {
      const t0 = Date.now()
      const docs = await capture(browser, origin, page)
      for (const [slug, { url, json }] of Object.entries(docs)) {
        const source = jsonToYaml(url)
        mkdirSync(dirname(join(root, url)), { recursive: true })
        writeFileSync(join(root, url), json + '\n')
        generated[`${page} ${slug}`] = json
        manifest.documents[url] = {
          page,
          slug,
          source,
          source_sha256: sha256(readFileSync(join(root, source))),
          page_sha256: sha256(readFileSync(join(root, pageFile(page)))),
        }
        console.log(`  ${url}  <- ${source}  (${(json.length / 1e6).toFixed(1)} MB)`)
      }
      console.log(`✓ generated ${page} in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }
    server.close()

    // 2. Verify: pages read the generated JSON; the store must hold the same document.
    server = await serve(root, { yamlForJson: false, bundle })
    origin = `http://127.0.0.1:${server.address().port}`
    let bad = 0
    for (const page of pages) {
      const docs = await capture(browser, origin, page)
      for (const [slug, { json }] of Object.entries(docs)) {
        if (withoutDerived(json) !== withoutDerived(generated[`${page} ${slug}`])) {
          console.error(`✗ VERIFY FAILED: ${page} ${slug} — store document differs when loaded from JSON`)
          bad++
        }
      }
    }
    server.close()
    if (bad) process.exit(1)
    console.log(`✓ verified: store documents identical from YAML and from prebuilt JSON (${Object.keys(generated).length} docs)`)
  } finally {
    await browser.close()
  }
  const manifestPath = join(root, OUT_DIR, 'manifest.json')
  // Keep entries for pages not regenerated in this run (e.g. one env only).
  if (existsSync(manifestPath)) {
    const old = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (old.bundle_sha256 === manifest.bundle_sha256 && old.generator === GENERATOR_VERSION) {
      for (const [k, v] of Object.entries(old.documents)) if (!pages.includes(v.page)) manifest.documents[k] = v
    }
  }
  manifest.documents = Object.fromEntries(Object.entries(manifest.documents).sort())
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ wrote ${manifestPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
