import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Plus,
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Pencil,
  Trash2,
  CalendarOff,
  Filter,
} from 'lucide-react';
import { apiRequest } from '../lib/api.js';
import TimetableImporterModal from './TimetableImporterModal.jsx';

const DAYS = [
  { id: 1, name: 'Monday', short: 'Mon' },
  { id: 2, name: 'Tuesday', short: 'Tue' },
  { id: 3, name: 'Wednesday', short: 'Wed' },
  { id: 4, name: 'Thursday', short: 'Thu' },
  { id: 5, name: 'Friday', short: 'Fri' },
  { id: 6, name: 'Saturday', short: 'Sat' },
  { id: 7, name: 'Sunday', short: 'Sun' },
];

export default function TimetablePage({
  user,
  profile,
  token,
  onNavigateToAttendance,
}) {
  // Current real day of week: JS Date 0=Sun, 1=Mon ... 6=Sat -> Convert to 1=Mon ... 7=Sun
  const todayDayNum = useMemo(() => {
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 7 : jsDay;
  }, []);

  const [selectedDay, setSelectedDay] = useState(todayDayNum);
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week'
  const [timetable, setTimetable] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [sections, setSections] = useState([]);
  const [currentSection, setCurrentSection] = useState(
    profile?.academicIdentity?.section || profile?.profile?.section || 'A'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [isCR, setIsCR] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  // Check CR / Developer status
  useEffect(() => {
    const role = (user?.role || profile?.role || 'STUDENT').toUpperCase();
    const dev = role === 'DEVELOPER';
    const cr = role === 'CR' || dev;
    setIsDeveloper(dev);
    setIsCR(cr);
  }, [user, profile]);

  // Load sections list
  useEffect(() => {
    if (!token) return;
    apiRequest('/timetable/sections', { token })
      .then((data) => {
        if (data.sections?.length) setSections(data.sections);
      })
      .catch((err) => console.warn('Could not load sections:', err));
  }, [token]);

  // Load timetable for current section
  const loadTimetable = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest(`/timetable?section=${encodeURIComponent(currentSection)}`, { token });
      setTimetable(data.timetable || []);
      setHolidays(data.holidays || []);
      if (data.isCR !== undefined) setIsCR(data.isCR);
      if (data.isDeveloper !== undefined) setIsDeveloper(data.isDeveloper);
    } catch (err) {
      console.error('Failed to load timetable:', err);
      setError('Could not load timetable for this section. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimetable();
  }, [currentSection, token]);

  // Filter entries for selected day or entire week
  const dayEntries = useMemo(() => {
    return timetable.filter((item) => Number(item.dayOfWeek) === selectedDay);
  }, [timetable, selectedDay]);

  // Check today's holiday
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const todayHoliday = useMemo(() => {
    return holidays.find((h) => h.date === todayDateStr);
  }, [holidays, todayDateStr]);

  // Count cancelled classes today
  const cancelledCount = useMemo(() => {
    return dayEntries.filter((e) => e.status === 'CANCELLED').length;
  }, [dayEntries]);

  // CR / Dev Actions
  const toggleCancellation = async (entry) => {
    const newStatus = entry.status === 'CANCELLED' ? 'ACTIVE' : 'CANCELLED';
    const note =
      newStatus === 'CANCELLED'
        ? window.prompt('Optional cancellation reason (e.g. Faculty on leave, Tech fest):') || ''
        : '';

    try {
      await apiRequest(`/timetable/${entry.id}`, {
        method: 'PATCH',
        token,
        body: { status: newStatus, notes: note },
      });
      setTimetable((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, status: newStatus, notes: note } : item))
      );
    } catch (err) {
      alert(err.message || 'Failed to update class status');
    }
  };

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Delete this class from the timetable?')) return;
    try {
      await apiRequest(`/timetable/${entryId}`, {
        method: 'DELETE',
        token,
      });
      setTimetable((prev) => prev.filter((item) => item.id !== entryId));
    } catch (err) {
      alert(err.message || 'Failed to delete class');
    }
  };

  const handleSaveClass = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      section: currentSection,
      dayOfWeek: Number(form.get('dayOfWeek')),
      startTime: form.get('startTime'),
      endTime: form.get('endTime'),
      subjectName: form.get('subjectName'),
      subjectCode: form.get('subjectCode'),
      roomNumber: form.get('roomNumber'),
      type: form.get('type') || 'Lecture',
      faculty: form.get('faculty'),
    };

    try {
      if (editingEntry) {
        await apiRequest(`/timetable/${editingEntry.id}`, {
          method: 'PATCH',
          token,
          body: payload,
        });
        setTimetable((prev) =>
          prev.map((item) => (item.id === editingEntry.id ? { ...item, ...payload } : item))
        );
      } else {
        const res = await apiRequest('/timetable/entry', {
          method: 'POST',
          token,
          body: payload,
        });
        if (res.entry) {
          setTimetable((prev) => [...prev, res.entry]);
        }
      }
      setShowAddModal(false);
      setEditingEntry(null);
    } catch (err) {
      alert(err.message || 'Failed to save class');
    }
  };

  return (
    <section className="timetable-page">
      {/* Top Header */}
      <div className="timetable-header">
        <div>
          <p className="eyebrow" style={{ color: '#0284c7' }}>ACADEMIC SCHEDULE</p>
          <h1>Class Timetable</h1>
          <p>Live schedule with class locations, type indicators, and real-time cancellation alerts.</p>
        </div>

        <div className="header-action-group">
          {/* Section Picker */}
          <div className="section-pill-selector">
            <Filter size={15} color="#64748b" />
            <span>Section</span>
            <select
              value={currentSection}
              onChange={(e) => setCurrentSection(e.target.value)}
              aria-label="Select section"
            >
              {sections.length > 0 ? (
                sections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))
              ) : (
                <>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="CSE-1">Section CSE-1</option>
                </>
              )}
            </select>
          </div>

          {/* CR / Developer Action Buttons */}
          {isCR && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => setIsImporterOpen(true)}
                title="Import timetable from CSV or Excel"
              >
                <Upload size={15} /> Import Timetable
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setEditingEntry(null);
                  setShowAddModal(true);
                }}
              >
                <Plus size={15} /> Add Class
              </button>
            </>
          )}
        </div>
      </div>

      {/* Exception Banner: Holiday or Cancellations */}
      {todayHoliday && (
        <div className="exception-banner">
          <div className="exception-banner-content">
            <CalendarOff size={20} color="#b45309" />
            <div>
              <strong>College Closed · {todayHoliday.title}</strong>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                {todayHoliday.description || 'Classes are officially suspended today.'}
              </p>
            </div>
          </div>
          <span className="type-pill" style={{ background: '#fef3c7', color: '#92400e' }}>
            Holiday
          </span>
        </div>
      )}

      {cancelledCount > 0 && (
        <div className="exception-banner" style={{ background: '#fef2f2', borderColor: '#fecdd3', color: '#9f1239' }}>
          <div className="exception-banner-content">
            <AlertCircle size={20} color="#e11d48" />
            <div>
              <strong>
                {cancelledCount} {cancelledCount === 1 ? 'class has' : 'classes have'} been cancelled for {DAYS.find((d) => d.id === selectedDay)?.name}
              </strong>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
                Cancelled classes do not count against your safe skips in attendance calculation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Day Selector Strip */}
      <div className="day-selector-bar">
        {DAYS.map((day) => {
          const isToday = day.id === todayDayNum;
          const isSelected = day.id === selectedDay;
          const count = timetable.filter((item) => Number(item.dayOfWeek) === day.id).length;

          return (
            <button
              key={day.id}
              type="button"
              className={`day-pill-btn ${isSelected ? 'active' : ''} ${isToday ? 'is-today' : ''}`}
              onClick={() => setSelectedDay(day.id)}
            >
              <span>{day.short}</span>
              <small>{count} {count === 1 ? 'class' : 'classes'}</small>
              {isToday && <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Today</span>}
            </button>
          );
        })}
      </div>

      {/* Classes Grid */}
      {loading ? (
        <div className="data-load-loading">Loading schedule for Section {currentSection}…</div>
      ) : error ? (
        <div className="data-load-warning">{error}</div>
      ) : dayEntries.length === 0 ? (
        <div className="team-empty" style={{ background: '#ffffff', borderRadius: '1.25rem', border: '1px solid #f1f5f9', padding: '3.5rem 1rem' }}>
          <CalendarIcon size={36} color="#94a3b8" />
          <strong>No classes scheduled for {DAYS.find((d) => d.id === selectedDay)?.name}</strong>
          <p>Enjoy your free day or prepare your projects and notes.</p>
          {isCR && (
            <button
              type="button"
              className="button primary"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setIsImporterOpen(true)}
            >
              <Upload size={15} /> Import Timetable for Section {currentSection}
            </button>
          )}
        </div>
      ) : (
        <div className="classes-list">
          {dayEntries.map((item) => {
            const isCancelled = item.status === 'CANCELLED';
            const typeLower = String(item.type || 'lecture').toLowerCase();

            return (
              <article key={item.id} className={`timetable-card ${isCancelled ? 'is-cancelled' : ''}`}>
                <div className="card-top-meta">
                  <span className="time-badge">
                    <Clock size={13} /> {item.startTime} – {item.endTime}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span className={`type-tag ${typeLower}`}>
                      {item.type || 'Lecture'}
                    </span>
                    {isCancelled && (
                      <span className="type-tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>

                <div className="subject-details">
                  <h3>{item.subjectName}</h3>
                  {item.subjectCode && (
                    <span className="subject-code-pill">{item.subjectCode}</span>
                  )}
                  {item.notes && (
                    <p style={{ fontSize: '0.8rem', color: '#e11d48', marginTop: '4px' }}>
                      Notice: {item.notes}
                    </p>
                  )}
                </div>

                <div className="card-footer-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.roomNumber ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={13} color="#0284c7" /> {item.roomNumber}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Room unassigned</span>
                    )}
                    {item.faculty && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={13} color="#64748b" /> {item.faculty}
                      </span>
                    )}
                  </div>

                  {isCR && (
                    <div className="card-cr-actions">
                      <button
                        type="button"
                        className="button ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => toggleCancellation(item)}
                        title={isCancelled ? 'Mark class active' : 'Cancel class for this day'}
                      >
                        {isCancelled ? 'Reactivate' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => {
                          setEditingEntry(item);
                          setShowAddModal(true);
                        }}
                        title="Edit class details"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-danger"
                        onClick={() => deleteEntry(item.id)}
                        title="Delete class"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Universal CSV / Excel Importer Modal */}
      <TimetableImporterModal
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onSuccess={() => {
          loadTimetable();
          alert('Timetable imported and published successfully!');
        }}
        currentSection={currentSection}
        availableSections={sections}
        isDeveloper={isDeveloper}
        token={token}
      />

      {/* Add / Edit Class Modal */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h2>{editingEntry ? 'Edit Class Entry' : 'Add Class to Timetable'}</h2>
              <button type="button" className="close-button" onClick={() => setShowAddModal(false)}>
                &times;
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveClass}>
              <div className="form-row">
                <label>
                  Day of Week
                  <select name="dayOfWeek" defaultValue={editingEntry?.dayOfWeek || selectedDay}>
                    {DAYS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Class Type
                  <select name="type" defaultValue={editingEntry?.type || 'Lecture'}>
                    <option value="Lecture">Lecture</option>
                    <option value="Practical">Practical / Lab</option>
                    <option value="Tutorial">Tutorial</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Start Time
                  <input
                    name="startTime"
                    type="time"
                    required
                    defaultValue={editingEntry?.startTime || '09:00'}
                  />
                </label>
                <label>
                  End Time
                  <input
                    name="endTime"
                    type="time"
                    required
                    defaultValue={editingEntry?.endTime || '10:00'}
                  />
                </label>
              </div>

              <label>
                Subject Name
                <input
                  name="subjectName"
                  required
                  placeholder="e.g. Design & Analysis of Algorithms"
                  defaultValue={editingEntry?.subjectName || ''}
                />
              </label>

              <div className="form-row">
                <label>
                  Subject Code
                  <input
                    name="subjectCode"
                    placeholder="e.g. CS401"
                    defaultValue={editingEntry?.subjectCode || ''}
                  />
                </label>
                <label>
                  Room / Venue
                  <input
                    name="roomNumber"
                    placeholder="e.g. Hall 301 / Lab 2"
                    defaultValue={editingEntry?.roomNumber || ''}
                  />
                </label>
              </div>

              <label>
                Faculty / Professor (optional)
                <input
                  name="faculty"
                  placeholder="e.g. Dr. Roy"
                  defaultValue={editingEntry?.faculty || ''}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary">
                  {editingEntry ? 'Save Changes' : 'Add Class'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

