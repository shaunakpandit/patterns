export const WARMUP = 60
export const VISIBLE = 63
export const DECISION_OFFSETS = [17, 25]
// Tuned on SPY 1993–2026: makes "neither" about a third of all windows.
export const ATR_MULTIPLE = 2

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index)

export const sma = (values, period) => values.map((_, index) =>
  index < period - 1 ? null : values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period)

// Wilder-style smoothing: seed with the SMA, then blend each new value at `alpha`.
const smooth = (values, period, alpha) => {
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  // push instead of spread: this runs over the full ~8,000-bar history.
  return values.reduce((result, value, index) => (result.push(
    index < period - 1 ? null : index === period - 1 ? seed : result[index - 1] + alpha * (value - result[index - 1]),
  ), result), [])
}

export const ema = (values, period) => smooth(values, period, 2 / (period + 1))
const wilder = (values, period) => smooth(values, period, 1 / period)

export const rsi = (closes, period = 14) => {
  const changes = closes.map((close, index) => index === 0 ? 0 : close - closes[index - 1])
  const gains = wilder(changes.slice(1).map(change => Math.max(change, 0)), period)
  const losses = wilder(changes.slice(1).map(change => Math.max(-change, 0)), period)
  return [null, ...gains.map((gain, index) => gain === null ? null : losses[index] === 0 ? 100 : 100 - 100 / (1 + gain / losses[index]))]
}

export const atr = (bars, period = 14) => {
  const trueRanges = bars.map((bar, index) => index === 0
    ? bar.h - bar.l
    : Math.max(bar.h - bar.l, Math.abs(bar.h - bars[index - 1].c), Math.abs(bar.l - bars[index - 1].c)))
  return wilder(trueRanges, period)
}

export const bollinger = (closes, period = 20, deviations = 2) => {
  const middle = sma(closes, period)
  const width = middle.map((mean, index) => mean === null ? null
    : deviations * Math.sqrt(closes.slice(index - period + 1, index + 1).reduce((sum, close) => sum + (close - mean) ** 2, 0) / period))
  return {
    middle,
    upper: middle.map((mean, index) => mean === null ? null : mean + width[index]),
    lower: middle.map((mean, index) => mean === null ? null : mean - width[index]),
  }
}

export const macd = (closes, fast = 12, slow = 26, signalPeriod = 9) => {
  const fastLine = ema(closes, fast)
  const slowLine = ema(closes, slow)
  const line = closes.map((_, index) => slowLine[index] === null ? null : fastLine[index] - slowLine[index])
  const signalTail = ema(line.slice(slow - 1), signalPeriod)
  const signal = [...Array(slow - 1).fill(null), ...signalTail]
  return { line, signal, histogram: line.map((value, index) => signal[index] === null ? null : value - signal[index]) }
}

export const relativeVolume = (volumes, period = 20) =>
  sma(volumes, period).map((average, index) => average ? volumes[index] / average : null)

export const label = (bars, atrValues, decision, end) => {
  const move = bars[end].c - bars[decision].c
  const threshold = ATR_MULTIPLE * atrValues[decision]
  return move > threshold ? 'long' : move < -threshold ? 'short' : 'neither'
}

const candidateCache = new WeakMap()
export const candidates = bars => {
  if (!candidateCache.has(bars)) {
    const atrValues = atr(bars)
    const list = range(WARMUP, bars.length - VISIBLE).flatMap(start => range(...DECISION_OFFSETS).map(offset => {
      const decision = start + offset
      const end = start + VISIBLE - 1
      return { start, decision, end, label: label(bars, atrValues, decision, end) }
    }))
    candidateCache.set(bars, { list, groups: Object.values(Object.groupBy(list, candidate => candidate.label)) })
  }
  return candidateCache.get(bars)
}

const pick = (list, random) => list[Math.floor(random() * list.length)]

export const pickRound = (bars, mode, random = Math.random) => {
  const { list, groups } = candidates(bars)
  return mode === 'balanced' ? pick(pick(groups, random), random) : pick(list, random)
}

export const validTrade = (side, entry, takeProfit, stopLoss) =>
  side === 'long' ? stopLoss < entry && entry < takeProfit : takeProfit < entry && entry < stopLoss

// Daily bars can't tell which level was touched first, so when both are inside one bar the stop wins.
export const simulate = (bars, side, entry, takeProfit, stopLoss) => {
  const long = side === 'long'
  const beyond = (price, level) => long ? price <= level : price >= level
  const reaches = (price, level) => long ? price >= level : price <= level
  const exitAt = (index, price, reason) => ({ index, price, reason, profit: long ? price - entry : entry - price })
  for (const [index, bar] of bars.entries()) {
    const worst = long ? bar.l : bar.h
    const best = long ? bar.h : bar.l
    if (beyond(bar.o, stopLoss)) return exitAt(index, bar.o, 'stop loss (gap)')
    if (reaches(bar.o, takeProfit)) return exitAt(index, bar.o, 'take profit (gap)')
    if (beyond(worst, stopLoss)) return exitAt(index, stopLoss, 'stop loss')
    if (reaches(best, takeProfit)) return exitAt(index, takeProfit, 'take profit')
  }
  return exitAt(bars.length - 1, bars.at(-1).c, 'end of window')
}
