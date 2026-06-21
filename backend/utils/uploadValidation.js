const imageUploadTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentUploadTypes = new Set([...imageUploadTypes, 'application/pdf']);
const fileExtensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function detectedMimeType(buffer = Buffer.alloc(0)) {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  ) {
    return 'image/webp';
  }
  return '';
}

function ensureAllowedFile(file, allowedTypes, label) {
  if (!allowedTypes.has(file.mimetype)) {
    const err = new Error(`${label} file type is not supported`);
    err.status = 415;
    throw err;
  }

  if (detectedMimeType(file.buffer) !== file.mimetype) {
    const err = new Error(`${label} file contents do not match the declared file type`);
    err.status = 415;
    throw err;
  }
}

module.exports = {
  documentUploadTypes,
  ensureAllowedFile,
  fileExtensions,
  imageUploadTypes
};
