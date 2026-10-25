import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File,
  AlertCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export default function FileViewerModal({ file, onClose, onDownload }) {
  const [loadingContent, setLoadingContent] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [csvRows, setCsvRows] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const fileName = file?.fileName || 'document';
  const fileUrl = file?.url || file?.previewUrl;
  const fileSizeMb = file?.fileSize ? (file.fileSize / (1024 * 1024)).toFixed(2) : null;

  const ext = useMemo(() => {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.substring(dot).toLowerCase() : '';
  }, [fileName]);

  const fileCategory = useMemo(() => {
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'IMAGE';
    if (ext === '.pdf') return 'PDF';
    if (['.txt', '.md', '.markdown', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py', '.c', '.cpp', '.java', '.sql'].includes(ext)) return 'TEXT';
    if (ext === '.csv') return 'CSV';
    if (['.doc', '.docx'].includes(ext)) return 'DOC';
    if (['.xls', '.xlsx'].includes(ext)) return 'SPREADSHEET';
    if (['.ppt', '.pptx'].includes(ext)) return 'PRESENTATION';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'ARCHIVE';
    return 'OTHER';
  }, [ext]);

  // Load text or CSV content
  useEffect(() => {
    let active = true;
    if ((fileCategory === 'TEXT' || fileCategory === 'CSV') && fileUrl) {
      setLoadingContent(true);
      setPreviewError(null);
      fetch(fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch file content`);
          return res.text();
        })
        .then((text) => {
          if (!active) return;
          if (fileCategory === 'CSV') {
            const lines = text.trim().split(/\r?\n/).slice(0, 100);
            const parsed = lines.map((line) => {
              // Basic CSV split accounting for quotes
              return line.split(',').map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
            });
            setCsvRows(parsed);
          } else {
            setTextContent(text);
          }
        })
        .catch((err) => {
          if (active) {
            console.error('Failed to load text preview:', err);
            setPreviewError('Unable to render inline text preview. Please use the download option.');
          }
        })
        .finally(() => {
          if (active) setLoadingContent(false);
        });
    }
    return () => {
      active = false;
    };
  }, [fileUrl, fileCategory]);

  const modalElement = (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content file-viewer-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-viewer-title"
      >
        <div className="file-viewer-header">
          <div className="file-viewer-title-group">
            {fileCategory === 'IMAGE' && <ImageIcon size={20} className="file-viewer-icon text-sky" />}
            {fileCategory === 'PDF' && <FileText size={20} className="file-viewer-icon text-rose" />}
            {fileCategory === 'TEXT' && <FileCode size={20} className="file-viewer-icon text-indigo" />}
            {fileCategory === 'CSV' && <FileSpreadsheet size={20} className="file-viewer-icon text-emerald" />}
            {fileCategory === 'DOC' && <FileText size={20} className="file-viewer-icon text-blue" />}
            {fileCategory === 'SPREADSHEET' && <FileSpreadsheet size={20} className="file-viewer-icon text-emerald" />}
            {fileCategory === 'ARCHIVE' && <FileArchive size={20} className="file-viewer-icon text-amber" />}
            {['PRESENTATION', 'OTHER'].includes(fileCategory) && <File size={20} className="file-viewer-icon text-slate" />}

            <div>
              <h3 id="file-viewer-title" className="file-viewer-filename" title={fileName}>
                {fileName}
              </h3>
              <div className="file-viewer-meta">
                {fileSizeMb && <span className="file-meta-pill">{fileSizeMb} MB</span>}
                <span className="file-meta-pill">{ext ? ext.toUpperCase().slice(1) : 'FILE'}</span>
                {file?.mimeType && <span className="file-meta-pill file-mime">{file.mimeType}</span>}
              </div>
            </div>
          </div>

          <div className="file-viewer-actions">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button ghost small"
                title="Open in new window"
              >
                <ExternalLink size={14} /> Open raw
              </a>
            )}
            <button
              type="button"
              className="button primary small"
              onClick={() => onDownload(file)}
              title="Download file to device"
            >
              <Download size={14} /> Download
            </button>
            <button
              type="button"
              className="button ghost icon-only"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="file-viewer-body">
          {previewError ? (
            <div className="file-viewer-error-box">
              <AlertCircle size={36} className="text-rose" />
              <h4>Preview not available</h4>
              <p>{previewError}</p>
              <div className="file-viewer-error-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onDownload(file)}
                >
                  <Download size={14} /> Download {fileName}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setPreviewError(null);
                    setTextContent(null);
                    setCsvRows(null);
                  }}
                >
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          ) : loadingContent ? (
            <div className="file-viewer-loading">
              <Loader2 size={32} className="spin-animation text-sky" />
              <p>Loading file preview...</p>
            </div>
          ) : fileCategory === 'IMAGE' ? (
            <div className="file-viewer-image-container">
              <img
                src={fileUrl}
                alt={fileName}
                className="file-viewer-image"
                onError={() => setPreviewError('Image could not be rendered inline. Please download to view.')}
              />
            </div>
          ) : fileCategory === 'PDF' ? (
            <div className="file-viewer-pdf-container">
              <iframe
                src={`${fileUrl}#toolbar=1&navpanes=0`}
                title={fileName}
                className="file-viewer-iframe"
              />
            </div>
          ) : fileCategory === 'TEXT' ? (
            <div className="file-viewer-text-container">
              <pre className="file-viewer-code">
                <code>{textContent || 'No text content found.'}</code>
              </pre>
            </div>
          ) : fileCategory === 'CSV' ? (
            <div className="file-viewer-table-container">
              {csvRows && csvRows.length > 0 ? (
                <table className="file-viewer-table">
                  <thead>
                    <tr>
                      {csvRows[0].map((cell, idx) => (
                        <th key={idx}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(1).map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-message">No rows found in this spreadsheet.</p>
              )}
            </div>
          ) : (
            <div className="file-viewer-fallback-card">
              <div className="file-fallback-icon-wrap">
                {fileCategory === 'DOC' && <FileText size={48} className="text-blue" />}
                {fileCategory === 'SPREADSHEET' && <FileSpreadsheet size={48} className="text-emerald" />}
                {fileCategory === 'ARCHIVE' && <FileArchive size={48} className="text-amber" />}
                {!['DOC', 'SPREADSHEET', 'ARCHIVE'].includes(fileCategory) && <File size={48} className="text-slate" />}
              </div>
              <h4>{fileName}</h4>
              <p className="file-fallback-desc">
                {fileCategory === 'DOC' && 'Microsoft Word documents are best viewed locally or in desktop office software.'}
                {fileCategory === 'SPREADSHEET' && 'Excel spreadsheets cannot be parsed natively in this preview.'}
                {fileCategory === 'ARCHIVE' && 'Compressed archive files (ZIP, RAR) must be downloaded and extracted on your computer.'}
                {fileCategory === 'PRESENTATION' && 'PowerPoint presentations must be opened in dedicated presentation software.'}
                {fileCategory === 'OTHER' && 'This file format is available for direct download.'}
              </p>
              <div className="file-fallback-info">
                <span><strong>File name:</strong> {fileName}</span>
                {fileSizeMb && <span><strong>Size:</strong> {fileSizeMb} MB</span>}
                {file?.mimeType && <span><strong>MIME type:</strong> {file.mimeType}</span>}
              </div>
              <button
                type="button"
                className="button primary large-download-btn"
                onClick={() => onDownload(file)}
              >
                <Download size={16} /> Download {fileName}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalElement, document.body) : modalElement;
}

