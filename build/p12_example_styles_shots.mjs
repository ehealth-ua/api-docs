#!/usr/bin/env node
/**
 * Screenshots for the P12 review: every example style x light/dark (+ a 390px phone width),
 * of the request-body attribute list of one route, scrolled to its dense field block.
 *
 *   node scripts/p12_example_styles_shots.mjs --layout platform|apidocs --site <served dir> --out <dir> \
 *        [--route "medical-events POST /api/patients/{id}/encounter_package"] [--env prod]
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const puppeteer = createRequire(join(here, 'scalar_prebuild', 'package.json'))('puppeteer-core')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const layout = arg('layout', 'platform'), env = arg('env', 'prod')
const site = resolve(arg('site')), out = resolve(arg('out', 'p12-shots'))
const [svc, method, path] = arg('route', 'medical-events POST /api/patients/{id}/encounter_package').split(' ')
mkdirSync(out, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  let f = join(site, u === '/' ? 'index.html' : u)
  if (!existsSync(f) || !extname(f)) f = join(site, 'index.html')
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(f))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`

const doc = JSON.parse(readFileSync(layout === 'platform' ? join(site, 'scalar-docs', svc, `${env}.json`) : join(site, 'scalar-docs', `${svc}.json`), 'utf8'))
const tag = (doc.paths[path][method.toLowerCase()].tags?.[0] ?? 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const id = layout === 'platform' ? `${svc}-${env}/tag/${tag}/${method}${path}` : `${svc}/tag/${tag}/${method}${path}`
const url = (s) => layout === 'platform' ? `${origin}/reference.html?env=${env}${s ? '&exstyle=' + s : ''}#${id}` : `${origin}/${id}${s ? '?exstyle=' + s : ''}`

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p))
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (const scheme of ['light', 'dark']) {
  for (const [w, tagw] of [[1280, ''], [390, '-phone']]) {
    for (const style of [null, 'inline', 'nextline', 'pill', 'block', 'row', 'rowright', 'chip', 'chipsoft', 'chiptint']) {
      const page = await browser.newPage()
      await page.setViewport({ width: w, height: w === 390 ? 844 : 760 })
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
      await page.goto(url(style), { waitUntil: 'load' })
      await page.waitForFunction((i) => document.getElementById(i), { timeout: 60000 }, id)
      await wait(4000)
      // jump to the request-body block of the route and open the first child group so nested rows show too
      await page.evaluate(async (i) => {
        const w = (ms) => new Promise((r) => setTimeout(r, ms))
        const body = [...document.querySelectorAll(`[id^="${CSS.escape(i)}.body"]`)][0] ?? document.getElementById(i)
        body.scrollIntoView({ block: 'start' }); await w(500)
        const b = [...document.querySelectorAll('button')].find((x) => /Show .*Child/i.test(x.textContent) && x.getBoundingClientRect().top > 0)
        b?.click(); await w(800)
        body.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); await w(500)
      }, id)
      await page.screenshot({ path: join(out, `${style ?? 'default'}-${scheme}${tagw}.png`) })
      console.log('shot', style ?? 'default', scheme, w)
      await page.close()
    }
  }
}
await browser.close(); server.close()
