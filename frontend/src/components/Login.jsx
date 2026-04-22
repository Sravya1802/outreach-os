import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function send(e) {
    e.preventDefault()
    setSending(true); setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send link')
    }
    setSending(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#0f172a,#1e293b)', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 36px', width:'100%', maxWidth:420, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', marginBottom:6 }}>
            <span style={{ color:'#6366f1' }}>◈</span> OutreachOS
          </div>
          <div style={{ fontSize:13, color:'#64748b' }}>Sign in to continue</div>
        </div>

        {sent ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📧</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:6 }}>Check your email</div>
            <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>
              We sent a magic link to<br/>
              <span style={{ color:'#0f172a', fontWeight:600 }}>{email}</span>
            </div>
            <button onClick={() => { setSent(false); setEmail('') }}
              style={{ marginTop:20, padding:'8px 16px', background:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={send}>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>
              Email
            </label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" disabled={sending}
              style={{ width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid #e2e8f0', fontSize:14, color:'#0f172a', outline:'none', boxSizing:'border-box', marginBottom:14 }} />

            {error && <div style={{ padding:'10px 12px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, color:'#dc2626', marginBottom:14 }}>{error}</div>}

            <button type="submit" disabled={sending || !email}
              style={{ width:'100%', padding:'12px', background: sending || !email ? '#cbd5e1' : 'linear-gradient(135deg,#6366f1,#7c3aed)', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor: sending || !email ? 'default' : 'pointer' }}>
              {sending ? 'Sending…' : 'Send magic link'}
            </button>

            <div style={{ fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:16, lineHeight:1.5 }}>
              You'll receive a one-time link to sign in. No password needed.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
