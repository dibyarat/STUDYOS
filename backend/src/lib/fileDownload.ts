import { Response } from 'express';
import { buildCleanPreviewUrl, buildAttachmentUrl } from './cloudinary';

/**
 * Streams an authorized file download or inline preview to the response with RFC 5987 / RFC 6266
 * Content-Disposition headers. This guarantees the user's browser saves or previews the file
 * with its authoritative original name, regardless of spaces, Unicode, punctuation,
 * and without exposing raw storage provider transformations or hitting ACL blocks.
 */
export async function streamAuthorizedDownload(
  res: Response,
  fileUrl: string,
  fileName: string,
  mimeType?: string,
  disposition: 'attachment' | 'inline' = 'attachment'
): Promise<void> {
  const cleanUrl = buildCleanPreviewUrl(fileUrl);
  if (!cleanUrl) {
    res.status(404).json({ error: 'File URL not available' });
    return;
  }

  const safeAscii = (fileName || 'download').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const utf8Filename = encodeURIComponent(fileName || 'download').replace(/['()]/g, escape).replace(/\*/g, '%2A');

  try {
    let upstreamRes = await fetch(cleanUrl);

    // If Cloudinary returns 401 (deny/ACL) or 404, retry using authenticated download url
    if (!upstreamRes.ok && cleanUrl.includes('res.cloudinary.com')) {
      const signedUrl = buildAttachmentUrl(fileUrl, fileName);
      if (signedUrl && signedUrl !== cleanUrl) {
        try {
          const retryRes = await fetch(signedUrl);
          if (retryRes.ok) {
            upstreamRes = retryRes;
          }
        } catch {}
      }
    }

    if (!upstreamRes.ok) {
      console.error(`Failed to fetch file from storage: ${upstreamRes.status} ${upstreamRes.statusText}`);
      res.status(upstreamRes.status).json({ error: 'Storage provider error retrieving file' });
      return;
    }

    const contentType = mimeType || upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${utf8Filename}`);
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
