import React, { useState, useEffect } from 'react';
import { Clock, Sparkles, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

export default function DashboardAttendanceWidget({ token, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiRequest('/attendance', { token })
      .then((res) => setData(res))
      .catch((err) => console.warn('Could not load attendance widget:', err))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="stat-card" style={{ padding: '1.25rem' }}>
        <div>
          <p>Attendance Tracker</p>
          <strong style={{ fontSize: '1.1rem', color: '#64748b' }}>Loading…</strong>
        </div>
        <span className="stat-icon purple">
          <Clock size={18} />
        </span>
      </div>
    );
  }

  if (!data || !data.overall) {
    return (
      <div className="stat-card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => onNavigate('attendance')}>
        <div>
          <p>Attendance Automation</p>
          <strong style={{ fontSize: '1.1rem' }}>Get Started</strong>
        </div>
        <span className="stat-icon purple">
          <Clock size={18} />
        </span>
      </div>
    );
  }

  const { overall, target, message } = data;
  const isSafe = overall.percentage >= target;

  return (
    <div
      className="dashboard-attendance-widget"
      style={{
        background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.7) 0%, rgba(253, 242, 248, 0.7) 100%)',
        border: '1px solid rgba(224, 242, 254, 0.8)',
      }}
    >
      <div className="widget-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="stat-icon purple" style={{ width: '32px', height: '32px' }}>
            <Clock size={16} />
          </span>
          <div>
            <strong>Attendance Tracker</strong>
            <small style={{ display: 'block', color: '#64748b' }}>Target {target}%</small>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: isSafe ? '#059669' : '#e11d48',
              letterSpacing: '-0.03em',
            }}
          >
            {overall.percentage}%
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#1e293b' }}>
        <Sparkles size={16} color="#ec4899" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{message}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #e2e8f0' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {overall.safeSkips > 0 ? (
            <strong style={{ color: '#0284c7' }}>{overall.safeSkips} safe skips remaining</strong>
          ) : overall.classesNeeded > 0 ? (
            <strong style={{ color: '#d97706' }}>Attend {overall.classesNeeded} more to recover</strong>
          ) : (
            'Right on target'
          )}
        </span>
        <button
          type="button"
          className="button ghost"
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#0284c7' }}
          onClick={() => onNavigate('attendance')}
        >
          View Attendance <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
