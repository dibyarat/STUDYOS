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

export function getAuthenticatedCloudinaryUrl(url: string, asAttachment = false, customFileName?: string): string {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) {
    return url;
  }

  try {
    const parts = url.split('/');
    const uploadIndex = parts.findIndex(p => p === 'upload');
    if (uploadIndex === -1) return url;

    const resourceType = (parts[uploadIndex - 1] || 'image') as 'image' | 'video' | 'raw';
    let pathParts = parts.slice(uploadIndex + 1);

    // Skip transformation segments (e.g. s--...--, fl_..., c_scale, etc.) and version (v12345)
    while (pathParts.length > 0 && (
      pathParts[0].startsWith('s--') ||
      pathParts[0].startsWith('fl_') ||
      pathParts[0].includes(',') ||
      (pathParts[0].startsWith('v') && /^v\d+$/.test(pathParts[0]))
    )) {
      pathParts = pathParts.slice(1);
    }

    const fullPath = pathParts.join('/');
    const lastDot = fullPath.lastIndexOf('.');
    let format = '';
    let publicId = fullPath;
    if (lastDot > 0) {
      format = fullPath.substring(lastDot + 1);
      publicId = fullPath.substring(0, lastDot);
    }

    const options: Record<string, any> = {
      resource_type: resourceType,
      type: 'upload',
      // Expire in 24 hours
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    };

    if (asAttachment) {
      options.attachment = customFileName ? customFileName.replace(/[^a-zA-Z0-9._-]/g, '_') : true;
    }

    return cloudinary.utils.private_download_url(publicId, format, options);
  } catch (err) {
    console.error('Failed to generate authenticated Cloudinary URL:', err);
    return url;
  }
}

export function buildCleanPreviewUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  return getAuthenticatedCloudinaryUrl(url, false);
}

export function buildAttachmentUrl(url: string, fileName?: string): string {
  if (!url || typeof url !== 'string') return '';
  return getAuthenticatedCloudinaryUrl(url, true, fileName);
}


