import React, { useState } from 'react';
import { GraduationCap, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

export default function AcademicOnboardingModal({
  isOpen,
  onClose,
  profile,
  user,
  token,
  onSaved,
}) {
  const initialIdentity = profile?.academicIdentity || {};
  const initialProfile = profile?.profile || {};

  const [formData, setFormData] = useState({
    name: profile?.name || user?.user_metadata?.name || '',
    institution: initialIdentity.institution || initialProfile.institution || '',
    year: initialIdentity.year || '3rd Year',
    department: initialIdentity.branch || initialProfile.department || 'Computer Science & Engineering',
    semester: initialIdentity.semester || initialProfile.semester || '6',
    section: initialIdentity.section || initialProfile.section || 'A',
    rollNumber: initialIdentity.rollNumber || initialProfile.rollNumber || '',
    residency: initialProfile.residency || initialIdentity.residency || 'DAY_SCHOLAR',
    gender: initialIdentity.gender || initialProfile.gender || 'Prefer not to say',
    tonePreference: initialIdentity.tonePreference || 'buddy',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto-suggest tone if gender changes and user hasn't explicitly customized
      if (name === 'gender') {
        if (value === 'Boy') updated.tonePreference = 'bro';
        else if (value === 'Girl') updated.tonePreference = 'baddie';
        else if (value === 'Prefer not to say') updated.tonePreference = 'buddy';
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !user?.id) return;

    if (!formData.section.trim()) {
      setError('Please provide your Section (e.g. A, B, or CSE-1) so your timetable syncs correctly.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiRequest(`/profile/${user.id}`, {
        method: 'PUT',
        token,
        body: {
          name: formData.name,
          institution: formData.institution,
          year: formData.year,
          branch: formData.department,
          department: formData.department,
          semester: formData.semester,
          section: formData.section,
          rollNumber: formData.rollNumber,
          residency: formData.residency,
          gender: formData.gender,
          tonePreference: formData.tonePreference,
        },
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError(err.message || 'Unable to save academic profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCap size={22} color="#0284c7" />
            <h2>Academic Profile & Timetable Setup</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="onboarding-intro-badge">
            <Sparkles size={24} color="#ec4899" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e293b', lineHeight: '1.45' }}>
              Welcome to StudyOS! Set up your academic section and details once to automatically link
              your section's timetable, attendance tracking, and peer collaboration.
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-row">
            <label>
              Full Name
              <input
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Alex Rivera"
              />
            </label>
            <label>
              Roll Number
              <input
                name="rollNumber"
                value={formData.rollNumber}
                onChange={handleChange}
                placeholder="e.g. 22BCE1045"
              />
            </label>
          </div>

          <label>
            College / Institution
            <input
              name="institution"
              required
              value={formData.institution}
              onChange={handleChange}
              placeholder="e.g. Stanford University / Tech Institute"
            />
          </label>

          <div className="form-row">
            <label>
              Department / Branch
              <input
                name="department"
                required
                value={formData.department}
                onChange={handleChange}
                placeholder="e.g. Computer Science & Engineering"
              />
            </label>
            <label>
              Academic Year
              <select name="year" value={formData.year} onChange={handleChange}>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="5th Year">5th Year</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Current Semester
              <select name="semester" value={formData.semester} onChange={handleChange}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={String(sem)}>
                    Semester {sem}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Section
              <input
                name="section"
                required
                value={formData.section}
                onChange={handleChange}
                placeholder="e.g. A, B, or CSE-1"
              />
              <small style={{ color: '#64748b' }}>Used to connect your class timetable</small>
            </label>
          </div>

          <div className="form-row">
            <label>
              Student Category
              <select name="residency" value={formData.residency} onChange={handleChange}>
                <option value="DAY_SCHOLAR">🎒 Day Scholar</option>
                <option value="HOSTELER">🏠 Hostel Resident</option>
              </select>
            </label>
            <label>
              Gender (Optional)
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="Prefer not to say">Prefer not to say</option>
                <option value="Boy">Boy</option>
                <option value="Girl">Girl</option>
                <option value="Another identity">Another identity</option>
              </select>
            </label>
          </div>

          <label>
            Personalized Tone Preference
            <select name="tonePreference" value={formData.tonePreference} onChange={handleChange}>
              <option value="buddy">Buddy (Friendly & encouraging: "Keep going buddy!")</option>
              <option value="bro">Bro (Hustle & casual: "You're golden bro!")</option>
              <option value="baddie">Baddie (Empowering & sharp: "Slaying baddie!")</option>
              <option value="neutral">Neutral (Formal & informative)</option>
            </select>
            <small style={{ color: '#64748b' }}>
              Used in attendance feedback banners and friendly study reminders.
            </small>
          </label>

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={saving}
            >
              Skip for now
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? 'Saving Profile…' : 'Complete Setup & Connect Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
