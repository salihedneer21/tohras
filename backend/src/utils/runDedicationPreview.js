#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { PDFDocument } = require('pdf-lib');

const {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HALF_WIDTH,
  TEXT_PADDING_RATIO,
  TEXT_HEIGHT_RATIO,
  TEXT_TOP_RATIO,
  ensureFontsRegistered,
  drawKidImage,
  drawTextBlock,
} = require('./dedicationLayout');

const renderDedication = async ({ background, kid, title, subtitle }) => {
  ensureFontsRegistered();

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');

  const bgImage = await loadImage(background);
  ctx.drawImage(bgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (kid) {
    const kidImage = await loadImage(kid);
    drawKidImage(ctx, kidImage);
  }

  const textArea = {
    x: HALF_WIDTH + CANVAS_WIDTH * TEXT_PADDING_RATIO,
    y: CANVAS_HEIGHT * TEXT_TOP_RATIO,
    width: HALF_WIDTH - CANVAS_WIDTH * TEXT_PADDING_RATIO * 2,
    height: CANVAS_HEIGHT * TEXT_HEIGHT_RATIO,
  };

  drawTextBlock(ctx, {
    area: textArea,
    title,
    subtitle,
  });

  return canvas.toBuffer('image/png');
};

const CONFIG = {
  backgroundPath: path.resolve(__dirname, 'assets/background-2.png'),
  kidPath: path.resolve(__dirname, 'assets/child-2.png'),
  primaryTitle: 'To Chaim',
  secondaryTitle:
    'With love on every adventure.\nMay your stories be filled with wonder, courage, and joy.\nWe are so proud of the amazing kid you are.',
  outputPath: path.resolve(process.cwd(), 'dedication-preview.pdf'),
};

const buildPdf = async () => {
  const { backgroundPath, kidPath, primaryTitle, secondaryTitle, outputPath } = CONFIG;

  if (!fs.existsSync(backgroundPath)) {
    throw new Error(`Missing background image: ${backgroundPath}`);
  }
  if (!fs.existsSync(kidPath)) {
    throw new Error(`Missing kid image: ${kidPath}`);
  }

  const backgroundBuffer = fs.readFileSync(backgroundPath);
  const kidBuffer = fs.readFileSync(kidPath);

  const dedicationPng = await renderDedication({
    background: backgroundBuffer,
    kid: kidBuffer,
    title: primaryTitle,
    subtitle: secondaryTitle,
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([CANVAS_WIDTH, CANVAS_HEIGHT]);
  const embedded = await pdfDoc.embedPng(dedicationPng);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
};

(async () => {
  try {
    const pdfPath = await buildPdf();
    console.log(`dedication preview ready: ${pdfPath}`);
  } catch (error) {
    console.error('dedication preview failed:', error.message);
    process.exitCode = 1;
  }
})();
