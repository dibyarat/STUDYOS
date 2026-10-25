import { cloudinary, uploadToCloudinary, deleteFromCloudinary } from './cloudinary';

export class InvalidResourceFileError extends Error {}

export interface UploadedResourceFile {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

const allowedTypes: Record<string, { mimeType: string; signatures?: string[] }> = {
  '.pdf': { mimeType: 'application/pdf', signatures: ['25504446'] },
  '.png': { mimeType: 'image/png', signatures: ['89504e47'] },
  '.jpg': { mimeType: 'image/jpeg', signatures: ['ffd8ff'] },
  '.jpeg': { mimeType: 'image/jpeg', signatures: ['ffd8ff'] },
  '.webp': { mimeType: 'image/webp', signatures: ['52494646'] },
  '.txt': { mimeType: 'text/plain' },
  '.md': { mimeType: 'text/plain' },
  '.doc': { mimeType: 'application/msword', signatures: ['d0cf11e0'] },
  '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signatures: ['504b0304'] },
  '.mp4': { mimeType: 'video/mp4' },
  '.zip': { mimeType: 'application/zip', signatures: ['504b0304'] },
};

function sanitizeFileName(fileName: string): string {
  return fileName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || 'uploaded-file';
}

export function validateResourceFile(file: Express.Multer.File): string {
  if (!file || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new InvalidResourceFileError('File must be larger than zero bytes and no larger than 10 MB');
  }

  const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
  const definition = allowedTypes[extension];
  if (!definition) throw new InvalidResourceFileError('This file type is not supported');

  const reportedMimeType = file.mimetype.toLowerCase();
  const compatibleMimeTypes = new Set([definition.mimeType, 'application/octet-stream']);
  if (extension === '.md') compatibleMimeTypes.add('text/markdown');
  if (extension === '.zip') compatibleMimeTypes.add('application/x-zip-compressed');
  if (!compatibleMimeTypes.has(reportedMimeType)) {
    throw new InvalidResourceFileError('The selected file type does not match its extension');
  }

  if (definition.signatures && !definition.signatures.some((signature) =>
    file.buffer.subarray(0, signature.length / 2).toString('hex').startsWith(signature),
  )) {
    throw new InvalidResourceFileError('The selected file content does not match its file type');
  }

  if (extension === '.webp' && file.buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new InvalidResourceFileError('The selected file is not a valid WebP image');
  }

  if (['.txt', '.md'].includes(extension) && file.buffer.includes(0)) {
    throw new InvalidResourceFileError('Text files cannot contain binary data');
  }

  if (extension === '.mp4' && file.buffer.subarray(4, 8).toString('ascii') !== 'ftyp') {
    throw new InvalidResourceFileError('The selected file is not a valid MP4 video');
  }

  return definition.mimeType;
}

export async function uploadResourceFile(
  userId: string,
  resourceId: string,
  file: Express.Multer.File,
): Promise<UploadedResourceFile> {
  const mimeType = validateResourceFile(file);

  const cleanBase = sanitizeFileName(file.originalname);
  const dotIndex = cleanBase.lastIndexOf('.');
  const baseWithoutExt = dotIndex > 0 ? cleanBase.substring(0, dotIndex) : cleanBase;
  const fileExt = dotIndex > 0 ? cleanBase.substring(dotIndex + 1).toLowerCase() : undefined;

  const result = await uploadToCloudinary(file.buffer, {
    folder: `studyos/${userId}/${resourceId}`,
    public_id: `${Date.now()}_${baseWithoutExt}`,
    format: fileExt,
    resource_type: 'auto',
  });

  return { fileUrl: result.secure_url, fileName: file.originalname, mimeType, fileSize: file.size };
}
