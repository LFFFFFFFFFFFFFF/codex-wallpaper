'use strict'

// Bounded, local, numeric telemetry. No pixels, paths, titles, properties,
// URLs or account data enter a report. Opening a wallpaper starts 90 seconds.
const DURATION = 90000
const counts = () => ({ received: 0, sent: 0, presented: 0, streamPresented:0, rejected: 0, replaced: 0, bytes: 0 })
const size = value => value ? { width: value.width, height: value.height } : null
class WallpaperDiagnostics {
  constructor(clock = () => Date.now()) { this.clock = clock; this.traces = new Map() }
  begin(p, restart = false) {
    let trace = this.traces.get(p.key)
    if (restart || !trace || trace.clientToken !== p.clientToken) {
      trace = { started: this.clock(), clientToken: p.clientToken, kind: p.captureScene ? 'scene' : 'web',
        counters: counts(), firstReceivedMs: null, firstPresentedMs: null, events: [], samples: [],
        lastSample: -1, previous: counts(), ackMaxMs: 0, drawMaxMs: 0, timings: {} }
      this.traces.delete(p.key); this.traces.set(p.key, trace)
      while (this.traces.size > 8) this.traces.delete(this.traces.keys().next().value)
    }
    p.diagnostics = trace
    delete trace.ended
    this.event(p, restart ? 'recording-started' : 'open')
    this.sample(p)
  }
  active(p) { return p.diagnostics && this.clock() - p.diagnostics.started <= DURATION }
  end(p) { if(p.diagnostics)p.diagnostics.ended=this.clock() }
  event(p, name) {
    if (!this.active(p)) return
    const t = p.diagnostics
    if (t.events.length < 256) t.events.push({ ms: this.clock() - t.started, generation: p.generation || 0, event: name })
  }
  count(p, name, amount = 1) {
    if (!this.active(p)) return
    const t = p.diagnostics
    if (Object.hasOwn(t.counters, name)) t.counters[name] += amount
    if (name === 'received' && t.firstReceivedMs === null) t.firstReceivedMs = this.clock() - t.started
    if (name === 'presented' && t.firstPresentedMs === null) { t.firstPresentedMs = this.clock() - t.started; this.event(p, 'first-presented') }
  }
  timing(p, name, ms) {
    if(!this.active(p)||!['capture','nativeWait','readback','rowCopy','pipeWrite','prepare','send','ack','draw','streamDraw'].includes(name)||!Number.isFinite(ms)||ms<0)return
    const value=Math.min(60000,ms),t=p.diagnostics.timings[name] ||= {count:0,totalMs:0,maxMs:0}
    t.count++;t.totalMs+=value;t.maxMs=Math.max(t.maxMs,value)
  }
  ack(p, payload, elapsed) {
    if (!this.active(p)) return
    const t = p.diagnostics
    t.ackMaxMs = Math.max(t.ackMaxMs, Math.max(0, elapsed))
    this.timing(p,'ack',elapsed);this.timing(p,'draw',payload.drawMs)
    if (Number.isFinite(payload.drawMs)) t.drawMaxMs = Math.max(t.drawMaxMs, Math.min(60000, Math.max(0, payload.drawMs)))
    this.count(p, payload.presented === true ? 'presented' : 'rejected')
    if (payload.presented !== true && ['geometry', 'generation', 'invalid'].includes(payload.reason)) this.event(p, 'discard-' + payload.reason)
  }
  sample(p) {
    if (!this.active(p)) return
    const t = p.diagnostics, ms = this.clock() - t.started, second = Math.floor(ms / 1000)
    if (second === t.lastSample || t.samples.length >= 91) return
    const delta = Object.fromEntries(Object.keys(t.counters).map(k => [k, t.counters[k] - t.previous[k]]))
    t.samples.push({ ms, intervalMs: t.samples.length ? ms - t.samples.at(-1).ms : 0,
      generation: p.generation || 0, phase: p.phase || 'loading', status: p.lastStatus || 'loading',
      paused: !!p.paused, hidden: !!(p.hostWindow && (!p.hostWindow.isVisible() || p.hostWindow.isMinimized())),
      resizePending: !!p.resizePending, quality:p.quality||null, display: p.bounds ? { ...size(p.bounds), scaleFactor: p.bounds.scaleFactor } : null,
      transport:p.streaming?'native-stream':'raw-frames', sourceFpsLimit:p.sourceFpsLimit??null, target: size(p.native || p.renderSize), frame: size(p.frameInfo), delta,
      ackMaxMs: t.ackMaxMs, drawMaxMs: Math.round(t.drawMaxMs * 100) / 100 })
    t.previous = { ...t.counters }; t.lastSample = second
  }
  snapshot(key, p) {
    const t = this.traces.get(key)
    if (!t) return null
    if (p) this.sample(p)
    const elapsedMs = Math.min(DURATION, Math.max(0, (t.ended ?? this.clock()) - t.started))
    return structuredClone({ format: 'skinforge-wallpaper-diagnostics-v1', durationLimitMs: DURATION, elapsedMs,
      complete: elapsedMs >= DURATION, stopped: t.ended !== undefined, kind: t.kind, firstReceivedMs: t.firstReceivedMs,
      firstPresentedMs: t.firstPresentedMs, counters: t.counters, events: t.events, samples: t.samples,
      timings: Object.fromEntries(Object.entries(t.timings).map(([name,v])=>[name,{count:v.count,meanMs:Math.round(v.totalMs/v.count*100)/100,maxMs:Math.round(v.maxMs*100)/100}])),
      notes: ['仅记录本窗口壁纸的尺寸、阶段与帧传递计数，不含画面、路径或账户数据。',
        'presented 表示画布已写入像素，不保证原引擎纹理已加载到最终清晰度。',
        'delta / intervalMs 可计算该区间帧率与原始像素吞吐；未测量 GPU 占用或主观画质。',
        'capture 为请求至原始像素收齐；nativeWait 为等待 WGC 帧；readback 为 GPU 回读；rowCopy 为行拷贝与释放；pipeWrite 为原始像素写出；prepare 为主进程准备像素；send 为发送调用耗时；ack 包含 send、跨进程传输和 draw，各项不能直接相加。'] })
  }
}
module.exports = { WallpaperDiagnostics, DURATION }
