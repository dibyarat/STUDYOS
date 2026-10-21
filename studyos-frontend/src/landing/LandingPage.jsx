import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  GraduationCap,
  Library,
  LockKeyhole,
  Mail,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  User,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import studyosMark from '../assets/studyos-mark.png'
import campassistIcon from '../assets/campassist-icon.png'
import BrandBackdrop from '../components/BrandBackdrop.jsx'
import './LandingPage.css'

export default function LandingPage({ initialShowLogin = false }) {
  const { signIn, signUp, resetPassword, confirmPassword: confirmPasswordResetAction } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(initialShowLogin)
  const [authMode, setAuthMode] = useState('signin') // 'signin' | 'signup' | 'forgot' | 'reset-confirm'
  const [resetCode, setResetCode] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const mode = params.get('mode')
      const oobCode = params.get('oobCode')
      if (mode === 'resetPassword' && oobCode) {
        setResetCode(oobCode)
        setAuthMode('reset-confirm')
        setShowLoginModal(true)
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } catch {}
  }, [])
  const mapAuthError = (err) => {
    const code = err?.code || ''
    const message = err?.message || ''
    if (code === 'auth/expired-action-code') {
      return 'The password reset link has expired. Please request a new link.'
    }
    if (code === 'auth/invalid-action-code') {
      return 'The password reset link is invalid or has already been used. Please request a new link.'
    }
    if (code === 'auth/user-disabled') {
      return 'This account has been disabled. Please contact support.'
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Incorrect email or password. Please verify your credentials or reset your password.'
    }
    if (code === 'auth/user-not-found') {
      return authMode === 'forgot'
        ? 'No account was found with this email address. Please verify your spelling or create an account.'
        : 'Incorrect email or password. Please verify your credentials or reset your password.'
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account already exists with this email address. Please sign in instead.'
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters long.'
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.'
    }
    if (code === 'auth/too-many-requests') {
      return 'Access temporarily blocked due to multiple failed attempts. Please try again shortly.'
    }
    return message || 'Authentication failed. Please check your details and try again.'
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setStatusMessage('')

    if (authMode === 'signup') {
      if (!name.trim()) {
        setError('Please enter your name.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter them.')
        return
      }
      setSubmitting(true)
      try {
        const { error: signUpError } = await signUp(email.trim(), password, name.trim())
        if (signUpError) {
          setError(mapAuthError(signUpError))
        } else {
          setStatusMessage('Account created successfully! Welcome to StudyOS.')
        }
      } catch (err) {
        setError(mapAuthError(err))
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (authMode === 'reset-confirm') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter them.')
        return
      }
      setSubmitting(true)
      try {
        const { error: confirmErr } = await confirmPasswordResetAction(resetCode, password)
        if (confirmErr) {
          setError(mapAuthError(confirmErr))
        } else {
          setStatusMessage('Your password has been successfully reset! You can now sign in with your new password.')
          setAuthMode('signin')
          setPassword('')
          setConfirmPassword('')
          setResetCode('')
        }
      } catch (err) {
        setError(mapAuthError(err))
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (authMode === 'forgot') {
      if (!email.trim()) {
        setError('Please enter your registered email address.')
        return
      }
      setSubmitting(true)
      try {
        const { error: resetErr } = await resetPassword(email.trim())
        if (resetErr && resetErr.code !== 'auth/user-not-found') {
          setError(mapAuthError(resetErr))
        } else {
          setStatusMessage(`If an account exists for ${email.trim()}, a password reset link has been sent. Please check your inbox.`)
        }
      } catch (err) {
        setError(mapAuthError(err))
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Sign in mode
    setSubmitting(true)
    try {
      const { error: signInError } = await signIn(email.trim(), password)
      if (signInError) {
        setError(mapAuthError(signInError))
      }
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const openLogin = (mode = 'signin') => {
    const targetMode = (typeof mode === 'string' && (mode === 'signup' || mode === 'forgot' || mode === 'reset-confirm')) ? mode : 'signin'
    setError('')
    setStatusMessage('')
    setAuthMode(targetMode)
    setShowLoginModal(true)
  }

  const closeLogin = () => {
    if (!submitting) {
      setShowLoginModal(false)
      setError('')
      setStatusMessage('')
      setPassword('')
      setConfirmPassword('')
      setResetCode('')
    }
  }

  useEffect(() => {
    if (!showLoginModal) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        closeLogin()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showLoginModal, submitting])

  const features = [
    {
      icon: BookOpen,
      tone: 'blue',
      title: 'Virtual Study Classes',
      desc: 'Structured course modules organized topic-by-topic. Follow syllabus progression, link materials, and track your personalized class completion.',
      tag: 'Progress Tracking',
    },
    {
      icon: Library,
      tone: 'purple',
      title: 'Study Notes Vault',
      desc: 'Centralized repository of lecture summaries, cheat sheets, and PYQs uploaded by classmates. Rate, save, and download study resources.',
      tag: 'Peer Rated',
    },
    {
      icon: FolderKanban,
      tone: 'emerald',
      title: 'Projects & Lab Repository',
      desc: 'Never lose your practical experiments. Document aims, procedures, source codes, and outputs with immediate file attachment downloads.',
      tag: 'Code & Procedures',
    },
    {
      icon: UsersRound,
      tone: 'pink',
      title: 'Team Finder',
      desc: 'Find collaborators for hackathons, capstone projects, and coding competitions. Post role requirements and manage join requests easily.',
      tag: 'Hackathons & Capstone',
    },
    {
      icon: Sparkles,
      tone: 'amber',
      title: 'Skills & Peer Help',
      desc: 'Connect with talented peers for academic tutoring, code reviews, and micro-help. Offer your expertise and solve doubts together.',
      tag: 'Student Exchange',
    },
    {
      icon: Search,
      tone: 'cyan',
      title: 'Instant Search & Discussions',
      desc: 'Universal keyboard-driven search (Ctrl+K) across notes, classes, and peers. Plus dedicated in-context discussion threads on every resource.',
      tag: 'Universal Search',
    },
  ]

  return (
    <div className="studyos-landing">
      <BrandBackdrop />
      {/* Header / Navbar */}
      <header className="landing-header">
        <div className="landing-nav-container">
          <div className="landing-brand">
            <img src={studyosMark} alt="StudyOS Mark" className="landing-brand-logo" />
            <strong>Study<span>OS</span></strong>
            <span className="landing-badge">CAMPUS</span>
          </div>

          <nav className="landing-nav-links">
            <a href="#features">Features</a>
            <a href="#companion">CampAssist Companion</a>
            <a href="#about">About</a>
          </nav>

          <div className="landing-nav-actions">
            <button type="button" className="landing-btn-login" onClick={() => openLogin('signin')}>
              Sign In
            </button>
            <button type="button" className="landing-btn-primary" onClick={() => openLogin('signup')}>
              Get Started <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-badge">
          <GraduationCap size={15} />
          <span>The Academic Operating System</span>
        </div>

        <h1>
          Your Semester Journey,<br />
          <span className="text-gradient">Fully Synchronized.</span>
        </h1>

        <p className="landing-hero-desc">
          StudyOS is the unified academic hub for university students. Organize virtual study classes, share vaulted notes, recruit project teams, and document lab records in one modern workspace.
        </p>

        <div className="landing-hero-cta">
          <button type="button" className="landing-btn-primary" onClick={() => openLogin('signup')}>
            Launch Workspace <ArrowRight size={16} />
          </button>
          <button type="button" className="landing-btn-login-hero" onClick={() => openLogin('signin')}>
            Sign In
          </button>
          <a href="#features" className="landing-btn-secondary">
            Explore Features
          </a>
          <a
            href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
            target="_blank"
            rel="noreferrer"
            className="companion-btn"
          >
            <img src={campassistIcon} alt="CampAssist" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            <span>Open CampAssist</span>
            <ExternalLink size={13} />
          </a>
        </div>

        {/* Hero Interactive Showcase Mockup */}
        <div className="hero-mockup-wrap">
          <div className="hero-mockup-inner">
            <div className="mockup-sidebar">
              <div className="mockup-sidebar-brand">
                <img src={studyosMark} alt="" style={{ width: 20, height: 20 }} />
                <span>StudyOS</span>
              </div>
              <div className="mockup-sidebar-item active">
                <BookOpen size={14} /> Virtual Classes
              </div>
              <div className="mockup-sidebar-item">
                <Library size={14} /> Study Notes Vault
              </div>
              <div className="mockup-sidebar-item">
                <FolderKanban size={14} /> Lab Repository
              </div>
              <div className="mockup-sidebar-item">
                <UsersRound size={14} /> Team Finder
              </div>
            </div>

            <div className="mockup-main">
              <div className="mockup-top-search">
                <Search size={15} />
                <span>Search notes, classes, projects, people, skills... (Ctrl+K)</span>
              </div>

              <div className="mockup-cards-grid">
                <div className="mockup-stat-card">
                  <span>Virtual Classes</span>
                  <strong>Active Semester</strong>
                </div>
                <div className="mockup-stat-card">
                  <span>Vault Resources</span>
                  <strong>Peer Reviewed</strong>
                </div>
                <div className="mockup-stat-card">
                  <span>Team Finder</span>
                  <strong>Hackathons Open</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="landing-features-section">
        <div className="landing-features-container">
          <div className="section-header-center">
            <span className="section-tag">Powerful Features</span>
            <h2>Everything You Need to Excel</h2>
            <p>
              Designed specifically for student workflows. Replace messy group chats and lost Google Drive links with a single, dedicated academic workspace.
            </p>
          </div>

          <div className="features-grid">
            {features.map((feature, idx) => {
              const Icon = feature.icon
              return (
                <div className="feature-card" key={idx}>
                  <div className={`feature-icon-bubble ${feature.tone}`}>
                    <Icon size={24} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                  <span className="feature-highlight-tag">
                    <CheckCircle2 size={12} color="#10b981" />
                    {feature.tag}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CampAssist Companion Integration Section */}
      <section id="companion" className="landing-companion-section">
        <div className="companion-container">
          <div className="companion-card">
            <div className="companion-info">
              <span className="companion-badge-pill">
                Seamless Ecosystem
              </span>
              <h3>Built to Work Together with CampAssist</h3>
              <p>
                StudyOS is the official academic companion to CampAssist. While CampAssist takes care of your daily attendance, timetables, and campus facilities, StudyOS powers your classes, study materials, and peer collaboration.
              </p>
              <a
                href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
                target="_blank"
                rel="noreferrer"
                className="companion-btn"
              >
                <img src={campassistIcon} alt="CampAssist" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                <span>Visit CampAssist Digital Campus</span>
                <ExternalLink size={14} />
              </a>
            </div>

            <div style={{ textAlign: 'center', position: 'relative', zIndex: 10 }}>
              <div style={{ display: 'inline-flex', padding: 24, background: 'rgba(255, 255, 255, 0.95)', borderRadius: 28, border: '1px solid #ffffff', boxShadow: '0 16px 40px rgba(0,0,0,0.2)' }}>
                <img src={campassistIcon} alt="CampAssist Logo" style={{ width: 88, height: 88, objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="landing-bottom-cta">
        <div className="bottom-cta-inner">
          <h2>Ready to Elevate Your College Life?</h2>
          <p>
            Join your classmates on StudyOS today. Sign in with your existing student account to get instant access to notes, classes, and projects.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="landing-btn-primary" onClick={() => openLogin('signup')}>
              Get Started Now <ArrowRight size={16} />
            </button>
            <button type="button" className="landing-btn-secondary" onClick={() => openLogin('signin')}>
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="landing-footer">
        <div className="landing-footer-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={studyosMark} alt="StudyOS" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <strong className="font-wordmark" style={{ color: 'var(--color-primary)', fontSize: 18 }}>Study<span style={{ color: 'var(--color-accent)' }}>OS</span></strong>
            <span style={{ color: 'var(--color-muted)' }}>&copy; {new Date().getFullYear()} StudyOS. Part of the Hayoncampus student ecosystem.</span>
          </div>
          <div>
            <a
              href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
              style={{ color: 'var(--color-muted)', textDecoration: 'none', fontWeight: 600 }}
              target="_blank"
              rel="noreferrer"
            >
              CampAssist Companion
            </a>
          </div>
        </div>
      </footer>

      {/* Authentication Modal rendered into document.body to guarantee viewport positioning */}
      {showLoginModal && typeof document !== 'undefined' && createPortal(
        <div className="landing-modal-backdrop" onClick={closeLogin}>
          <div className="landing-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="landing-modal-close" onClick={closeLogin} aria-label="Close modal">
              <X size={18} />
            </button>

            <div className="landing-modal-header">
              <img src={studyosMark} alt="StudyOS Logo" className="landing-modal-logo" />
              <h2>{authMode === 'signup' ? 'Create Your Account' : authMode === 'forgot' ? 'Reset Your Password' : authMode === 'reset-confirm' ? 'Set New Password' : 'Welcome to StudyOS'}</h2>
              <p>
                {authMode === 'signup'
                  ? 'Join classmates, track study classes, and share resources'
                  : authMode === 'forgot'
                  ? 'We will send a secure password recovery link to your email'
                  : 'Sign in with your student credentials to continue'}
              </p>
            </div>

            {authMode !== 'forgot' && authMode !== 'reset-confirm' && (
              <div className="auth-mode-tabs" role="tablist">
                <button
                  type="button"
                  className={`auth-mode-tab ${authMode === 'signin' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('signin'); setError(''); setStatusMessage('') }}
                  role="tab"
                  aria-selected={authMode === 'signin'}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`auth-mode-tab ${authMode === 'signup' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('signup'); setError(''); setStatusMessage('') }}
                  role="tab"
                  aria-selected={authMode === 'signup'}
                >
                  Create Account
                </button>
              </div>
            )}

            {statusMessage && (
              <div className="landing-modal-success" role="status">
                <CheckCircle2 size={18} />
                <span>{statusMessage}</span>
              </div>
            )}

            {authMode === 'forgot' && statusMessage ? (
              <div style={{ marginTop: '16px' }}>
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '16px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                  role="status"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={24} style={{ color: '#16a34a', flexShrink: 0 }} />
                    <strong style={{ color: '#166534', fontSize: '15px' }}>Password Reset Link Sent!</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#15803d', lineHeight: '1.5' }}>
                    {statusMessage}
                  </p>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#166534', opacity: 0.9, lineHeight: '1.4' }}>
                    Click the link in the email to choose your new password. If you don't receive the email within 2-3 minutes, make sure to check your spam or junk folder.
                  </p>
                </div>

                <button
                  type="button"
                  className="landing-modal-submit"
                  style={{ marginTop: '20px' }}
                  onClick={() => {
                    setAuthMode('signin');
                    setError('');
                    setStatusMessage('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="landing-modal-form">
                {authMode === 'signup' && (
                  <label>
                    Full Name
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="e.g. Alex Morgan"
                      maxLength={100}
                    />
                  </label>
                )}

                {authMode !== 'reset-confirm' && (
                  <label>
                    Email Address
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@college.edu"
                    />
                  </label>
                )}

                {authMode !== 'forgot' && (
                  <label>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{authMode === 'reset-confirm' ? 'New Password' : 'Password'}</span>
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          className="auth-switch-link"
                          style={{ fontSize: '12px' }}
                          onClick={() => { setAuthMode('forgot'); setError(''); setStatusMessage('') }}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="password-input-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                        placeholder={authMode === 'reset-confirm' ? 'Enter new password' : authMode === 'signup' ? 'Create a secure password' : 'Enter your password'}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {(authMode === 'signup' || authMode === 'reset-confirm') && (
                      <span className="auth-password-hints">Must be at least 6 characters</span>
                    )}
                  </label>
                )}

                {(authMode === 'signup' || authMode === 'reset-confirm') && (
                  <label>
                    {authMode === 'reset-confirm' ? 'Confirm New Password' : 'Confirm Password'}
                    <div className="password-input-wrap">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder={authMode === 'reset-confirm' ? 'Re-enter new password' : 'Repeat your password'}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                )}

                {error && <p className="landing-modal-error" role="alert">{error}</p>}

                <button type="submit" className="landing-modal-submit" disabled={submitting}>
                  <LockKeyhole size={16} />
                  <span>
                    {submitting
                      ? authMode === 'signup'
                        ? 'Creating account…'
                        : authMode === 'forgot'
                        ? 'Sending link…'
                        : authMode === 'reset-confirm'
                        ? 'Updating password…'
                        : 'Signing in…'
                      : authMode === 'signup'
                      ? 'Create Account'
                      : authMode === 'forgot'
                      ? 'Send Password Reset Link'
                      : authMode === 'reset-confirm'
                      ? 'Update Password'
                      : 'Sign in to StudyOS'}
                  </span>
                </button>
              </form>
            )}

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px' }}>
              {authMode === 'reset-confirm' ? (
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setAuthMode('signin'); setError(''); setStatusMessage(''); setResetCode('') }}
                >
                  ← Cancel and return to sign in
                </button>
              ) : authMode === 'forgot' ? (
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => { setAuthMode('signin'); setError(''); setStatusMessage('') }}
                >
                  ← Back to sign in
                </button>
              ) : authMode === 'signup' ? (
                <p style={{ margin: 0, color: '#64748b' }}>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="auth-switch-link"
                    onClick={() => { setAuthMode('signin'); setError(''); setStatusMessage('') }}
                  >
                    Sign in here
                  </button>
                </p>
              ) : (
                <p style={{ margin: 0, color: '#64748b' }}>
                  Don’t have an account yet?{' '}
                  <button
                    type="button"
                    className="auth-switch-link"
                    onClick={() => { setAuthMode('signup'); setError(''); setStatusMessage('') }}
                  >
                    Create account
                  </button>
                </p>
              )}
            </div>

            <p className="landing-modal-footer">
              Secure authentication powered by Firebase Auth.
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

