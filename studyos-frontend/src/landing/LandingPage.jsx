import { useState, useEffect, useRef } from 'react'
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
  const modalRef = useRef(null)
  const lastActiveElementRef = useRef(null)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

    lastActiveElementRef.current = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move initial focus into modal
    const focusTimer = setTimeout(() => {
      const modal = modalRef.current
      if (modal) {
        const focusable = modal.querySelectorAll('input:not(:disabled), button:not(.landing-modal-close):not(:disabled), select:not(:disabled), textarea:not(:disabled)')
        if (focusable.length) {
          focusable[0].focus()
        } else {
          modal.focus()
        }
      }
    }, 50)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        closeLogin()
      } else if (e.key === 'Tab') {
        const modal = modalRef.current
        if (!modal) return
        const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(focusTimer)
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (lastActiveElementRef.current && typeof lastActiveElementRef.current.focus === 'function') {
        lastActiveElementRef.current.focus()
      }
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

      <div className="page-wrapper">
        {/* 1. STICKY FLOATING GLASS NAVBAR */}
        <header className="site-navbar glass">
          <div className="navbar-inner">
            <a href="#hero" className="brand-link" aria-label="StudyOS Home">
              <div className="brand-icon-wrapper">
                <img src={studyosMark} alt="StudyOS Icon" className="brand-icon-img" />
              </div>
              <span className="brand-wordmark">
                <span className="wordmark-blue">Study</span><span className="wordmark-accent">OS</span>
              </span>
            </a>

            <nav className="nav-links" aria-label="Primary navigation">
              <a href="#hero" className="nav-item-link">Home</a>
              <a href="#features" className="nav-item-link">Features</a>
              <a href="#companion" className="nav-item-link">Ecosystem</a>
              <a href="#about" className="nav-item-link">About</a>
            </nav>

            <div className="nav-actions">
              <button type="button" className="nav-signin-link" onClick={() => openLogin('signin')}>
                Sign In
              </button>
              <button type="button" className="btn-gradient nav-cta-btn" onClick={() => openLogin('signup')}>
                <span>Get Started</span>
                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                className="mobile-toggle"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
              >
                <span className="mobile-toggle-bar" />
                <span className="mobile-toggle-bar" />
                <span className="mobile-toggle-bar" />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        <div className={`mobile-menu-drawer glass ${mobileMenuOpen ? 'is-open' : ''}`} aria-label="Mobile Navigation">
          <a href="#hero" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Home</a>
          <a href="#features" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#companion" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Ecosystem</a>
          <a href="#about" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>About</a>
          <button
            type="button"
            className="btn-glass btn-full"
            onClick={() => { setMobileMenuOpen(false); openLogin('signin') }}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn-gradient btn-full"
            onClick={() => { setMobileMenuOpen(false); openLogin('signup') }}
          >
            Get Started <ArrowRight size={15} />
          </button>
        </div>

        <main>
          {/* 2. TWO-COLUMN HERO SECTION */}
          <section className="hero-section" id="hero">
            <div className="container">
              <div className="hero-grid">
                {/* Left Column */}
                <div className="hero-content">
                  <div className="hero-pill-badge glass-pill">
                    <span className="sparkle-icon" aria-hidden="true">✦</span>
                    <span>THE ACADEMIC OPERATING SYSTEM</span>
                  </div>

                  <h1 className="hero-headline">
                    Your semester, <span className="gradient-text">synchronized.</span>
                  </h1>

                  <p className="hero-subline">
                    StudyOS is the unified academic hub for university students. Organize virtual study classes, share vaulted notes, recruit project teams, and document lab records in one modern workspace.
                  </p>

                  <div className="hero-cta-group">
                    <button type="button" className="btn-gradient" onClick={() => openLogin('signup')}>
                      <span>Launch Workspace</span>
                      <ArrowRight size={16} />
                    </button>
                    <button type="button" className="btn-glass" onClick={() => openLogin('signin')}>
                      <span>Sign In</span>
                    </button>
                    <a
                      href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-glass"
                    >
                      <img src={campassistIcon} alt="CampAssist" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                      <span>Open CampAssist</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>

                  <div className="hero-trust-line">
                    <CheckCircle2 size={18} className="trust-check-icon" aria-hidden="true" />
                    <span>Built by students, for students. Part of the HayonCampus ecosystem.</span>
                  </div>
                </div>

                {/* Right Column: Staggered Floating Product Mockup Cards */}
                <div className="hero-mockup-stage" aria-label="StudyOS workspace preview">
                  <div className="floating-mockup-card card-top glass">
                    <div className="mockup-header">
                      <div className="mockup-brand">
                        <img src={studyosMark} alt="StudyOS" className="mockup-brand-icon" />
                        <span className="mockup-brand-name">StudyOS Vault</span>
                      </div>
                      <span className="mockup-status-chip">
                        <span className="chip-dot" />
                        <span>Live Workspace</span>
                      </span>
                    </div>

                    <div className="mockup-body-item">
                      <div className="mockup-item-title">Distributed Systems Vault.pdf</div>
                      <div className="mockup-item-meta">Unit 3: Consensus Protocols • 4.9 ★ (18 reviews)</div>
                    </div>

                    <div className="mockup-body-item" style={{ marginBottom: 0 }}>
                      <div className="mockup-item-meta">Virtual Study Classes</div>
                      <div className="mockup-meter-row">
                        <span className="mockup-meter-stat">88%</span>
                        <span className="mockup-meter-pill">12/14 Modules Completed</span>
                      </div>
                    </div>
                  </div>

                  <div className="floating-mockup-card card-bottom glass">
                    <div className="mockup-header">
                      <div className="mockup-brand">
                        <img src={studyosMark} alt="StudyOS" className="mockup-brand-icon" />
                        <span className="mockup-brand-name">Teams & Lab Records</span>
                      </div>
                      <span className="mockup-status-chip">
                        <span className="chip-dot" />
                        <span>Cloud Sync Active</span>
                      </span>
                    </div>

                    <div className="mockup-body-item">
                      <div className="mockup-item-title">Hackathon Squad (3/4 Filled)</div>
                      <div className="mockup-team-row">
                        <div className="mockup-avatar-group">
                          <div className="avatar-circle avatar-1">RN</div>
                          <div className="avatar-circle avatar-2">SP</div>
                          <div className="avatar-circle avatar-3">AD</div>
                        </div>
                        <span className="mockup-meter-pill pill-blue">+1 Need React/Node</span>
                      </div>
                    </div>

                    <div className="mockup-body-item" style={{ marginBottom: 0 }}>
                      <div className="mockup-item-title">DBMS Exp 07: B+ Tree Indexing</div>
                      <div className="mockup-item-meta">Lab Repository • Code & Outputs Attached</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. FEATURES SECTION */}
          <section id="features" className="features-section">
            <div className="container">
              <div className="section-header">
                <div className="section-badge glass-pill">FEATURES</div>
                <h2 className="section-title">Everything you need to excel.</h2>
                <p className="section-subtitle">
                  Designed specifically for student workflows. Replace messy group chats and lost Google Drive links with a single, dedicated academic workspace.
                </p>
              </div>

              <div className="features-grid">
                {features.map((feature, idx) => {
                  const Icon = feature.icon
                  return (
                    <div className="feature-card glass" key={idx}>
                      <div className={`feature-icon-bubble ${feature.tone}`}>
                        <Icon size={24} />
                      </div>
                      <h3>{feature.title}</h3>
                      <p>{feature.desc}</p>
                      <span className="feature-highlight-tag glass-pill">
                        <CheckCircle2 size={12} color="#10b981" />
                        {feature.tag}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* 4. COMPANION ECOSYSTEM SECTION */}
          <section id="companion" className="companion-section">
            <div className="container">
              <div className="companion-card glass">
                <div className="platform-card-glow glow-campassist" />
                <div className="companion-info">
                  <div className="section-badge glass-pill">SEAMLESS ECOSYSTEM</div>
                  <h3>Built to work together with CampAssist.</h3>
                  <p>
                    StudyOS is the official academic companion to CampAssist. While CampAssist takes care of your daily attendance, timetables, and campus facilities, StudyOS powers your classes, study materials, and peer collaboration.
                  </p>
                  <a
                    href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-gradient"
                  >
                    <img src={campassistIcon} alt="CampAssist" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    <span>Visit CampAssist Digital Campus</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="companion-emblem-wrap">
                  <div className="about-emblem-card glass">
                    <img src={campassistIcon} alt="CampAssist Logo" className="companion-emblem-img" />
                    <span className="brand-wordmark emblem-wordmark">
                      <span className="wordmark-blue">Camp</span><span className="wordmark-accent">Assist</span>
                    </span>
                    <span className="about-tagline-text">Daily Schedule & Attendance Companion</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 5. BRAND STATEMENT BANNER */}
          <section className="statement-section">
            <div className="container">
              <div className="statement-panel glass">
                <h2 className="statement-headline">
                  Studying shouldn&apos;t feel fragmented. <br />
                  <span className="gradient-text">We&apos;re uniting every facet of academic collaboration.</span>
                </h2>
                <p className="statement-subtext">
                  Join your classmates on StudyOS today. Sign in with your student account to get instant access to notes, classes, and projects.
                </p>
                <div className="hero-cta-group" style={{ justifyContent: 'center', marginBottom: 0 }}>
                  <button type="button" className="btn-gradient" onClick={() => openLogin('signup')}>
                    <span>Get Started Now</span>
                    <ArrowRight size={16} />
                  </button>
                  <button type="button" className="btn-glass" onClick={() => openLogin('signin')}>
                    <span>Sign In</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 6. ABOUT SECTION */}
          <section className="about-section" id="about">
            <div className="container">
              <div className="about-grid">
                <div className="about-copy-wrap">
                  <div className="section-badge glass-pill">ABOUT STUDYOS</div>
                  <h2 className="about-title">
                    Purpose-built for the rhythm of modern university life.
                  </h2>
                  <p className="about-paragraph">
                    University life moves fast. Students traditionally juggle fragmented group chats for classroom notes, scattered Drive links for lab manuals, and buried emails when recruiting teammates for hackathons.
                  </p>
                  <p className="about-paragraph">
                    StudyOS brings every academic resource, virtual study class, lab record, and project squad into one synchronized workspace — seamlessly connected to CampAssist under the HayonCampus umbrella.
                  </p>
                  <div className="about-highlight-box glass">
                    <span className="sparkle-icon" aria-hidden="true">✦</span>
                    <span>One shared student ecosystem. Zero fragmented noise.</span>
                  </div>
                </div>

                <div className="about-emblem-stage">
                  <div className="about-emblem-card glass">
                    <img src={studyosMark} alt="StudyOS Icon" className="about-emblem-img" />
                    <span className="brand-wordmark emblem-wordmark">
                      <span className="wordmark-blue">Study</span><span className="wordmark-accent">OS</span>
                    </span>
                    <span className="about-tagline-text">Your academic workspace, fully synchronized.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* 7. FOOTER */}
        <footer className="site-footer">
          <div className="container">
            <div className="footer-grid">
              <div className="footer-brand-col">
                <a href="#hero" className="brand-link" aria-label="StudyOS Home">
                  <div className="brand-icon-wrapper">
                    <img src={studyosMark} alt="StudyOS Icon" className="brand-icon-img" />
                  </div>
                  <span className="brand-wordmark">
                    <span className="wordmark-blue">Study</span><span className="wordmark-accent">OS</span>
                  </span>
                </a>
                <p className="footer-tagline">
                  Your unified academic operating system. Part of the HayonCampus student ecosystem.
                </p>
              </div>

              <div>
                <h4 className="footer-links-title">Workspace</h4>
                <ul className="footer-links-list">
                  <li><a href="#features" className="footer-link-item">Virtual Study Classes</a></li>
                  <li><a href="#features" className="footer-link-item">Study Notes Vault</a></li>
                  <li><a href="#features" className="footer-link-item">Projects & Lab Repository</a></li>
                  <li><a href="#features" className="footer-link-item">Team Finder</a></li>
                </ul>
              </div>

              <div>
                <h4 className="footer-links-title">Ecosystem</h4>
                <ul className="footer-links-list">
                  <li><a href="https://hayoncampus.in" target="_blank" rel="noreferrer" className="footer-link-item">HayonCampus Parent</a></li>
                  <li><a href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'} target="_blank" rel="noreferrer" className="footer-link-item">CampAssist Companion</a></li>
                  <li><a href="#about" className="footer-link-item">About StudyOS</a></li>
                  <li><button type="button" onClick={() => openLogin('signin')} className="footer-link-item">Sign In</button></li>
                </ul>
              </div>
            </div>

            <div className="footer-bottom-bar">
              <div>© {new Date().getFullYear()} StudyOS • HayonCampus. All rights reserved.</div>
              <div className="footer-extra-links">
                <span>Designed for higher education</span>
                <span>•</span>
                <span>CampAssist & StudyOS</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Authentication Modal rendered into document.body to guarantee viewport positioning */}
      {showLoginModal && typeof document !== 'undefined' && createPortal(
        <div className="landing-modal-backdrop" onClick={closeLogin}>
          <div ref={modalRef} className="landing-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="landing-modal-title" tabIndex={-1}>
            <button type="button" className="landing-modal-close" onClick={closeLogin} aria-label="Close modal">
              <X size={18} />
            </button>

            <div className="landing-modal-header">
              <img src={studyosMark} alt="StudyOS Logo" className="landing-modal-logo" />
              <h2 id="landing-modal-title">{authMode === 'signup' ? 'Create Your Account' : authMode === 'forgot' ? 'Reset Your Password' : authMode === 'reset-confirm' ? 'Set New Password' : 'Welcome to StudyOS'}</h2>
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
                  <div className="landing-form-group">
                    <label htmlFor="auth-name" style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '11px', color: 'var(--color-muted)' }}>
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="e.g. Alex Morgan"
                      maxLength={100}
                    />
                  </div>
                )}

                {authMode !== 'reset-confirm' && (
                  <div className="landing-form-group">
                    <label htmlFor="auth-email" style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '11px', color: 'var(--color-muted)' }}>
                      Email Address
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="you@college.edu"
                    />
                  </div>
                )}

                {authMode !== 'forgot' && (
                  <div className="landing-form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label htmlFor="auth-password" style={{ margin: 0, fontWeight: 700, fontSize: '11px', color: 'var(--color-muted)' }}>
                        {authMode === 'reset-confirm' ? 'New Password' : 'Password'}
                      </label>
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
                        id="auth-password"
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
                  </div>
                )}

                {(authMode === 'signup' || authMode === 'reset-confirm') && (
                  <div className="landing-form-group">
                    <label htmlFor="auth-confirm-password" style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '11px', color: 'var(--color-muted)' }}>
                      {authMode === 'reset-confirm' ? 'Confirm New Password' : 'Confirm Password'}
                    </label>
                    <div className="password-input-wrap">
                      <input
                        id="auth-confirm-password"
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
                  </div>
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

