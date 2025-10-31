const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

const requiredEnv = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Missing ${key} environment variable for S3 operations`);
  }
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const BUCKET = process.env.AWS_S3_BUCKET || 'book-story-ai-generate';

const buildKey = (...segments) => segments.filter(Boolean).join('/');

const getPublicUrl = (key) => {
  if (!key) return null;
  return `https://${BUCKET}.s3.amazonaws.com/${key}`;
};

async function uploadBufferToS3(buffer, key, contentType, options = {}) {
  const uploader = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      ACL: options.acl || 'public-read',
    },
  });

  await uploader.done();

  return {
    key,
    url: getPublicUrl(key),
  };
}

async function deleteFromS3(key) {
  if (!key) return;
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

async function getSignedUrlForKey(key, expiresIn = 60 * 5) {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.warn(`⚠️  Failed to sign URL for ${key}: ${error.message}`);
    return null;
  }
}

async function downloadFromS3(key) {
  if (!key) return null;

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  const stream = response.Body;

  if (typeof stream === 'string' || Buffer.isBuffer(stream)) {
    return Buffer.from(stream);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const generateImageKey = (userId, originalName) => {
  const timestamp = Date.now();
  const safeName = originalName ? path.basename(originalName).replace(/\s+/g, '-').toLowerCase() : `image-${timestamp}`;
  return buildKey('users', String(userId), 'images', `${timestamp}-${safeName}`);
};

const generateTrainingImageKey = (modelName, originalName, index) => {
  const safeName = originalName ? path.basename(originalName).replace(/\s+/g, '-').toLowerCase() : `image-${index + 1}.jpg`;
  return buildKey('trainings', modelName, 'images', safeName);
};

const generateTrainingZipKey = (modelName) => buildKey('trainings', modelName, `${modelName}.zip`);

const sanitizeFileName = (value, fallback) => {
  const safeFallback = fallback || `asset-${Date.now()}`;
  if (!value) return safeFallback;
  return path
    .basename(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
};

const generateBookCoverKey = (bookSlug, originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `cover-${timestamp}.jpg`);
  return buildKey('books', bookSlug, 'cover', `${timestamp}-${safeName}`);
};

const generateBookPageImageKey = (bookSlug, order, originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `page-${order}-${timestamp}.jpg`);
  return buildKey('books', bookSlug, 'pages', `${order}-${timestamp}-${safeName}`);
};

const generateBookCharacterOverlayKey = (bookSlug, order, originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `character-${order}-${timestamp}.png`);
  return buildKey('books', bookSlug, 'story', 'characters', `${order}-${timestamp}-${safeName}`);
};

const generateBookQrCodeKey = (bookSlug, order, originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `qr-${order}-${timestamp}.png`);
  return buildKey('books', bookSlug, 'pages', 'qr', `${order}-${timestamp}-${safeName}`);
};

const generatePromptImageKey = (originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `prompt-${timestamp}.jpg`);
  return buildKey('prompts', `${timestamp}-${safeName}`);
};

const generateEvaluationImageKey = (originalName) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(originalName, `evaluation-${timestamp}.jpg`);
  return buildKey('evaluations', `${timestamp}-${safeName}`);
};

const ensurePdfExtension = (value) => {
  if (!value) return 'storybook.pdf';
  return value.toLowerCase().endsWith('.pdf') ? value : `${value}.pdf`;
};

const generateBookPdfKey = (bookSlug, title) => {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(title, `storybook-${timestamp}.pdf`);
  return buildKey('books', bookSlug, 'pdfs', `${timestamp}-${ensurePdfExtension(safeName)}`);
};

module.exports = {
  s3Client,
  uploadBufferToS3,
  deleteFromS3,
  getSignedUrlForKey,
  generateImageKey,
  generateTrainingImageKey,
  generateTrainingZipKey,
  generateBookCoverKey,
  generateBookPageImageKey,
  generateBookCharacterOverlayKey,
  generateBookQrCodeKey,
  generateBookPdfKey,
  generatePromptImageKey,
  generateEvaluationImageKey,
  getPublicUrl,
  downloadFromS3,
  BUCKET,
};
