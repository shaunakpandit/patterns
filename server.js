import { createServer } from 'node:http'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join, extname, normalize } from 'node:path'

const port = process.env.PORT || 4200
const dataDirectory = process.env.DATA_DIR || './data'
const cacheFile = join(dataDirectory, 'spy.json')
const publicDirectory = new URL('./public/', import.meta.url).pathname
const day = 86_400_000
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

const fromYahoo = async () => {
  // Yahoo's chart API rejects requests without a browser-like User-Agent.
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`yahoo ${response.status}`)
  const result = (await response.json()).chart.result[0]
  const quote = result.indicators.quote[0]
  return result.timestamp.map((time, index) => ({
    t: time * 1000, o: quote.open[index], h: quote.high[index], l: quote.low[index], c: quote.close[index], v: quote.volume[index],
  }))
}

const fromPolygon = async () => {
  const key = process.env.POLYGON_API_KEY
  if (!key) throw new Error('no POLYGON_API_KEY')
  const to = new Date().toISOString().slice(0, 10)
  const response = await fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/1993-01-01/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`)
  if (!response.ok) throw new Error(`polygon ${response.status}`)
  return (await response.json()).results.map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v }))
}

const valid = bars => bars.filter(bar => [bar.o, bar.h, bar.l, bar.c, bar.v].every(Number.isFinite) && bar.h >= bar.l)

let cached = null
const loadBars = async () => {
  const fresh = cached && Date.now() - cached.time < day
  if (fresh) return cached.body
  const age = await stat(cacheFile).then(info => Date.now() - info.mtimeMs, () => Infinity)
  if (age < day) return (cached = { time: Date.now() - age, body: gzipSync(await readFile(cacheFile)) }).body
  for (const source of [fromYahoo, fromPolygon]) {
    try {
      const bars = valid(await source())
      if (bars.length < 500) throw new Error(`only ${bars.length} bars`)
      const json = JSON.stringify(bars)
      await mkdir(dataDirectory, { recursive: true })
      await writeFile(cacheFile, json)
      console.log(`fetched ${bars.length} bars via ${source.name}`)
      return (cached = { time: Date.now(), body: gzipSync(json) }).body
    } catch (error) {
      console.error(`${source.name} failed: ${error.message}`)
    }
  }
  // Serve stale data rather than nothing when every source is down.
  const stale = await readFile(cacheFile).catch(() => null)
  if (!stale) return null
  return (cached = { time: Date.now() - day + 3_600_000, body: gzipSync(stale) }).body
}

const staticCache = new Map()
const serveStatic = async path => {
  if (staticCache.has(path)) return staticCache.get(path)
  const file = normalize(join(publicDirectory, path === '/' ? 'index.html' : path))
  if (!file.startsWith(publicDirectory)) return null
  const body = await readFile(file).then(gzipSync, () => null)
  // Only cache hits, so requests for random paths can't grow the map.
  if (body) staticCache.set(path, body)
  return body
}

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  const body = path === '/api/bars' ? await loadBars() : await serveStatic(path)
  if (!body) return response.writeHead(path === '/api/bars' ? 503 : 404).end()
  response.writeHead(200, {
    'Content-Type': types[extname(path)] || (path === '/api/bars' ? 'application/json' : 'text/html'),
    'Content-Encoding': 'gzip',
    'Cache-Control': 'no-cache',
  }).end(body)
}).listen(port, () => console.log(`listening on :${port}`))
