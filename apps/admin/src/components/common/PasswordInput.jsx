import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export default function PasswordInput({ className = '', inputClassName = '', ...props }) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Hide password' : 'Show password'
  return <div className={`relative ${className}`}><input {...props} type={visible ? 'text' : 'password'} className={`pr-10 ${inputClassName}`} /><button type="button" aria-label={label} title={label} onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-soft hover:text-ink-900 focus:outline-none">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
}
