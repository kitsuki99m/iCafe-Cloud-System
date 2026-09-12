// Shared low-time alert tone — distinct from AdminNotificationCenter's top-up
// chime so staff/customers can tell the two apart by ear. Roadmap §4 calls
// for "optional sound notifications for events such as low remaining time";
// this is that alert (Outstanding §3).
export function playLowTimeAlert() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    function beep(startOffset) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(659, ctx.currentTime + startOffset)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset)
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + startOffset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startOffset)
      osc.stop(ctx.currentTime + startOffset + 0.2)
    }

    beep(0)
    beep(0.22)
  } catch {
    // Audio unavailable (autoplay policy, unsupported browser) — fail silently.
  }
}
