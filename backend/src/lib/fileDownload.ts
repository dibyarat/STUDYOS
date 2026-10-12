import { Response } from 'express';
import { buildCleanPreviewUrl } from './cloudinary';

/**
 * Streams an authorized file download to the response with RFC 5987 / RFC 6266
 * Content-Disposition headers. This guarantees the user's browser saves the file
 * with its authoritative original name, regardless of spaces, Unicode, punctuation,
 * and without exposing raw storage provider transformations.
 */
export async function streamAuthorizedDownload(
  res: Response,
  fileUrl: string,
  fileName: string,
  mimeType?: string
): Promise<void> {
  const cleanUrl = buildCleanPreviewUrl(fileUrl);
  if (!cleanUrl) {
    res.status(404).json({ error: 'File URL not available' });
    return;
  }

  const safeAscii = (fileName || 'download').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const utf8Filename = encodeURIComponent(fileName || 'download').replace(/['()]/g, escape).replace(/\*/g, '%2A');

  try {
    const upstreamRes = await fetch(cleanUrl);
    if (!upstreamRes.ok) {
      console.error(`Failed to fetch file from storage: ${upstreamRes.status} ${upstreamRes.statusText}`);
      res.status(upstreamRes.status).json({ error: 'Storage provider error retrieving file' });
      return;
    }

    const contentType = mimeType || upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${utf8Filename}`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (!upstreamRes.body) {
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buffer);
      return;
    }

    const reader = upstreamRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(Buffer.from(value));
    }
  } catch (error) {
    console.error('Error streaming download:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
}
