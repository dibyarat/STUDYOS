import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  Library,
  LockKeyhole,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import studyosMark from '../assets/studyos-mark.png'
import campassistIcon from '../assets/campassist-icon.png'
import './LandingPage.css'

export default function LandingPage({ initialShowLogin = false }) {
  const { signIn } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(initialShowLogin)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: signInError } = await signIn(email, password)
      if (signInError) {
        setError(signInError.message || 'Incorrect email or password.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const openLogin = () => {
    setError('')
    setShowLoginModal(true)
  }

  const closeLogin = () => {
    if (!submitting) {
      setShowLoginModal(false)
      setError('')
    }
  }

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
            <button type="button" className="landing-btn-login" onClick={openLogin}>
              Sign In
            </button>
            <button type="button" className="landing-btn-primary" onClick={openLogin}>
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
          <button type="button" className="landing-btn-primary" onClick={openLogin}>
            Launch Workspace <ArrowRight size={16} />
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
          <button type="button" className="landing-btn-primary" onClick={openLogin}>
            Get Started Now <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="landing-footer">
        <div className="landing-footer-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={studyosMark} alt="StudyOS" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <strong style={{ color: '#0f172a' }}>StudyOS</strong>
            <span>&copy; {new Date().getFullYear()} StudyOS. Built for students, powered by campus.</span>
          </div>
          <div>
            <a
              href={import.meta.env.VITE_CAMPUSMATE_URL || 'https://campassist.me'}
              style={{ color: '#64748b', textDecoration: 'none', fontWeight: 600 }}
              target="_blank"
              rel="noreferrer"
            >
              CampAssist Companion
            </a>
          </div>
        </div>
      </footer>

      {/* Sign In Modal */}
      {showLoginModal && (
        <div className="landing-modal-backdrop" onClick={closeLogin}>
          <div className="landing-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="landing-modal-close" onClick={closeLogin} aria-label="Close modal">
              <X size={18} />
            </button>

            <div className="landing-modal-header">
              <img src={studyosMark} alt="StudyOS Logo" className="landing-modal-logo" />
              <h2>Welcome to StudyOS</h2>
              <p>Sign in with your student credentials to continue</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="landing-modal-form">
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

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
              </label>

              {error && <p className="landing-modal-error" role="alert">{error}</p>}

              <button type="submit" className="landing-modal-submit" disabled={submitting}>
                <LockKeyhole size={16} />
                <span>{submitting ? 'Signing in…' : 'Sign in to StudyOS'}</span>
              </button>
            </form>

            <p className="landing-modal-footer">
              Secure authentication powered by Firebase Auth.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

