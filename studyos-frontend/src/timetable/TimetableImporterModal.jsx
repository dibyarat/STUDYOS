import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, X, HelpCircle } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

const DAYS_MAP = {
  'monday': 1, 'mon': 1, 'm': 1, '1': 1,
  'tuesday': 2, 'tue': 2, 't': 2, '2': 2,
  'wednesday': 3, 'wed': 3, 'w': 3, '3': 3,
  'thursday': 4, 'thu': 4, 'th': 4, '4': 4,
  'friday': 5, 'fri': 5, 'f': 5, '5': 5,
  'saturday': 6, 'sat': 6, 's': 6, '6': 6,
  'sunday': 7, 'sun': 7, 'su': 7, '7': 7,
};

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetableImporterModal({
  isOpen,
  onClose,
  onSuccess,
  currentSection,
  availableSections = [],
  isDeveloper = false,
  token,
}) {
  const [file, setFile] = useState(null);
  const [targetSection, setTargetSection] = useState(currentSection || 'A');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [parsedEntries, setParsedEntries] = useState([]);
  const [formatMode, setFormatMode] = useState('auto'); // 'row' | 'grid'
  const [columnMap, setColumnMap] = useState({
    day: '',
    time: '',
    startTime: '',
    endTime: '',
    subject: '',
    code: '',
    room: '',
    type: '',
    faculty: '',
  });
  const [step, setStep] = useState(1); // 1 = Upload, 2 = Map & Preview
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Process uploaded file
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setError('');
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!jsonData || jsonData.length === 0) {
          setError('The uploaded spreadsheet appears to be empty.');
          return;
        }

        processSheetData(jsonData);
      } catch (err) {
        console.error('Error parsing spreadsheet:', err);
        setError('Failed to parse spreadsheet. Please ensure it is a valid .csv, .xlsx, or .xls file.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Detect whether format is grid or row-wise
  const processSheetData = (rows) => {
    // Filter out completely empty rows
    const nonEmptyRows = rows.filter((r) => r && r.some((c) => String(c).trim() !== ''));
    if (nonEmptyRows.length === 0) {
      setError('No data found in spreadsheet.');
      return;
    }

    setRawRows(nonEmptyRows);

    // Check if row 0 (or row 1) has days as columns (Grid Format)
    let headerRowIndex = 0;
    let foundDaysInHeader = 0;

    for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
      const row = nonEmptyRows[i];
      let dayHits = 0;
      row.forEach((cell) => {
        const val = String(cell).trim().toLowerCase();
        if (DAYS_MAP[val]) dayHits++;
      });
      if (dayHits >= 3) {
        headerRowIndex = i;
        foundDaysInHeader = dayHits;
        break;
      }
    }

    if (foundDaysInHeader >= 3) {
      // Grid Matrix Format detected
      setFormatMode('grid');
      parseGridFormat(nonEmptyRows, headerRowIndex);
    } else {
      // Row-wise format detected
      setFormatMode('row');
      parseRowFormat(nonEmptyRows);
    }

    setStep(2);
  };

  // Parse Grid Format (Time on rows, Days on columns)
  const parseGridFormat = (rows, headerIdx) => {
    const headerRow = rows[headerIdx];
    const dayColIndices = [];

    headerRow.forEach((cell, idx) => {
      const val = String(cell).trim().toLowerCase();
      if (DAYS_MAP[val]) {
        dayColIndices.push({ colIndex: idx, dayNum: DAYS_MAP[val], name: cell });
      }
    });

    const entries = [];
    // Rows after header
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      // Usually col 0 or 1 contains the Time Slot (e.g., "09:00 - 10:00")
      const timeCell = String(row[0] || row[1] || '').trim();
      const { start, end } = extractTimeRange(timeCell);

      dayColIndices.forEach(({ colIndex, dayNum }) => {
        const cellContent = String(row[colIndex] || '').trim();
        if (!cellContent || cellContent.toLowerCase() === 'lunch' || cellContent.toLowerCase() === 'break') {
          return;
        }

        // Parse cell content (e.g. "Data Structures (CS301) \n Room 402 - Prof. Sharma")
        const details = extractSubjectAndRoom(cellContent);
        entries.push({
          dayOfWeek: dayNum,
          dayName: DAY_NAMES[dayNum],
          startTime: start || '09:00',
          endTime: end || '10:00',
          subjectName: details.subjectName,
          subjectCode: details.subjectCode,
          roomNumber: details.roomNumber,
          type: details.type,
          faculty: details.faculty,
        });
      });
    }

    setParsedEntries(entries);
  };

  // Parse Row-wise Format
  const parseRowFormat = (rows) => {
    // Find first non-empty row as header
    const headerRow = rows[0];
    const detectedHeaders = headerRow.map((c, i) => String(c).trim() || `Column ${i + 1}`);
    setHeaders(detectedHeaders);

    // Auto-map columns
    const initialMap = {
      day: '',
      time: '',
      startTime: '',
      endTime: '',
      subject: '',
      code: '',
      room: '',
      type: '',
      faculty: '',
    };

    detectedHeaders.forEach((h) => {
      const lower = h.toLowerCase();
      if (lower.includes('day')) initialMap.day = h;
      else if (lower.includes('start') || lower.includes('from')) initialMap.startTime = h;
      else if (lower.includes('end') || lower.includes('to')) initialMap.endTime = h;
      else if (lower.includes('time') || lower.includes('slot') || lower.includes('period')) initialMap.time = h;
      else if (lower.includes('code') || lower.includes('sub code') || lower.includes('course code')) initialMap.code = h;
      else if (lower.includes('subject') || lower.includes('course') || lower.includes('title') || lower.includes('class')) initialMap.subject = h;
      else if (lower.includes('room') || lower.includes('hall') || lower.includes('venue') || lower.includes('lab no')) initialMap.room = h;
      else if (lower.includes('type') || lower.includes('category')) initialMap.type = h;
      else if (lower.includes('faculty') || lower.includes('teacher') || lower.includes('prof') || lower.includes('instructor')) initialMap.faculty = h;
    });

    setColumnMap(initialMap);
    buildEntriesFromRowMap(rows, detectedHeaders, initialMap);
  };

  const buildEntriesFromRowMap = (rows, headerList, map) => {
    const entries = [];
    const getVal = (row, fieldName) => {
      const idx = headerList.indexOf(fieldName);
      return idx !== -1 ? String(row[idx] || '').trim() : '';
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => String(c).trim() === '')) continue;

      // Extract day
      const dayRaw = map.day ? getVal(row, map.day).toLowerCase() : '';
      const dayOfWeek = DAYS_MAP[dayRaw] || 1;

      // Extract time
      let startTime = '09:00';
      let endTime = '10:00';

      if (map.startTime && map.endTime) {
        startTime = normalizeTime(getVal(row, map.startTime)) || '09:00';
        endTime = normalizeTime(getVal(row, map.endTime)) || '10:00';
      } else if (map.time) {
        const timeVal = getVal(row, map.time);
        const extracted = extractTimeRange(timeVal);
        startTime = extracted.start;
        endTime = extracted.end;
      }

      const rawSub = map.subject ? getVal(row, map.subject) : 'General Class';
      const rawCode = map.code ? getVal(row, map.code) : '';
      const rawRoom = map.room ? getVal(row, map.room) : '';
      const rawType = map.type ? getVal(row, map.type) : 'Lecture';
      const rawFaculty = map.faculty ? getVal(row, map.faculty) : '';

      if (!rawSub) continue;

      entries.push({
        dayOfWeek,
        dayName: DAY_NAMES[dayOfWeek],
        startTime,
        endTime,
        subjectName: rawSub,
        subjectCode: rawCode || rawSub.slice(0, 4).toUpperCase(),
        roomNumber: rawRoom,
        type: rawType || (rawSub.toLowerCase().includes('lab') ? 'Practical' : 'Lecture'),
        faculty: rawFaculty,
      });
    }

    setParsedEntries(entries);
  };

  // Helper time extractors
  const extractTimeRange = (str) => {
    const parts = str.split(/[-–—to]/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        start: normalizeTime(parts[0]) || '09:00',
        end: normalizeTime(parts[1]) || '10:00',
      };
    }
    return { start: normalizeTime(parts[0]) || '09:00', end: '10:00' };
  };

  const normalizeTime = (t) => {
    if (!t) return '09:00';
    const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) return t;
    let hours = parseInt(match[1], 10);
    const mins = match[2] ? match[2] : '00';
    const ampm = match[3] ? match[3].toLowerCase() : null;

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${mins}`;
  };

  const extractSubjectAndRoom = (str) => {
    const lines = str.split(/[\n,;]/).map((l) => l.trim()).filter(Boolean);
    let subjectName = lines[0] || 'Class';
    let subjectCode = '';
    let roomNumber = '';
    let faculty = '';
    let type = 'Lecture';

    // Check code in parentheses like "DSA (CS301)"
    const codeMatch = subjectName.match(/\(([^)]+)\)/);
    if (codeMatch) {
      subjectCode = codeMatch[1].trim();
      subjectName = subjectName.replace(/\([^)]+\)/, '').trim();
    }

    if (subjectName.toLowerCase().includes('lab') || subjectName.toLowerCase().includes('practical')) {
      type = 'Practical';
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/room|hall|lh|lab|rm/i.test(line)) {
        roomNumber = line;
      } else if (/prof|dr\.|faculty|mr\.|ms\./i.test(line)) {
        faculty = line;
      }
    }

    return { subjectName, subjectCode, roomNumber, faculty, type };
  };

  // Handle column map change
  const handleMapChange = (key, value) => {
    const newMap = { ...columnMap, [key]: value };
    setColumnMap(newMap);
    buildEntriesFromRowMap(rawRows, headers, newMap);
  };

  // Submit to backend
  const handleSubmit = async () => {
    if (!parsedEntries.length) {
      setError('No valid class entries found to import.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await apiRequest('/timetable/import', {
        method: 'POST',
        token,
        body: {
          section: targetSection,
          entries: parsedEntries,
          replaceExisting,
        },
      });

      if (res.success) {
        onSuccess(res);
        onClose();
      } else {
        throw new Error(res.error || 'Failed to import timetable');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'An error occurred during timetable import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '820px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={22} color="#0284c7" />
            <h2>Universal Timetable Importer</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="importer-modal-content">
          {error && (
            <div className="auth-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <div>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Upload any official college timetable file (<strong>.xlsx, .xls, .csv</strong>). The smart importer
                automatically recognizes row-wise schedules or weekly grid matrices.
              </p>

              <div
                className="dropzone-box"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <UploadCloud size={44} color="#38bdf8" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>
                  Click to choose or drop your timetable file
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '6px' }}>
                  Supports CSV, XLSX, and XLS formats from ERP or faculty
                </p>
              </div>

              <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                <strong style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HelpCircle size={15} /> Supported Format Examples
                </strong>
                <ul style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px', paddingLeft: '1.25rem', lineHeight: '1.5' }}>
                  <li><strong>Row Format:</strong> Columns like Day, Time, Subject, Code, Room, Faculty.</li>
                  <li><strong>Grid Format:</strong> Monday–Saturday headers with time slots running down the rows.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              {/* Target Section & Options */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <label>
                  Target Section
                  <select
                    value={targetSection}
                    onChange={(e) => setTargetSection(e.target.value)}
                    disabled={!isDeveloper && Boolean(currentSection)}
                  >
                    {availableSections.length > 0 ? (
                      availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          Section {sec}
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
                  {!isDeveloper && currentSection && (
                    <small style={{ color: '#64748b' }}>CR assignment locked to Section {currentSection}</small>
                  )}
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                    />
                    <span>Replace existing timetable for this section</span>
                  </label>
                  <small style={{ color: '#64748b', marginLeft: '24px' }}>
                    Deletes current active slots to avoid duplicate collisions.
                  </small>
                </div>
              </div>

              {/* Format indicator & Column Mapping if row-wise */}
              {formatMode === 'row' && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Detected Row Format · Verify Column Mapping:
                  </p>
                  <div className="mapping-controls-grid">
                    <label>
                      Day Column
                      <select value={columnMap.day} onChange={(e) => handleMapChange('day', e.target.value)}>
                        <option value="">-- Select --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>

                    <label>
                      Subject Column
                      <select value={columnMap.subject} onChange={(e) => handleMapChange('subject', e.target.value)}>
                        <option value="">-- Select --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>

                    <label>
                      Time Slot Column
                      <select value={columnMap.time} onChange={(e) => handleMapChange('time', e.target.value)}>
                        <option value="">-- Combined Time --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>

                    <label>
                      Room Column
                      <select value={columnMap.room} onChange={(e) => handleMapChange('room', e.target.value)}>
                        <option value="">-- Optional Room --</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  Parsed Preview ({parsedEntries.length} Classes Found)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> {formatMode === 'grid' ? 'Weekly Matrix Grid' : 'Row-Wise Callset'} Detected
                </span>
              </div>

              <div className="preview-table-container">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time Slot</th>
                      <th>Subject Name</th>
                      <th>Code</th>
                      <th>Room</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedEntries.slice(0, 50).map((entry, idx) => (
                      <tr key={idx}>
                        <td><strong>{entry.dayName}</strong></td>
                        <td>{entry.startTime} – {entry.endTime}</td>
                        <td>{entry.subjectName}</td>
                        <td><code>{entry.subjectCode}</code></td>
                        <td>{entry.roomNumber || '—'}</td>
                        <td>
                          <span className={`type-tag ${entry.type.toLowerCase()}`}>
                            {entry.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedEntries.length > 50 && (
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                  Showing first 50 of {parsedEntries.length} items. All items will be imported.
                </p>
              )}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            {step === 2 && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                Choose Different File
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                type="button"
                className="button primary"
                disabled={isSubmitting || parsedEntries.length === 0}
                onClick={handleSubmit}
              >
                {isSubmitting ? 'Importing Timetable…' : `Publish ${parsedEntries.length} Classes for Section ${targetSection}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

