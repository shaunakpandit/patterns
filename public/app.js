import { WARMUP, ATR_MULTIPLE, pickRound, sma, rsi, atr, bollinger, macd, relativeVolume, simulate, validTrade } from './game.js'

const { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, LineStyle } = LightweightCharts
const element = id => document.getElementById(id)
const colors = { text: '#c3c2b7', grid: '#262624', border: '#3a3a37', up: '#c3c2b7', down: '#e66767', good: '#3fb950', bad: '#e66767', neutral: '#8a8980' }

const INDICATORS = [
  { key: 'sma20', name: 'SMA 20', color: '#3987e5' },
  { key: 'sma50', name: 'SMA 50', color: '#d95926' },
  { key: 'bollinger', name: 'Bollinger', color: '#199e70' },
  { key: 'previous', name: 'Prev day H/L', color: colors.neutral },
  { key: 'volume', name: 'Rel. volume', color: colors.neutral },
  { key: 'rsi', name: 'RSI 14', color: '#9085e9' },
  { key: 'macd', name: 'MACD', color: '#3987e5' },
]
const colorOf = key => INDICATORS.find(indicator => indicator.key === key).color

const defaults = { mode: 'balanced', indicators: ['sma20', 'previous', 'volume', 'rsi'], rounds: 0, correct: 0, profit: 0 }
const settings = { ...defaults, ...JSON.parse(localStorage.getItem('patterns') || '{}') }
const save = () => localStorage.setItem('patterns', JSON.stringify(settings))

let bars, state, chart

const day = 86_400
const timeOf = index => (index + 1) * day
const indexOf = time => time / day - 1
const formatDate = milliseconds => new Date(milliseconds).toISOString().slice(0, 10)
const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`

const newRound = () => {
  const round = pickRound(bars, settings.mode)
  const scale = 100 / bars[round.decision].c
  const scaled = bars.slice(round.start - WARMUP, round.end + 1)
    .map(bar => ({ ...bar, o: bar.o * scale, h: bar.h * scale, l: bar.l * scale, c: bar.c * scale }))
  const closes = scaled.map(bar => bar.c)
  const decision = round.decision - round.start + WARMUP
  state = {
    round, scaled, decision, revealed: false, outcome: null,
    values: {
      sma20: sma(closes, 20), sma50: sma(closes, 50), bollinger: bollinger(closes), rsi: rsi(closes),
      macd: macd(closes), volume: relativeVolume(scaled.map(bar => bar.v)), atr: atr(scaled),
    },
  }
  element('trade').hidden = false
  element('result').hidden = true
  element('error').textContent = ''
  setDefaultLevels()
  render()
}

const side = () => element('trade').side.value

const setDefaultLevels = () => {
  const range = state.values.atr[state.decision]
  const direction = side() === 'short' ? -1 : 1
  element('takeProfit').value = (100 + direction * 2 * range).toFixed(2)
  element('stopLoss').value = (100 - direction * range).toFixed(2)
  const disabled = side() === 'none'
  element('takeProfit').disabled = disabled
  element('stopLoss').disabled = disabled
}

const levels = () => ({ takeProfit: element('takeProfit').valueAsNumber, stopLoss: element('stopLoss').valueAsNumber })

const render = () => {
  const { scaled, decision, revealed, values, outcome } = state
  const last = revealed ? scaled.length - 1 : decision
  const visible = scaled.slice(WARMUP, last + 1).map((bar, offset) => ({ bar, index: WARMUP + offset, time: timeOf(WARMUP + offset) }))
  const line = series => visible.map(({ index, time }) => series[index] === null ? { time } : { time, value: series[index] })
  const enabled = key => settings.indicators.includes(key)
  // Dates stay hidden until the reveal; before that the crosshair shows bars relative to the decision.
  const label = time => revealed ? formatDate(scaled[indexOf(time)].t) : `T${indexOf(time) - decision || ''}`

  chart?.remove()
  chart = createChart(element('chart'), {
    autoSize: true,
    layout: { background: { color: '#1a1a19' }, textColor: colors.text, panes: { separatorColor: colors.border } },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.border },
    timeScale: { borderColor: colors.border, tickMarkFormatter: time => revealed ? formatDate(scaled[indexOf(time)].t).slice(5) : '' },
    localization: { timeFormatter: label },
  })

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down, borderVisible: false,
  })
  candles.setData(visible.map(({ bar, time }) => ({ time, open: bar.o, high: bar.h, low: bar.l, close: bar.c })))
  const overlay = (series, color, style = LineStyle.Solid) =>
    chart.addSeries(LineSeries, { color, lineWidth: 2, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(line(series))
  if (enabled('sma20')) overlay(values.sma20, colorOf('sma20'))
  if (enabled('sma50')) overlay(values.sma50, colorOf('sma50'))
  if (enabled('bollinger')) [values.bollinger.upper, values.bollinger.lower].forEach(band => overlay(band, colorOf('bollinger'), LineStyle.Dashed))

  const priceLine = (price, title, color, lineStyle = LineStyle.Dashed) =>
    Number.isFinite(price) && candles.createPriceLine({ price, title, color, lineStyle, lineWidth: 1, axisLabelVisible: true })
  if (enabled('previous')) {
    priceLine(scaled[decision - 1].h, 'PDH', colors.neutral, LineStyle.Dotted)
    priceLine(scaled[decision - 1].l, 'PDL', colors.neutral, LineStyle.Dotted)
  }
  if (side() !== 'none') {
    const { takeProfit, stopLoss } = levels()
    priceLine(100, 'Entry', colors.text, LineStyle.Solid)
    priceLine(takeProfit, 'TP', colors.good)
    priceLine(stopLoss, 'SL', colors.bad)
  }
  if (revealed) {
    createSeriesMarkers(candles, [
      { time: timeOf(decision), position: 'belowBar', shape: 'arrowUp', color: colors.text, text: 'Decision' },
      ...outcome ? [{ time: timeOf(decision + 1 + outcome.index), position: 'aboveBar', shape: 'arrowDown', color: outcome.profit >= 0 ? colors.good : colors.bad, text: 'Exit' }] : [],
    ])
  }

  const panes = [
    enabled('volume') && (pane => {
      chart.addSeries(HistogramSeries, { color: colorOf('volume'), priceLineVisible: false, lastValueVisible: false }, pane).setData(line(values.volume))
    }),
    enabled('rsi') && (pane => {
      const rsiLine = chart.addSeries(LineSeries, { color: colorOf('rsi'), lineWidth: 2, priceLineVisible: false }, pane)
      rsiLine.setData(line(values.rsi))
      ;[70, 30].forEach(price => rsiLine.createPriceLine({ price, color: colors.border, lineStyle: LineStyle.Dashed, axisLabelVisible: false }))
    }),
    enabled('macd') && (pane => {
      chart.addSeries(HistogramSeries, { color: colors.neutral, priceLineVisible: false, lastValueVisible: false }, pane).setData(line(values.macd.histogram))
      chart.addSeries(LineSeries, { color: colorOf('sma20'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, pane).setData(line(values.macd.line))
      chart.addSeries(LineSeries, { color: colorOf('sma50'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, pane).setData(line(values.macd.signal))
    }),
  ].filter(Boolean)
  panes.forEach((draw, index) => draw(index + 1))
  chart.panes()[0].setStretchFactor(3)
  chart.timeScale().fitContent()

  const at = key => values[key][decision]
  element('readout').textContent = `At decision · ATR 14: ${at('atr').toFixed(2)} · RSI: ${at('rsi').toFixed(1)} · Rel. volume: ${at('volume').toFixed(2)}×`
  element('stats').textContent = settings.rounds
    ? `${settings.rounds} rounds · ${Math.round(100 * settings.correct / settings.rounds)}% correct · total P/L ${signed(settings.profit)}%`
    : 'Prices are rescaled so the decision bar closes at 100, so points = %.'
}

const reveal = event => {
  event.preventDefault()
  const choice = side()
  const { takeProfit, stopLoss } = levels()
  if (choice !== 'none' && !validTrade(choice, 100, takeProfit, stopLoss)) {
    element('error').textContent = choice === 'long' ? 'For a long: stop loss < 100 < take profit.' : 'For a short: take profit < 100 < stop loss.'
    return
  }
  const { scaled, decision, round } = state
  const outcome = choice === 'none' ? null : simulate(scaled.slice(decision + 1), choice, 100, takeProfit, stopLoss)
  const correct = (choice === 'none' ? 'neither' : choice) === round.label
  Object.assign(state, { revealed: true, outcome })
  Object.assign(settings, { rounds: settings.rounds + 1, correct: settings.correct + correct, profit: settings.profit + (outcome?.profit ?? 0) })
  save()

  const move = scaled.at(-1).c - 100
  const threshold = ATR_MULTIPLE * state.values.atr[decision]
  element('summary').innerHTML = `
    <p class="${correct ? 'good' : 'bad'}"><strong>${correct ? '✓ Correct' : '✗ Wrong'}</strong>: the answer was <strong>${round.label}</strong></p>
    <p>Move to the last bar: ${signed(move)} (needed ±${threshold.toFixed(2)}, ${ATR_MULTIPLE}× ATR)</p>
    <p>${outcome
      ? `${choice === 'long' ? 'Long' : 'Short'}: ${outcome.reason} after ${outcome.index + 1} bars at ${outcome.price.toFixed(2)} → <strong class="${outcome.profit >= 0 ? 'good' : 'bad'}">${signed(outcome.profit)}%</strong>`
      : 'No trade taken.'}</p>
    <p class="muted">SPY ${formatDate(bars[round.start].t)} → ${formatDate(bars[round.end].t)} · real entry $${bars[round.decision].c.toFixed(2)}</p>`
  element('trade').hidden = true
  element('result').hidden = false
  render()
  element('next').focus()
}

element('indicators').append(...INDICATORS.map(({ key, name, color }) => {
  const label = document.createElement('label')
  label.innerHTML = `<input type="checkbox" value="${key}" ${settings.indicators.includes(key) ? 'checked' : ''}><span class="swatch" style="background:${color}"></span>${name}`
  return label
}))
element('indicators').addEventListener('change', () => {
  settings.indicators = [...element('indicators').querySelectorAll('input:checked')].map(input => input.value)
  save()
  render()
})
element('mode').value = settings.mode
element('mode').addEventListener('change', event => { settings.mode = event.target.value; save() })
element('trade').addEventListener('change', event => { if (event.target.name === 'side') setDefaultLevels(); render() })
element('trade').addEventListener('input', render)
element('trade').addEventListener('submit', reveal)
element('next').addEventListener('click', newRound)

try {
  const response = await fetch('/api/bars')
  if (!response.ok) throw new Error(`server returned ${response.status}`)
  bars = await response.json()
  newRound()
} catch (error) {
  element('readout').textContent = `Could not load SPY data: ${error.message}`
}
