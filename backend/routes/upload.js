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

router.use(protect);

router.post('/avatar', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No file uploaded. Use form-data field "file".' });
  }

  const url = await cloudinary.uploadBuffer(req.file.buffer, { folder: 'itruck/avatars' });
  res.json({ url });
}));

router.post('/cargo', upload.array('files', 5), asyncHandler(async (req, res) => {
  const files = (req.files || []).filter(file => file && file.buffer);
  if (!files.length) {
    return res.status(400).json({ message: 'No files uploaded. Use form-data field "files".' });
  }

  const urls = await Promise.all(
    files.map(file => cloudinary.uploadBuffer(file.buffer, { folder: 'itruck/cargo' }))
  );

  res.json({ urls });
}));

module.exports = router;
