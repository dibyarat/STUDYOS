import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RotateCcw,
  Plus,
  AlertTriangle,
  Flame,
  Award,
  BookOpen,
} from 'lucide-react';
import { apiRequest } from '../lib/api.js';

export default function AttendancePage({ user, profile, token, onNavigateToTimetable }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(75);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);

  const loadAttendance = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/attendance', { token });
      setData(res);
      if (res.target) setTarget(res.target);
    } catch (err) {
      console.error('Failed to load attendance:', err);
      setError('Could not load attendance details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [token]);

  // Update target
  const handleTargetChange = async (newTarget) => {
    setTarget(newTarget);
    try {
      await apiRequest('/attendance/target', {
        method: 'POST',
        token,
        body: { target: newTarget },
      });
      loadAttendance();
    } catch (err) {
      console.error('Failed to update target:', err);
    }
  };

  // Mark attendance (+Present, +Absent, +Cancelled)
  const handleMark = async (subjectName, status) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest('/attendance/mark', {
        method: 'POST',
        token,
        body: { subjectName, status },
      });
      await loadAttendance();
    } catch (err) {
      alert(err.message || 'Failed to update attendance');
    } finally {
      setActionLoading(false);
    }
  };

  // Undo last log
  const handleUndo = async (logId) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest('/attendance/undo', {
        method: 'POST',
        token,
        body: { logId },
      });
      await loadAttendance();
    } catch (err) {
      alert(err.message || 'Failed to undo attendance');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="data-load-loading">Calculating attendance stats and safe skips…</div>;
  }

  if (error || !data) {
    return (
      <div className="attendance-page">
        <div className="data-load-warning">
          {error || 'Unable to load attendance.'}
          <button type="button" className="button ghost" onClick={loadAttendance}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { overall, subjects = [], message, logs = [] } = data;
  const pct = overall.percentage;
  const statusClass = pct >= target ? 'safe' : pct >= target - 10 ? 'warning' : 'critical';

  // SVG circular calculations (radius = 64, circumference ≈ 402)
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <section className="attendance-page">
      {/* Header */}
      <div className="attendance-header">
        <div>
          <p className="eyebrow" style={{ color: '#ec4899' }}>ATTENDANCE AUTOMATION</p>
          <h1>Attendance & Safe Skips</h1>
          <p>Real-time calculation synced with your class timetable and attendance register.</p>
        </div>

        <div className="header-action-group">
          {onNavigateToTimetable && (
            <button type="button" className="button secondary" onClick={onNavigateToTimetable}>
              <Clock size={15} /> View Class Timetable
            </button>
          )}
          {logs.length > 0 && (
            <button
              type="button"
              className="button ghost"
              onClick={() => handleUndo(logs[0]?.id)}
              disabled={actionLoading}
              title="Undo most recent attendance action"
            >
              <RotateCcw size={15} /> Undo Last ({logs[0]?.status === 'p' ? 'Present' : logs[0]?.status === 'a' ? 'Absent' : 'Cancelled'})
            </button>
          )}
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="attendance-hero-card">
        {/* Left Progress Wheel */}
        <div className="hero-progress-wheel">
          <div className="progress-circle-wrapper">
            <svg viewBox="0 0 160 160" className="circular-chart">
              <defs>
                <linearGradient id="gradientPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
              <circle
                className="circle-bg"
                cx="80"
                cy="80"
                r={radius}
              />
              <circle
                className={`circle ${statusClass}`}
                cx="80"
                cy="80"
                r={radius}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div className="progress-center-text">
              <span className="pct-number">{pct}%</span>
              <span className="pct-label">{statusClass}</span>
            </div>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem' }}>
            {overall.held > 0 ? `${overall.attended} attended of ${overall.held} held` : 'No classes held yet'}
          </span>
        </div>

        {/* Right Stats & Motivational Message */}
        <div className="hero-stats-content">
          {/* Friendly Message */}
          <div className="hero-friendly-message">
            <Sparkles size={22} color="#ec4899" style={{ flexShrink: 0 }} />
            <p>{message}</p>
          </div>

          {/* Target Selector */}
          <div className="target-selector-row">
            <span>Target Goal:</span>
            {[65, 75, 80].map((t) => (
              <button
                key={t}
                type="button"
                className={`target-pill-btn ${target === t ? 'active' : ''}`}
                onClick={() => handleTargetChange(t)}
              >
                {t}% {t === 75 && '★ Minimum'}
              </button>
            ))}
            <button
              type="button"
              className={`target-pill-btn ${![65, 75, 80].includes(target) ? 'active' : ''}`}
              onClick={() => {
                const custom = window.prompt('Enter your custom target percentage (1–100):', String(target));
                if (custom && !isNaN(Number(custom))) {
                  handleTargetChange(Number(custom));
                }
              }}
            >
              {![65, 75, 80].includes(target) ? `${target}% Custom` : 'Custom…'}
            </button>
          </div>

          {/* Quick Counter Boxes */}
          <div className="attendance-counters-row">
            <div className="counter-box">
              <small>Attended</small>
              <strong style={{ color: '#059669' }}>{overall.attended}</strong>
            </div>
            <div className="counter-box">
              <small>Absent</small>
              <strong style={{ color: '#e11d48' }}>{overall.absent}</strong>
            </div>
            <div className="counter-box">
              <small>Cancelled / Off</small>
              <strong style={{ color: '#64748b' }}>{overall.cancelled}</strong>
            </div>
            <div className="counter-box">
              <small>{overall.safeSkips > 0 ? 'Safe Skips' : 'Classes Needed'}</small>
              <strong style={{ color: overall.safeSkips > 0 ? '#0284c7' : '#d97706' }}>
                {overall.safeSkips > 0 ? overall.safeSkips : overall.classesNeeded}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Enrolled Subjects Section */}
      <div className="subjects-section-heading">
        <h2>Subject Breakdown ({subjects.length})</h2>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
          Automatically linked to your active section timetable
        </span>
      </div>

      {subjects.length === 0 ? (
        <div className="team-empty" style={{ background: '#ffffff', borderRadius: '1.25rem', border: '1px solid #f1f5f9', padding: '3.5rem 1rem' }}>
          <BookOpen size={36} color="#94a3b8" />
          <strong>No subjects enrolled yet</strong>
          <p>Import your timetable or add classes to start tracking attendance automatically.</p>
          {onNavigateToTimetable && (
            <button type="button" className="button primary" onClick={onNavigateToTimetable}>
              Set Up Class Timetable
            </button>
          )}
        </div>
      ) : (
        <div className="subject-cards-grid">
          {subjects.map((sub) => {
            const subPct = sub.percentage;
            const subStatus = subPct >= target ? 'safe' : subPct >= target - 10 ? 'warning' : 'critical';

            return (
              <article key={sub.id} className="attendance-subject-card">
                <div className="subject-card-header">
                  <div className="subject-title-area">
                    <h3>{sub.name}</h3>
                    <div className="subject-badge-row">
                      {sub.code && <span className="subject-code-pill">{sub.code}</span>}
                      <span className={`type-tag ${String(sub.type).toLowerCase()}`}>
                        {sub.type}
                      </span>
                    </div>
                  </div>
                  <span className={`pct-badge ${subStatus}`}>
                    {subPct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="subject-progress-track">
                  <div
                    className={`subject-progress-bar ${subStatus}`}
                    style={{ width: `${Math.min(subPct, 100)}%` }}
                  />
                </div>

                {/* Attended / Held count */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>{sub.attended} attended / {sub.held} total held</span>
                  <span>{sub.absent} missed</span>
                </div>

                {/* Safe skips / classes needed callout */}
                {sub.safeSkips > 0 ? (
                  <div className="safe-skips-callout safe">
                    <CheckCircle2 size={16} />
                    <span>{sub.safeSkips} safe skips remaining</span>
                  </div>
                ) : sub.classesNeeded > 0 ? (
                  <div className="safe-skips-callout needed">
                    <AlertTriangle size={16} />
                    <span>Attend {sub.classesNeeded} more in a row to reach {target}%</span>
                  </div>
                ) : (
                  <div className="safe-skips-callout" style={{ background: '#f8fafc', color: '#64748b' }}>
                    <span>Right at target threshold ({target}%)</span>
                  </div>
                )}

                {/* Attendance Marking Buttons */}
                <div className="attendance-actions-row">
                  <button
                    type="button"
                    className="mark-btn present"
                    onClick={() => handleMark(sub.name, 'PRESENT')}
                    disabled={actionLoading}
                    title="Mark class attended"
                  >
                    <Plus size={14} /> Present
                  </button>
                  <button
                    type="button"
                    className="mark-btn absent"
                    onClick={() => handleMark(sub.name, 'ABSENT')}
                    disabled={actionLoading}
                    title="Mark class missed"
                  >
                    <Plus size={14} /> Absent
                  </button>
                  <button
                    type="button"
                    className="mark-btn cancelled"
                    onClick={() => handleMark(sub.name, 'CANCELLED')}
                    disabled={actionLoading}
                    title="Class cancelled or off"
                  >
                    Cancelled
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* History Log Section */}
      {logs.length > 0 && (
        <div style={{ marginTop: '1.5rem', background: '#ffffff', borderRadius: '1.25rem', border: '1px solid #f1f5f9', padding: '1.5rem' }}>
          <strong style={{ fontSize: '1.1rem', color: '#0f172a', display: 'block', marginBottom: '1rem' }}>
            Recent Activity Log
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {logs.slice(0, 8).map((log) => {
              const sub = subjects.find((s) => s.id === log.sid);
              const subName = sub?.name || 'Class';
              const isP = log.status === 'p';
              const isA = log.status === 'a';

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.85rem',
                    background: '#f8fafc',
                    borderRadius: '0.65rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isP ? (
                      <CheckCircle2 size={16} color="#059669" />
                    ) : isA ? (
                      <XCircle size={16} color="#e11d48" />
                    ) : (
                      <Clock size={16} color="#64748b" />
                    )}
                    <strong>{subName}</strong>
                    <span style={{ color: '#64748b' }}>
                      marked {isP ? 'Present' : isA ? 'Absent' : 'Cancelled'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <small style={{ color: '#94a3b8' }}>{log.date}</small>
                    <button
                      type="button"
                      className="icon-danger"
                      onClick={() => handleUndo(log.id)}
                      disabled={actionLoading}
                      title="Undo this log"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
