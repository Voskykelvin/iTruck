const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { isLiveMode } = require('../config/runtime');

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

function configure() {
  if (!isConfigured()) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  return true;
}

async function uploadBuffer(buffer, options = {}) {
  if (!buffer) throw new Error('No file buffer received');

  if (!configure()) {
    if (isLiveMode()) {
      throw new Error('Cloudinary credentials are required for uploads in live mode');
    }

    const id = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
    return `/api/uploads/local/${id}`;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

async function deleteFile(publicId) {
  if (!publicId || !configure()) return { result: 'skipped', publicId };
  return cloudinary.uploader.destroy(publicId);
}

function getThumbnail(publicId) {
  if (!publicId || !configure()) return publicId;
  return cloudinary.url(publicId, { width: 360, height: 240, crop: 'fill', quality: 'auto', fetch_format: 'auto' });
}

module.exports = { uploadBuffer, deleteFile, getThumbnail, isConfigured };
