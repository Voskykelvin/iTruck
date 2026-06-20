const express = require('express');
const multer = require('multer');
const asyncHandler = require('../config/asyncHandler');
const { protect } = require('../middleware/auth');
const cloudinary = require('../services/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = express.Router();
const avatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const cargoTypes = new Set([...avatarTypes, 'application/pdf']);
const fileExtensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

router.use(protect);

function ensureAllowedFile(file, allowedTypes, label) {
  if (!allowedTypes.has(file.mimetype)) {
    const err = new Error(`${label} file type is not supported`);
    err.status = 415;
    throw err;
  }

  const buffer = file.buffer || Buffer.alloc(0);
  let detectedType = '';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
    detectedType = 'application/pdf';
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedType = 'image/jpeg';
  } else if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    detectedType = 'image/png';
  } else if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  ) {
    detectedType = 'image/webp';
  }

  if (detectedType !== file.mimetype) {
    const err = new Error(`${label} file contents do not match the declared file type`);
    err.status = 415;
    throw err;
  }
}

router.post(
  '/avatar',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded. Use form-data field "file".' });
    }

    ensureAllowedFile(req.file, avatarTypes, 'Avatar');
    const url = await cloudinary.uploadBuffer(req.file.buffer, {
      folder: 'itruck/avatars',
      localExtension: fileExtensions[req.file.mimetype]
    });
    res.json({ url });
  })
);

router.post(
  '/cargo',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const files = (req.files || []).filter((file) => file && file.buffer);
    if (!files.length) {
      return res.status(400).json({ message: 'No files uploaded. Use form-data field "files".' });
    }

    files.forEach((file) => ensureAllowedFile(file, cargoTypes, 'Cargo'));
    const urls = await Promise.all(
      files.map((file) =>
        cloudinary.uploadBuffer(file.buffer, {
          folder: 'itruck/cargo',
          localExtension: fileExtensions[file.mimetype],
          ...(file.mimetype === 'application/pdf' ? { resource_type: 'raw' } : {})
        })
      )
    );

    res.json({ urls });
  })
);

module.exports = router;
