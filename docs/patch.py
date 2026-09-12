from pathlib import Path
root=Path('/mnt/data/work/batch')
# 1 birthday overview current month
p=root/'backend/src/routes/apiRoutes.js'
s=p.read_text()
old='''    const birthdays = db\n      .prepare(\n        "SELECT id,username,name,birthdate FROM members WHERE status=\'active\' AND birthdate IS NOT NULL ORDER BY strftime(\'%m-%d\',birthdate) LIMIT 6",\n      )\n      .all();'''
new='''    const birthdays = db\n      .prepare(\n        "SELECT id,username,name,birthdate FROM members WHERE status=\\'active\\' AND birthdate IS NOT NULL AND strftime(\\'%m\\',birthdate)=strftime(\\'%m\\',?) ORDER BY CASE WHEN strftime(\\'%m-%d\\',birthdate)=strftime(\\'%m-%d\\',?) THEN 0 ELSE 1 END, strftime(\\'%d\\',birthdate), name LIMIT 31",\n      )\n      .all(overviewNow, overviewNow);'''
if old not in s: print('birthday query not found')
else: s=s.replace(old,new)
p.write_text(s)

# 2 customer sound utilities
p=root/'apps/customer/src/lib/sound.js'; s=p.read_text()
s += '''\n\nexport function playSessionWarningVoice(minutes) {\n  try {\n    const text = Number(minutes) === 1\n      ? '1 minute left for your session.'\n      : '5 minutes left for your session.'\n    if (!('speechSynthesis' in window)) return false\n    window.speechSynthesis.cancel()\n    const utterance = new SpeechSynthesisUtterance(text)\n    utterance.rate = 0.92\n    utterance.pitch = 1\n    utterance.volume = 1\n    const voices = window.speechSynthesis.getVoices() || []\n    const preferred = voices.find((voice) => /en[-_](US|GB|PH)/i.test(voice.lang)) || voices.find((voice) => /^en/i.test(voice.lang))\n    if (preferred) utterance.voice = preferred\n    window.speechSynthesis.speak(utterance)\n    return true\n  } catch { return false }\n}\n\nexport function playFinalSecondPing(second) {\n  try {\n    const Ctx = window.AudioContext || window.webkitAudioContext\n    if (!Ctx) return\n    const ctx = new Ctx()\n    const osc = ctx.createOscillator()\n    const gain = ctx.createGain()\n    const frequency = second <= 1 ? 1046 : second === 2 ? 880 : 740\n    osc.type = 'sine'\n    osc.frequency.setValueAtTime(frequency, ctx.currentTime)\n    gain.gain.setValueAtTime(0.0001, ctx.currentTime)\n    gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.015)\n    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)\n    osc.connect(gain); gain.connect(ctx.destination)\n    osc.start(); osc.stop(ctx.currentTime + 0.18)\n  } catch {}\n}\n'''
p.write_text(s)

# 3 Customer session warnings + birthday announcement + guest expiry
p=root/'apps/customer/src/pages/CustomerSessionView.jsx'; s=p.read_text()
s=s.replace('import { playLowTimeAlert } from "../lib/sound.js"','import { playLowTimeAlert, playSessionWarningVoice, playFinalSecondPing } from "../lib/sound.js"')
s=s.replace('''  const visible = (announcements || [])\n    .filter((item) => item.isActive !== false)\n    .slice(0, 4);''','''  const visible = (announcements || [])\n    .filter((item) => item.isActive !== false);''')
# Add birthday system item before visible
s=s.replace('''function AnnouncementBox({ announcements, onFeedback }) {\n  const visible = (announcements || [])''','''function AnnouncementBox({ announcements, onFeedback, birthdayAnnouncement = null }) {\n  const visible = [\n    ...(birthdayAnnouncement ? [birthdayAnnouncement] : []),\n    ...(announcements || []),\n  ]\n    .filter((item) => item.isActive !== false);''')
s=s.replace('''  const alertedSessionKey = useRef(null);\n  const endedSessionKey = useRef(null);''','''  const alertedSessionKey = useRef(null);\n  const warning5Key = useRef(null);\n  const warning1Key = useRef(null);\n  const finalPingKey = useRef(null);\n  const endedSessionKey = useRef(null);''')
# Replace old lowTime alert effect with richer effect
old='''  useEffect(() => {\n    if (!hasActiveSession || session.billing !== "prepaid") return;\n    const sessionKey = `${pc.id}-${session.startedAt}`;\n    if (lowTime) {\n      if (alertedSessionKey.current !== sessionKey) {\n        playLowTimeAlert();\n        alertedSessionKey.current = sessionKey;\n      }\n    } else if (alertedSessionKey.current === sessionKey) {\n      alertedSessionKey.current = null;\n    }\n  }, [lowTime, hasActiveSession, session?.billing, session?.startedAt, pc?.id]);'''
new='''  useEffect(() => {\n    if (!hasActiveSession || session.billing !== "prepaid") return;\n    const sessionKey = `${pc?.id || "pc"}-${session?.id || session?.startedAt || "session"}`;\n    if (remainingSeconds == null || remainingSeconds <= 0) return;\n    if (remainingSeconds <= 5 && finalPingKey.current !== sessionKey) {\n      finalPingKey.current = sessionKey;\n      playFinalSecondPing(remainingSeconds);\n      return;\n    }\n    if (remainingSeconds > 5) finalPingKey.current = null;\n    if (remainingSeconds === 300 && warning5Key.current !== sessionKey) {\n      warning5Key.current = sessionKey;\n      playSessionWarningVoice(5);\n    }\n    if (remainingSeconds === 60 && warning1Key.current !== sessionKey) {\n      warning1Key.current = sessionKey;\n      playSessionWarningVoice(1);\n    }\n    if (lowTime && alertedSessionKey.current !== sessionKey) {\n      alertedSessionKey.current = sessionKey;\n      playLowTimeAlert();\n    }\n  }, [remainingSeconds, lowTime, hasActiveSession, session?.billing, session?.id, session?.startedAt, pc?.id]);'''
if old not in s: print('warning effect not found')
else: s=s.replace(old,new)
# expiry behavior
old='''    endedSessionKey.current = key;\n    endSession(pc).finally(() => window.aezakmiClient?.lockClient?.());'''
new='''    endedSessionKey.current = key;\n    endSession(pc).finally(async () => {\n      window.aezakmiClient?.lockClient?.();\n      if (isGuest) await logout();\n    });'''
s=s.replace(old,new)
# birthday announcement and pass
marker='''  const memberRecord = !isGuest\n    ? members.find((m) => String(m.id) === String(user.memberId))\n    : null;'''
insert=marker+'''\n  const birthdayToday = Boolean(memberRecord?.birthdate) && (() => {\n    const d = new Date(`${String(memberRecord.birthdate).slice(0, 10)}T00:00:00`)\n    const nowDate = new Date()\n    return !Number.isNaN(d.getTime()) && d.getMonth() === nowDate.getMonth() && d.getDate() === nowDate.getDate()\n  })();\n  const birthdayAnnouncement = birthdayToday ? {\n    id: `birthday-${memberRecord.id}-${new Date().getFullYear()}`,\n    kind: 'Birthday',\n    title: `🎂 Happy Birthday, ${memberRecord.name || user?.username || 'Customer'}!`,\n    message: 'Your birthday promo is available today. Ask the counter about your birthday rate.',\n    createdAt: new Date().toISOString(),\n    isActive: true,\n  } : null;'''
s=s.replace(marker,insert)
s=s.replace('<AnnouncementBox announcements={announcements} onFeedback={openFeedback} />','<AnnouncementBox announcements={announcements} birthdayAnnouncement={birthdayAnnouncement} onFeedback={openFeedback} />')
p.write_text(s)

# 4 regular rate visible all tiers + presets in extend
p=root/'apps/customer/src/components/customer/ExtendSessionModal.jsx'; s=p.read_text()
s=s.replace('''          if (planTier === "Regular") return memberTier === "Regular";''','''          if (planTier === "Regular") return true;''')
# replace presets declaration and display with derived time labels
s=s.replace('const PRESETS = [50, 100, 200];','const PRESETS = [50, 100, 200];\nconst TIME_PRESETS = [30, 60, 120];')
old='''              <div className="grid grid-cols-3 gap-2">\n                {PRESETS.map((p) => ('''
new='''              <div className="grid grid-cols-3 gap-2">\n                {PRESETS.map((p) => ('''
s=s.replace(old,new)
# add time preset row before NumericInput
needle='''              <NumericInput\n                min={minimum}'''
replacement='''              <div className="mt-2 grid grid-cols-3 gap-2">\n                {TIME_PRESETS.map((mins) => {\n                  const planMinutes = minutesForAmount(effectivePlan, mins);\n                  return (\n                    <button key={mins} type="button" onClick={() => {\n                      const amountForPreset = effectivePlan?.mode === "linear" && Number(effectivePlan.minutesPerUnit) > 0\n                        ? Math.ceil(mins / Number(effectivePlan.minutesPerUnit)) * Number(effectivePlan.pesoUnit || 0)\n                        : 0;\n                      if (amountForPreset > 0) { setPreset(amountForPreset); setCustomAmount(""); }\n                    }} disabled={planMinutes <= 0 || effectivePlan?.mode !== "linear"}\n                      className="rounded-lg border border-surface-line px-2 py-2 text-[11px] font-medium text-slate-soft hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40">\n                      +{formatDuration(mins)}\n                    </button>\n                  );\n                })}\n              </div>\n              <NumericInput\n                min={minimum}'''
if needle not in s: print('preset insertion needle missing')
else: s=s.replace(needle,replacement)
p.write_text(s)

# 5 customer tray icon use PNG copied later
p=root/'apps/customer/electron/main.cjs'; s=p.read_text()
s=s.replace("const iconPath = path.join(__dirname, 'tray-icon.svg')","const iconPath = path.join(__dirname, 'tray-icon-32.png')")
s=s.replace("icon:path.join(__dirname,'tray-icon.svg'),","icon:path.join(__dirname,'tray-icon-32.png'),")
p.write_text(s)

# 6 logo warning modal in SettingsPage
p=root/'apps/admin/src/pages/SettingsPage.jsx'; s=p.read_text()
s=s.replace("import Button from '../components/common/Button.jsx'","import Button from '../components/common/Button.jsx'\nimport Modal from '../components/common/Modal.jsx'") if "import Modal" not in s else s
# add state
s=s.replace("  const [pendingLogoDataUrl,setPendingLogoDataUrl]=useState('')","  const [pendingLogoDataUrl,setPendingLogoDataUrl]=useState('')\n  const [logoWarning,setLogoWarning]=useState('')")
old="""  async function selectLogo(file){if(!file)return;if(!['image/png','image/svg+xml'].includes(file.type)||file.size>512*1024)return;setSaving('logo');try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});setPendingLogoDataUrl(dataUrl);setLogoUrl(dataUrl)}finally{setSaving('')}}"""
new="""  async function selectLogo(file){\n    if(!file)return;\n    if(!['image/png','image/svg+xml'].includes(file.type)){setLogoWarning('Please choose a PNG or safe SVG logo.');return}\n    if(file.size>512*1024){setLogoWarning('Logo image is too large. Please choose an image that is 512 KB or smaller.');return}\n    setSaving('logo');try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});setPendingLogoDataUrl(dataUrl);setLogoUrl(dataUrl)}finally{setSaving('')}}"""
if old not in s: print('selectLogo old not found')
else: s=s.replace(old,new)
# add modal before return close
needle='''  return <div className="mx-auto w-full max-w-[1280px] p-4 sm:p-6 lg:p-7">'''
rep='''  return <><div className="mx-auto w-full max-w-[1280px] p-4 sm:p-6 lg:p-7">'''
s=s.replace(needle,rep)
# close fragment after final div
s=s.replace('''    </div>\n  </div>\n}''','''    </div>\n  </div><Modal open={Boolean(logoWarning)} onClose={()=>setLogoWarning('')} title="Logo upload warning" footer={<Button variant="primary" onClick={()=>setLogoWarning('')}>OK</Button>}><p className="text-sm leading-6 text-slate-soft">{logoWarning}</p></Modal></>\n}''')
p.write_text(s)

# 7 HH:MM helper in FloorMatrix and MembersPage
p=root/'apps/admin/src/pages/FloorMatrix.jsx'; s=p.read_text()
# insert helpers after imports area before component
idx=s.find('export default function FloorMatrix')
helper='''function minutesToHHMM(minutes) { const total=Math.max(0,Math.floor(Number(minutes)||0)); return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}` }\nfunction hhmmToMinutes(value) { const match=String(value||'').match(/^(\\d{1,3}):([0-5]\\d)$/); return match ? Number(match[1])*60+Number(match[2]) : 0 }\n\n'''
if idx!=-1 and 'function hhmmToMinutes' not in s: s=s[:idx]+helper+s[idx:]
s=s.replace("const [timeMinutes,setTimeMinutes]=useState('')","const [timeMinutes,setTimeMinutes]=useState('00:15')")
s=s.replace("Number.isInteger(Number(timeMinutes))&&Number(timeMinutes)>0", "hhmmToMinutes(timeMinutes)>0")
s=s.replace("seconds:Number(timeMinutes)*60", "seconds:hhmmToMinutes(timeMinutes)*60")
s=s.replace("setTimeMinutes(String(value))", "setTimeMinutes(minutesToHHMM(value))")
s=s.replace("setTimeMinutes(String(Math.max(1,Math.floor((Number(timeAction?.session?.expiresAt||Date.now())-Date.now())/60000))))", "setTimeMinutes(minutesToHHMM(Math.max(1,Math.floor((Number(timeAction?.session?.expiresAt||Date.now())-Date.now())/60000))))")
s=s.replace('<span className="eyebrow mb-1.5 block">Minutes</span><NumericInput value={timeMinutes} onChange={event=>setTimeMinutes(event.target.value)} placeholder="0" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none"/>','<span className="eyebrow mb-1.5 block">Time (HH:MM)</span><input inputMode="numeric" value={timeMinutes} onChange={event=>setTimeMinutes(event.target.value.replace(/[^0-9:]/g,"").slice(0,5))} placeholder="00:00" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none"/>')
p.write_text(s)

p=root/'apps/admin/src/pages/MembersPage.jsx'; s=p.read_text()
# add helper near top
idx=s.find('function transferableSessionSeconds')
helper='''function minutesToHHMM(minutes) { const total=Math.max(0,Math.floor(Number(minutes)||0)); return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}` }\nfunction hhmmToMinutes(value) { const match=String(value||'').match(/^(\\d{1,3}):([0-5]\\d)$/); return match ? Number(match[1])*60+Number(match[2]) : 0 }\n\n'''
if idx!=-1 and 'function hhmmToMinutes' not in s: s=s[:idx]+helper+s[idx:]
# specific modal local state likely minutes
s=s.replace("const [minutes,setMinutes]=useState('')", "const [minutes,setMinutes]=useState('00:15')")
s=s.replace("Number.isInteger(Number(minutes))&&Number(minutes)>0&&Number(minutes)*60<=availableSeconds", "hhmmToMinutes(minutes)>0&&hhmmToMinutes(minutes)*60<=availableSeconds")
s=s.replace("Number(minutes)*60)}>Transfer time", "hhmmToMinutes(minutes)*60)}>Transfer time")
s=s.replace("setMinutes(String(Math.floor(availableSeconds/60)))", "setMinutes(minutesToHHMM(Math.floor(availableSeconds/60)))")
s=s.replace('<span className="eyebrow mb-1.5 block">Minutes</span><NumericInput autoFocus min="1" step="1" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="0" className={inputClass}/>','<span className="eyebrow mb-1.5 block">Time (HH:MM)</span><input autoFocus inputMode="numeric" value={minutes} onChange={e=>setMinutes(e.target.value.replace(/[^0-9:]/g,"").slice(0,6))} placeholder="00:00" className={inputClass}/>')
p.write_text(s)
