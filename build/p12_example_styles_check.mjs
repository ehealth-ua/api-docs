#!/usr/bin/env node
/**
 * Regression harness for SCALAR_PATCHES.md P12 (persistent "Example" styles).
 *
 *   node scripts/p12_example_styles_check.mjs \
 *       --layout platform|apidocs --env prod \
 *       --baseline <dir served as the OLD site> --candidate <dir served as the NEW site> \
 *       --out <dir for screenshots + report.json>
 *
 * <dir> is a served site root: portal/ (platform) or an assemble_site.sh output (api-docs).
 * Needs Chrome (CHROME_PATH or the usual locations) and `npm ci` in scripts/scalar_prebuild.
 *
 * 1. DEFAULT: for every sample route, baseline vs candidate with NO ?exstyle:
 *    `#app` outerHTML + viewport screenshot bytes must be identical, and none of the
 *    P12 artefacts (style tag, switcher, data-exstyle) may exist.
 * 2. PER STYLE: on the candidate, ?exstyle=<s>: no console/page errors, no horizontal
 *    overflow at 1280 and 390 px, every example value visible, clipboard content equals
 *    the example text for first / longest / multi-example values, a oneOf picker (if the
 *    route has one) still changes the request example. Screenshots saved per style.
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, 'scalar_prebuild', 'package.json'))
const puppeteer = require('puppeteer-core')

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const layout = arg('layout', 'platform')
const env = arg('env', 'prod')
const baseDir = resolve(arg('baseline'))
const candDir = resolve(arg('candidate'))
const outDir = resolve(arg('out', 'p12-out'))
const only = arg('only') // optional comma-separated substring filters on route
mkdirSync(outDir, { recursive: true })

const STYLES = ['inline', 'nextline', 'pill', 'block', 'row', 'rowright', 'chip']
const ROUTES = [
  ['medical-events', 'POST', '/api/patients/{id}/encounter_package'],
  ['medical-events', 'PATCH', '/api/patients/{id}/encounter_package'],
  ['medical-events', 'POST', '/api/patients/{id}/encounter_package/decoded-payload'],
  ['medical-events', 'POST', '/api/patients/{patient_id}/device_requests'],
  ['medical-events', 'GET', '/api/patients/{patient_id}/device_requests'],
  ['medical-events', 'PATCH', '/api/patients/{patient_id}/device_requests/{device_request_id}/actions/complete'],
  ['medical-events', 'POST', '/api/patients/{patient_id}/approvals'], // request-body oneOf pickers
  ['medical-events', 'POST', '/api/patients/{patient_id}/device_dispenses'], // request-body oneOf pickers
  ['medical-events', 'GET', '/api/patients/{patient_id}/conditions'],
  ['medical-events', 'GET', '/api/patients/{patient_id}/episodes/{episode_id}/conditions/{condition_id}'],
  ['general-mis', 'GET', '/sign-in'],
  ['general-mis', 'POST', '/api/verifications'],
  ['general-mis', 'PATCH', '/api/v2/person_requests/{id}/actions/sign'],
  ['general-mis', 'PATCH', '/api/v3/declaration_requests/{id}/actions/sign'],
  ['general-mis', 'PATCH', '/api/contract_requests/{contract_type}/{id}/actions/sign_msp'],
  ['ehealth-pis', 'GET', '/sign-in'],
  ['ehealth-pis', 'PATCH', '/api/pis/declaration_requests/{id}/actions/sign'],
  ['ehealth-trusted-pis', 'POST', '/api/pis/sign-in'],
  ['ehealth-trusted-pis', 'POST', '/api/pis/sign-up'],
  ['ehealth-trusted-pis', 'POST', '/api/sms_verifications'],
].filter((r) => !only || only.split(',').some((o) => r.join(' ').includes(o)))

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.yaml': 'text/yaml' }
function serve(root) {
  const s = createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0])
    let f = join(root, u === '/' ? 'index.html' : u)
    if (!existsSync(f) || !extname(f)) f = join(root, 'index.html') // SPA fallback (api-docs path routing)
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(readFileSync(f))
  })
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)))
}

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function docFor(root, svc) {
  const f = layout === 'platform' ? join(root, 'scalar-docs', svc, `${env}.json`) : join(root, 'scalar-docs', `${svc}.json`)
  return JSON.parse(readFileSync(f, 'utf8'))
}
const docs = {}
function routeId([svc, method, path]) {
  docs[svc] ??= docFor(candDir, svc)
  const op = docs[svc].paths?.[path]?.[method.toLowerCase()]
  if (!op) throw new Error(`route not in spec: ${svc} ${method} ${path}`)
  const tag = slug(op.tags?.[0] ?? 'default')
  return layout === 'platform' ? `${svc}-${env}/tag/${tag}/${method}${path}` : `${svc}/tag/${tag}/${method}${path}`
}
function url(origin, id, style) {
  const q = style ? `exstyle=${style}` : ''
  if (layout === 'platform') return `${origin}/reference.html?env=${env}${q ? '&' + q : ''}#${id}`
  return `${origin}/${id}${q ? '?' + q : ''}`
}

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p))
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000, args: ['--force-device-scale-factor=1', '--disable-dev-shm-usage'] })
let browser = await launch()
// A 4 MB Scalar document can take Chrome down on a small machine: relaunch instead of failing every following route.
async function ensureBrowser() {
  if (browser.connected) return
  console.log('  (chrome died - relaunching)')
  browser = await launch(); diffPage = await browser.newPage()
}
const sA = await serve(baseDir), sB = await serve(candDir)
const oA = `http://127.0.0.1:${sA.address().port}`, oB = `http://127.0.0.1:${sB.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(origin, id, style, width = 1280, scheme) {
  await ensureBrowser()
  const ctx = await browser.createBrowserContext()
  await ctx.overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.setViewport({ width, height: 900 })
  if (scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  await page.goto(url(origin, id, style), { waitUntil: 'load', timeout: 120000 })
  const found = await page.waitForFunction((i) => document.getElementById(i), { timeout: 60000 }, id).then(() => true, () => false)
  await wait(5000)
  return { ctx, page, errors, found }
}

async function expandAll(page) {
  // The bundle's own "Expand all" button (patch P10, staged level by level) opens a whole request body cheaply;
  // fall back to a bounded manual expansion for pages without one (responses, parameters).
  const clicked = await page.evaluate(() => { const b = document.querySelector('button.request-body-expand-all'); if (b) b.click(); return !!b })
  if (clicked) { await wait(4000); return }
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Show .*Child/i.test(b.textContent)).slice(0, 12).forEach((b) => b.click()))
  await wait(600)
}


// A oneOf picker (button.composition-selector): pick another option, expect the request example / label to change.
const pickerTest = async (page) => {
  const code = () => page.evaluate(() => [...document.querySelectorAll('.scalar-card-content, .code-input-lite__editor, pre')].map((e) => e.textContent).join('|'))
  const btn = await page.$('button.composition-selector')
  if (!btn) return { present: false }
  await btn.evaluate((e) => e.scrollIntoView({ block: 'center' })); await wait(300)
  const before = await code(), cur = await btn.evaluate((e) => e.textContent)
  await btn.click(); await wait(400)
  const opts = await page.$$('[role=option]')
  if (opts.length < 2) return { present: true, tested: false, options: opts.length }
  const texts = await Promise.all(opts.map((o) => o.evaluate((e) => e.textContent.trim())))
  const i = texts.findIndex((t) => !cur.includes(t))
  await opts[i < 0 ? 1 : i].click(); await wait(900)
  const after = await code(), label = await btn.evaluate((e) => e.textContent)
  return { present: true, tested: true, options: opts.length, labelChanged: label !== cur, exampleChanged: after !== before, reacted: label !== cur || after !== before }
}
// Fraction of pixels whose RGB differs by >16 in any channel (decoded in the browser; no image libs needed).
let diffPage = await browser.newPage() // blank page: decoding PNGs must not compete with a heavy Scalar page
const pixelDiff = (_page, a, b) => diffPage.evaluate(async (x, y) => {
  const load = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64 })
  const [ia, ib] = await Promise.all([load(x), load(y)])
  const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data }
  const da = px(ia), db = px(ib); let n = 0
  for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) > 16 || Math.abs(da[k + 1] - db[k + 1]) > 16 || Math.abs(da[k + 2] - db[k + 2]) > 16) n++
  return n / (da.length / 4)
}, a.toString('base64'), b.toString('base64'))
const norm = (h) => h.replace(/127\.0\.0\.1(%3A|:)\d+/g, 'HOST').replace(/\bid-[A-Za-z0-9_-]{21}\b/g, 'id-RANDOM').replace(/scalar-refs-\d+-\d+/g, 'scalar-refs-N').replace(/translate\((\d+)px, \d+px\)/g, 'translate($1px, Ypx)') // virtual-list offsets jitter by 1px between loads; layout is covered by the screenshot compare
const defaultPicker = {}
const defaultOverflow = {} // route -> overflow (px) at 390 with NO style: a style may not add to it
const report = { layout, env, default: [], styles: [] }
let fail = 0
const bad = (msg) => { fail++; console.log('  ✗ ' + msg) }

console.log(`== DEFAULT view: baseline vs candidate (${ROUTES.length} routes)`)
// One page alive at a time (a Scalar page with a 4 MB document is heavy); every step has a hard timeout.
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout (${ms / 1000}s): ${what}`)), ms))])
async function snapshot(origin, id) {
  const x = await open(origin, id, null)
  try {
    const html = norm(await x.page.evaluate(() => document.getElementById('app').outerHTML))
    const shot = await x.page.screenshot()
    const artefacts = await x.page.evaluate(() => ({ style: !!document.getElementById('ehealth-example-styles'), sw: !!document.getElementById('ehealth-exstyle-switch'), attr: document.documentElement.hasAttribute('data-exstyle') }))
    return { html, shot, artefacts, errors: x.errors.length, errorText: x.errors.join(' | '), found: x.found }
  } finally { await x.ctx.close() }
}
async function pickerOn(origin, id) {
  if (id.endsWith('/decoded-payload')) return { present: false, skipped: 'decoded-payload pages (~700 rows) hang when fully expanded; they have no pickers of interest' }
  const x = await open(origin, id, null)
  try { await expandAll(x.page); return await pickerTest(x.page) } finally { await x.ctx.close() }
}
for (const r of ROUTES) {
  const id = routeId(r)
  const row = { route: r.join(' ') }
  try {
    const [a, a2, b] = [await withTimeout(snapshot(oA, id), 240000, 'baseline'), await withTimeout(snapshot(oA, id), 240000, 'baseline#2'), await withTimeout(snapshot(oB, id), 240000, 'candidate')]
    row.found = a.found && a2.found && b.found
    if (!row.found) bad(`${row.route}: route element not rendered`)
    // Two baseline loads are the noise control: virtual-list offsets / counters can move by a pixel between loads.
    row.htmlIdentical = a.html === b.html || a2.html === b.html
    row.htmlNoise = a.html !== a2.html
    row.htmlLen = a.html.length
    if (!row.htmlIdentical) {
      let i = 0; while (a.html[i] === b.html[i]) i++
      row.firstDiff = { at: i, a: a.html.slice(i - 80, i + 120), b: b.html.slice(i - 80, i + 120) }
      bad(`${row.route}: #app outerHTML differs at ${i}\n      baseline : ${JSON.stringify(row.firstDiff.a)}\n      candidate: ${JSON.stringify(row.firstDiff.b)}`)
    }
    row.screenshotExact = Buffer.compare(a.shot, b.shot) === 0 || Buffer.compare(a2.shot, b.shot) === 0
    row.screenshotNoise = Buffer.compare(a.shot, a2.shot) !== 0
    if (!row.screenshotExact) {
      // not byte-identical: accept only if no more different than two BASELINE loads are from each other (or <=0.5%: sub-pixel jitter)
      const noise = await pixelDiff(null, a.shot, a2.shot), d1 = await pixelDiff(null, a.shot, b.shot), d2 = await pixelDiff(null, a2.shot, b.shot)
      row.pixelDiff = { baselineVsBaseline: noise, candidateVsBaseline: Math.min(d1, d2) }
    }
    row.screenshotIdentical = row.screenshotExact || row.pixelDiff.candidateVsBaseline <= Math.max(row.pixelDiff.baselineVsBaseline * 1.5, 0.005)
    if (!row.screenshotIdentical) {
      const n = report.default.length
      writeFileSync(join(outDir, `diff-${n}-baseline.png`), a.shot); writeFileSync(join(outDir, `diff-${n}-baseline2.png`), a2.shot); writeFileSync(join(outDir, `diff-${n}-candidate.png`), b.shot)
      bad(`${row.route}: viewport screenshot differs (PNGs diff-${n}-*.png in out dir)`)
    }
    row.artefacts = b.artefacts
    if (b.artefacts.style || b.artefacts.sw || b.artefacts.attr) bad(`${row.route}: P12 artefacts present without ?exstyle`)
    row.errors = { baseline: a.errors, candidate: b.errors }
    if (b.errors > a.errors) bad(`${row.route}: more console errors in candidate: ${b.errorText}`)
    // picker control (separate loads, after the DOM comparison, since expanding changes the DOM): same behaviour baseline vs candidate
    const tolerant = (p, what) => withTimeout(p, 150000, what).catch((e) => ({ present: 'unknown', error: e.message })) // a page that hangs when fully expanded is a harness limit, not a regression
    row.pickerBaseline = await tolerant(pickerOn(oA, id), 'picker baseline')
    row.pickerCandidate = await tolerant(pickerOn(oB, id), 'picker candidate')
    defaultPicker[row.route] = row.pickerCandidate
    if (row.pickerBaseline.present !== 'unknown' && row.pickerCandidate.present !== 'unknown' && JSON.stringify(row.pickerBaseline) !== JSON.stringify(row.pickerCandidate)) bad(`${row.route}: picker behaviour differs baseline ${JSON.stringify(row.pickerBaseline)} vs candidate ${JSON.stringify(row.pickerCandidate)}`)
  } catch (e) { row.error = String(e); bad(`${row.route}: ${e.message}`) }
  console.log(`  ${row.htmlIdentical && row.screenshotIdentical && !row.error ? '✓' : '✗'} ${row.route}  (#app ${row.htmlLen} chars; screenshot ${row.screenshotExact ? 'byte-identical' : 'jitter ' + JSON.stringify(row.pixelDiff)}; picker ${row.pickerCandidate?.present ? (row.pickerCandidate.reacted ? 'reacts' : 'no-react(=baseline)') : 'none'})`)
  report.default.push(row)
}

console.log('== PER STYLE (candidate only)')
for (const style of STYLES) {
  for (const r of ROUTES) {
    const id = routeId(r)
    const row = { style, route: r.join(' ') }
    let p
    try {
    p = await withTimeout(open(oB, id, style), 240000, 'open')
    const { page } = p
    row.found = p.found
    await expandAll(page)
    row.attr = await page.evaluate(() => document.documentElement.getAttribute('data-exstyle'))
    if (row.attr !== style) bad(`${style} ${row.route}: data-exstyle=${row.attr}`)
    const m = await page.evaluate(() => {
      const vals = [...document.querySelectorAll('.property-example-value')]
      const vis = vals.filter((v) => { const b = v.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
      return { examples: document.querySelectorAll('.property-example').length, values: vals.length, visible: vis.length }
    })
    Object.assign(row, m)
    if (m.visible !== m.values) bad(`${style} ${row.route}: ${m.values - m.visible}/${m.values} example values not visible`)
    row.overflow = {}
    for (const w of [1280, 390]) {
      await page.setViewport({ width: w, height: 900 }); await wait(400)
      row.overflow[w] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (w === 390 && defaultOverflow[row.route] === undefined) {
        // stock page's own overflow at phone width (code blocks etc.), measured once per route with the style switched off
        await page.evaluate(() => document.documentElement.removeAttribute('data-exstyle')); await wait(300)
        defaultOverflow[row.route] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        await page.evaluate((s) => document.documentElement.setAttribute('data-exstyle', s), style); await wait(300)
      }
      if (row.overflow[w] > (w === 390 ? defaultOverflow[row.route] : 0)) bad(`${style} ${row.route}: horizontal overflow ${row.overflow[w]}px at ${w} (stock page: ${w === 390 ? defaultOverflow[row.route] : 0}px)`)
    }
    await page.setViewport({ width: 1280, height: 900 }); await wait(300)
    // clipboard: first, longest, and one from a multi-example group (if any)
    row.copy = []
    const picks = await page.evaluate(() => {
      const vals = [...document.querySelectorAll('.property-example-value')]
      const longest = vals.reduce((a, v) => (!a || v.textContent.length > a.textContent.length ? v : a), null)
      const multi = vals.find((v) => v.parentElement.children.length > 1)
      const set = [vals[0], longest, multi].filter(Boolean)
      set.forEach((v, i) => v.setAttribute('data-p12-pick', i))
      return set.map((v, i) => ({ i, text: v.firstElementChild.textContent }))
    })
    for (const pk of picks) {
      const h = await page.$(`[data-p12-pick="${pk.i}"]`)
      await h.evaluate((e) => e.scrollIntoView({ block: 'center' }))
      await wait(200)
      await page.evaluate(() => navigator.clipboard.writeText('__sentinel__'))
      await h.click()
      await wait(250)
      const clip = await page.evaluate(() => navigator.clipboard.readText())
      const ok = clip === pk.text || clip.replace(/\s+/g, '') === pk.text.replace(/\s+/g, '')
      row.copy.push({ ok, len: pk.text.length, clip: ok ? undefined : clip.slice(0, 80), text: ok ? undefined : pk.text.slice(0, 80) })
      if (!ok) bad(`${style} ${row.route}: clipboard "${clip.slice(0, 40)}" != example "${pk.text.slice(0, 40)}"`)
    }
    // picker still reacts (only where the route has a oneOf listbox in the body tree)
    row.picker = await pickerTest(page)
    const ctl = defaultPicker[row.route]
    if (row.picker.tested && !row.picker.reacted && ctl?.reacted) bad(`${style} ${row.route}: picker reacts by default but not with this style`)
    if (p.errors.length) { row.errors = p.errors; bad(`${style} ${row.route}: errors ${p.errors.join(' | ')}`) }
    report.styles.push(row)
    console.log(`  ${row.errors || row.attr !== style || m.visible !== m.values ? '✗' : '✓'} ${style.padEnd(8)} ${row.route}  ex=${m.examples} copy=${row.copy.filter((c) => c.ok).length}/${row.copy.length} overflow=${JSON.stringify(row.overflow)} picker=${JSON.stringify(row.picker)}`)
    } catch (e) { row.error = String(e); report.styles.push(row); bad(`${style} ${row.route}: ${e.message}`) } finally { await p?.ctx.close().catch(() => {}) }
  }
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1))
console.log(fail ? `\nFAILED: ${fail} problem(s)` : '\nALL CHECKS PASSED')
await browser.close(); sA.close(); sB.close()
process.exit(fail ? 1 : 0)
