import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export function uploadToCloudinary(buffer: Buffer, options: UploadApiOptions = {}): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        ...options,
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

export function deleteFromCloudinary(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      if (!url.includes('res.cloudinary.com')) {
        return resolve(null);
      }
      
      const parts = url.split('/');
      const uploadIndex = parts.findIndex(p => p === 'upload');
      if (uploadIndex === -1) return resolve(null);
      
      // resource_type is parts[uploadIndex - 1] (e.g., 'image', 'video', 'raw')
      const resourceType = parts[uploadIndex - 1];
      
      // publicId starts after the version (e.g., v12345678)
      const fileWithExtension = parts.slice(uploadIndex + 2).join('/');
      let publicId = fileWithExtension;
      
      // For images and videos, publicId does not include the extension
      if (resourceType !== 'raw') {
        const lastDotIndex = fileWithExtension.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          publicId = fileWithExtension.substring(0, lastDotIndex);
        }
      }
      
      cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function buildCleanPreviewUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  // Strip any accidental fl_attachment segment that may have been baked in
  return url.replace(/\/fl_attachment[^/]*\//g, '/');
}

export function buildAttachmentUrl(url: string, fileName?: string): string {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = buildCleanPreviewUrl(url);
  if (!cleanUrl.includes('res.cloudinary.com')) return cleanUrl;

  // Cloudinary's fl_attachment flag takes an OPTIONAL custom filename, but:
  // 1. It MUST NOT contain file extensions or dots (e.g. .png causes "Invalid flag in transformation: png")
  // 2. It must only contain alphanumeric characters, underscores, and hyphens.
  if (!fileName) {
    return cleanUrl.replace('/upload/', '/upload/fl_attachment/');
  }

  const lastDot = fileName.lastIndexOf('.');
  const baseName = (lastDot > 0 ? fileName.substring(0, lastDot) : fileName).trim();
  const safeBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

  if (!safeBase) {
    return cleanUrl.replace('/upload/', '/upload/fl_attachment/');
  }

  return cleanUrl.replace('/upload/', `/upload/fl_attachment:${safeBase}/`);
}


