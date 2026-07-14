const express = require('express');
const multer = require('multer');
const asyncHandler = require('../config/asyncHandler');
const { protect } = require('../middleware/auth');
const cloudinary = require('../services/cloudinary');
const {
  documentUploadTypes: cargoTypes,
  ensureAllowedFile,
  fileExtensions,
  imageUploadTypes: avatarTypes
} = require('../utils/uploadValidation');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = express.Router();

router.use(protect);

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

router.post(
  '/vehicle',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded. Use form-data field "file".' });
    }

    ensureAllowedFile(req.file, cargoTypes, 'Vehicle');
    const url = await cloudinary.uploadBuffer(req.file.buffer, {
      folder: 'itruck/vehicles',
      localExtension: fileExtensions[req.file.mimetype],
      ...(req.file.mimetype === 'application/pdf' ? { resource_type: 'raw' } : {})
    });
    res.json({ url, fileName: req.file.originalname });
  })
);

module.exports = router;
