import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read=file=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Customer Station pairing uses an OTP-style 8-character code entry with automatic XXXX-XXXX formatting',()=>{
  const pairing=read('apps/customer/src/components/auth/StationCloudPairing.jsx')
  assert.match(pairing,/const PAIRING_CODE_LENGTH = 8/)
  assert.match(pairing,/Array\(PAIRING_CODE_LENGTH\)\.fill\(''\)/)
  assert.match(pairing,/autoComplete=\{index===0\?'one-time-code':'off'\}/)
  assert.match(pairing,/handlePairingPaste/)
  assert.match(pairing,/handlePairingKeyDown/)
  assert.match(pairing,/event\.key==='Backspace'/)
  assert.match(pairing,/event\.key==='ArrowLeft'/)
  assert.match(pairing,/event\.key==='ArrowRight'/)
  assert.match(pairing,/formatPairingCode\(pairingCode\.join\(''\)\)/)
  assert.match(pairing,/\$\{clean\.slice\(0,4\)\}-\$\{clean\.slice\(4\)\}/)
  assert.match(pairing,/aria-label=\{`Pairing code character \$\{index\+1\} of \$\{PAIRING_CODE_LENGTH\}`\}/)
  assert.match(pairing,/aria-hidden="true"[^>]*>–<\/span>/)
  assert.match(pairing,/customer-pairing-brand-panel/)
  assert.match(pairing,/customer-pairing-form-panel/)
  assert.match(pairing,/customer-pairing-code-input/)
  const css=read('apps/customer/src/index.css')
  assert.match(css,/\.customer-pairing-container[\s\S]*bg-surface/)
  assert.match(css,/\.customer-pairing-form-panel[\s\S]*background: var\(--color-surface\)/)
  assert.match(css,/html\[data-theme="dark"\] \.customer-pairing-brand-panel/)
  assert.doesNotMatch(css,/\.customer-pairing-container\s*\{[^}]*bg-soft-white/)
})
