import { useState } from 'react'
import { GraduationCap, LockKeyhole } from 'lucide-react'
import { useAuth } from './useAuth.js'
import studyosMark from '../assets/studyos-mark.png'
import LandingPage from '../landing/LandingPage.jsx'
import '../StudyOS-auth.css'

function AuthGate({ children }) {
  const { configured, loading, user } = useAuth()

  if (!configured) return <AuthMessage title="Connect StudyOS" description="Add VITE_FIREBASE_* variables to your environment to enable your StudyOS session." />
  if (loading) return <AuthMessage title="Checking your StudyOS session" description="StudyOS is securely resolving your existing account." loading />
  if (user) return children

  return <LandingPage />
}

function AuthMessage({ title, description, loading = false }) { return <main className="auth-screen"><section className="auth-card auth-message"><div className="auth-brand"><span className="studyos-logo-mark"><img src={studyosMark} alt="" /></span><strong>Study<span>OS</span></strong></div><div className={`auth-icon ${loading ? 'pulse' : ''}`}><LockKeyhole size={21} /></div><h1>{title}</h1><p className="auth-copy">{description}</p></section></main> }

export default AuthGate
