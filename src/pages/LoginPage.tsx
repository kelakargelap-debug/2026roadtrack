import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const API = '' // Use relative path since backend is on the same port

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const form = new URLSearchParams()
      form.append('username', email)
      form.append('password', password)
      const res = await axios.post(`${API}/api/auth/login`, form,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container" style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--pu-blue)', position:'relative', overflow:'hidden'
    }}>
      <div className="login-card" style={{
        background:'var(--bg-card)', padding:40, borderRadius:12, width:'100%', maxWidth:400,
        boxShadow:'0 20px 40px rgba(0,0,0,0.3)', zIndex:10, borderTop:'4px solid var(--pu-yellow)'
      }}>
        <div style={{textAlign:'center', marginBottom:32}}>
          <div style={{marginBottom:16, display:'flex', justifyContent:'center'}}>
            <div style={{}}>
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/c/c6/Logo_Kementerian_Pekerjaan_Umum_Republik_Indonesia.svg" 
                alt="KemenPUPR" 
                style={{height:64, display:'block'}} 
              />
            </div>
          </div>
          <h2 style={{color:'var(--pu-blue)', margin:0, fontSize:24, fontWeight:900, letterSpacing:'-0.5px'}}>ROADTRACK</h2>
          <p style={{color:'var(--text-muted)', fontSize:11, fontWeight:800, marginTop:4, opacity:0.7, letterSpacing:'1px'}}>BPJN MALUKU</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Email</label>
            <input 
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required style={{width:'100%',padding:'10px 12px',borderRadius:8,
              border:'1px solid var(--border)',marginTop:6,fontSize:14,
              background:'var(--bg-page)',color:'var(--text-main)'}}
              placeholder="admin@roadtrack.id" />
          </div>

          <div style={{marginBottom:24}}>
            <label style={{fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase'}}>Password</label>
            <div style={{position:'relative', marginTop:6}}>
              <input 
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)} required
                style={{width:'100%',padding:'10px 40px 10px 12px',borderRadius:8,
                border:'1px solid var(--border)',fontSize:14,
                background:'var(--bg-page)',color:'var(--text-main)'}} />
              <button 
                type="button" 
                onClick={() => setShowPw(!showPw)}
                style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)'}}>
                {showPw?'🙈':'👁'}
              </button>
            </div>
          </div>

          {error && <div style={{color:'var(--iri-rusak-berat)', fontSize:13, marginBottom:16, textAlign:'center'}}>{error}</div>}
          
          <button 
            type="submit"
            disabled={loading}
            style={{
              width:'100%', padding:'12px', borderRadius:8, border:'none',
              background:'var(--pu-blue)', color:'white', fontWeight:700,
              cursor:'pointer', transition:'0.2s', opacity: loading?0.7:1
            }}>
            {loading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
          </button>
        </form>

        <div style={{marginTop:32, textAlign:'center', fontSize:12, color:'var(--text-muted)'}}>
          Akses terbatas untuk petugas yang berwenang
        </div>
      </div>
    </div>
  )
}
