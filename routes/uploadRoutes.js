const router = require('express').Router();
const multer = require('multer');
const { uploadPublicFile } = require('../controllers/uploadController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/public', upload.single('file'), uploadPublicFile);

module.exports = router;
