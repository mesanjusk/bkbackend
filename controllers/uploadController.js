const cloudinary = require('../utils/cloudinary');

function uploadBuffer(file, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    stream.end(file.buffer);
  });
}

async function uploadPublicFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const mimeType = String(req.file.mimetype || '').toLowerCase();
  const isPdf = mimeType.includes('pdf');
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    return res.status(400).json({ message: 'Only image or PDF files are allowed' });
  }

  const folder = req.body.folder || 'bk_award';
  const forcePng = String(req.body.forcePng || '').toLowerCase() === 'true';
  const removeBackground = String(req.body.removeBackground || '').toLowerCase() === 'true';

  const options = {
    folder,
    resource_type: isPdf ? 'raw' : 'image',
    use_filename: true,
    unique_filename: true
  };

  if (isImage && forcePng) {
    options.format = 'png';
  }

  if (isImage && removeBackground) {
    options.background_removal = 'cloudinary_ai';
  }

  let result;
  try {
    result = await uploadBuffer(req.file, options);
  } catch (error) {
    if (isImage && removeBackground) {
      const fallbackOptions = {
        folder,
        resource_type: 'image',
        use_filename: true,
        unique_filename: true
      };
      if (forcePng) fallbackOptions.format = 'png';
      result = await uploadBuffer(req.file, fallbackOptions);
    } else {
      throw error;
    }
  }

  return res.status(201).json({
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    originalName: req.file.originalname
  });
}

module.exports = {
  uploadPublicFile
};
