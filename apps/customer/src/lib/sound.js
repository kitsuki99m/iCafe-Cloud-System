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

// Kept intentionally light: browser autoplay rules can reject it until a
// customer has interacted with the station, in which case the toast remains.
export function playBroadcastChime() {
  try {
    const Ctx=window.AudioContext||window.webkitAudioContext
    if(!Ctx) return
    const ctx=new Ctx()
    for(let second=0;second<5;second+=1){
      const osc=ctx.createOscillator(), gain=ctx.createGain(), start=ctx.currentTime+second
      osc.type='sine';osc.frequency.setValueAtTime(second%2?784:659,start)
      gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.035,start+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.22)
      osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+0.25)
    }
  } catch { /* optional audio only */ }
}


const sessionWarningAudio = {
  5: new Audio(new URL('../assets/session-5-minutes-left.mp3', import.meta.url)),
  1: new Audio(new URL('../assets/session-1-minute-left.mp3', import.meta.url)),
}
Object.values(sessionWarningAudio).forEach((audio) => { audio.preload = 'auto' })

// Offline, deterministic session-warning voice assets. These are bundled into
// the customer renderer so every station uses the same voice without relying
// on Windows speech voices or an internet/AI service at runtime.
export function playSessionWarningVoice(minutes) {
  try {
    const key = Number(minutes) === 1 ? 1 : 5
    const audio = sessionWarningAudio[key]
    if (!audio) return false
    audio.pause()
    audio.currentTime = 0
    const playResult = audio.play()
    if (playResult?.catch) playResult.catch(() => {})
    return true
  } catch {
    return false
  }
}

export function playFinalSecondPing(second) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const frequency = second <= 1 ? 1046 : second === 2 ? 880 : 740
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
  } catch {}
}
