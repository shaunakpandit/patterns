import test from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, rsi, atr, bollinger, macd, relativeVolume, pickRound, candidates, simulate, validTrade, WARMUP, VISIBLE } from './public/game.js'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
const bar = (o, h, l, c, v = 1) => ({ o, h, l, c, v })

test('sma and ema', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5])
  const values = ema([1, 2, 3, 4], 2)
  assert.deepEqual(values.slice(0, 2), [null, 1.5])
  close(values[2], 1.5 + (2 / 3) * 1.5)
})

test('rsi is 100 on only gains and 50 on symmetric moves', () => {
  assert.equal(rsi(Array.from({ length: 20 }, (_, index) => index)).at(-1), 100)
  close(rsi([1, 2, 1, 2, 1], 4)[4], 50)
  assert.equal(rsi([1, 2, 3], 14)[2], null)
})

test('atr uses true range including gaps', () => {
  const values = atr([bar(10, 11, 9, 10), bar(15, 16, 14, 15)], 2)
  close(values[1], (2 + 6) / 2)
})

test('bollinger, macd and relative volume shapes', () => {
  const flat = Array(30).fill(5)
  const bands = bollinger(flat)
  assert.equal(bands.upper[19], 5)
  assert.equal(bands.lower[18], null)
  const { line, signal, histogram } = macd(Array.from({ length: 40 }, (_, index) => index))
  assert.equal(line[24], null)
  assert.ok(line[25] > 0)
  assert.equal(signal[32], null)
  close(histogram[33], line[33] - signal[33])
  close(relativeVolume([1, 1, 4], 3)[2], 2)
})

const randomWalk = (length, seed = 1) => {
  let state = seed
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647
  return Array.from({ length }).reduce((bars) => {
    const previous = bars.at(-1)?.c ?? 100
    const next = previous * (1 + (random() - 0.5) * 0.04)
    return [...bars, bar(previous, Math.max(previous, next) * 1.005, Math.min(previous, next) * 0.995, next)]
  }, [])
}

test('rounds stay in bounds and balanced mode evens out labels', () => {
  const bars = randomWalk(3000)
  const random = (() => { let state = 7; return () => (state = (state * 16807) % 2147483647) / 2147483647 })()
  const draws = Array.from({ length: 3000 }, () => pickRound(bars, 'balanced', random))
  draws.forEach(({ start, decision, end }) => {
    assert.ok(start >= WARMUP && end < bars.length && end - start === VISIBLE - 1 && decision > start && decision < end)
  })
  const counts = Object.groupBy(draws, draw => draw.label)
  assert.equal(Object.keys(counts).length, 3)
  Object.values(counts).forEach(group => assert.ok(Math.abs(group.length / 3000 - 1 / 3) < 0.04, `${group.length}`))
  assert.ok(candidates(bars).list.length > 0)
})

test('simulate: take profit, stop loss, gaps, same-bar and end of window', () => {
  const path = [bar(100, 103, 99, 102), bar(102, 106, 101, 105)]
  assert.deepEqual(simulate(path, 'long', 100, 105, 95), { index: 1, price: 105, reason: 'take profit', profit: 5 })
  assert.equal(simulate(path, 'short', 100, 90, 104).reason, 'stop loss')
  assert.equal(simulate(path, 'short', 100, 90, 104).profit, -4)
  assert.equal(simulate([bar(94, 96, 93, 95)], 'long', 100, 110, 95).price, 94)
  assert.equal(simulate([bar(100, 111, 94, 100)], 'long', 100, 110, 95).reason, 'stop loss')
  assert.deepEqual(simulate(path, 'long', 100, 120, 80), { index: 1, price: 105, reason: 'end of window', profit: 5 })
  assert.ok(validTrade('long', 100, 105, 95) && validTrade('short', 100, 95, 105) && !validTrade('long', 100, 95, 105))
})
