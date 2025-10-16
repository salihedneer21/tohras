const fs = require('fs');
const path = require('path');
const https = require('https');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fetch = require('node-fetch');
const { replicate } = require('../config/replicate');
const { downloadFromS3 } = require('../config/s3');

const DEFAULT_PAGE_WIDTH = 842;
const DEFAULT_PAGE_HEIGHT = 421;
const CHARACTER_MAX_WIDTH_RATIO = 0.4;
const CHARACTER_MAX_HEIGHT_RATIO = 0.8;
const TEXT_BLOCK_WIDTH = 300;
const TEXT_BLOCK_WIDTH_RATIO = 0.35;
const TEXT_MARGIN = 40;
const FONT_SIZE = 16;
const LINE_HEIGHT = FONT_SIZE * 1.4;
const CHARACTER_BOTTOM_MARGIN = 0;
const HTTP_AGENT = new https.Agent({
  keepAlive: true,
  timeout: 30000,
  keepAliveMsecs: 30000,
});

const optionalFontPath = (envKey, fallbackRelative) => {
  const fromEnv = process.env[envKey];
  if (fromEnv) return path.resolve(process.cwd(), fromEnv);
  if (fallbackRelative) {
    const resolved = path.resolve(process.cwd(), fallbackRelative);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
};

const tryEmbedCustomFont = async (pdfDoc, fontPath) => {
  if (!fontPath) return null;
  try {
    const bytes = fs.readFileSync(fontPath);
    pdfDoc.registerFontkit(fontkit);
    return pdfDoc.embedFont(bytes);
  } catch (error) {
    console.warn(`⚠️  Failed to load font at ${fontPath}: ${error.message}`);
    return null;
  }
};

const fetchBufferFromUrl = async (input) => {
  if (!input) return null;
  const url = typeof input === 'string' ? input.trim() : '';
  if (!url) {
    throw new Error('Image URL is missing or invalid');
  }
  const response = await fetch(url, { agent: url.startsWith('https') ? HTTP_AGENT : undefined, timeout: 30000 });
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const getImageBuffer = async (source) => {
  if (!source) return null;
  if (source.buffer) return source.buffer;
  if (source.key) {
    const buffer = await downloadFromS3(source.key);
    if (buffer) return buffer;
  }
  if (source.url) {
    return fetchBufferFromUrl(source.url);
  }
  return null;
};

const embedImage = async (pdfDoc, buffer) => {
  if (!buffer) return null;
  try {
    return await pdfDoc.embedPng(buffer);
  } catch (error) {
    return pdfDoc.embedJpg(buffer);
  }
};

const wrapText = (text, font, maxWidth, fontSize) => {
  if (!text) return [];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
};

const drawTextBlock = (page, lines, font, options) => {
  const {
    x,
    y,
    fontSize = FONT_SIZE,
    lineHeight = LINE_HEIGHT,
    backgroundOpacity = 0.5,
    maxWidth = TEXT_BLOCK_WIDTH,
  } = options;

  if (!lines.length) return;

  const totalHeight = lines.length * lineHeight;

  page.drawRectangle({
    x: x - 20,
    y: y - totalHeight - 20,
    width: maxWidth + 40,
    height: totalHeight + 40,
    color: rgb(1, 1, 1),
    opacity: backgroundOpacity,
    borderColor: rgb(1, 1, 1),
    borderRadius: 12,
  });

  lines.forEach((line, index) => {
    const lineY = y - index * lineHeight - 18;

    // Outline passes
    [-1, 1].forEach((dx) => {
      [-1, 1].forEach((dy) => {
        page.drawText(line, {
          x: x + dx,
          y: lineY + dy,
          size: fontSize,
          font,
          color: rgb(1, 1, 1),
        });
      });
    });

    // Main text
    page.drawText(line, {
      x,
      y: lineY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
};

const resolveReplicateOutputUrl = (output) => {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return resolveReplicateOutputUrl(output[0]);
  if (output?.output) return resolveReplicateOutputUrl(output.output);
  if (output?.url) return output.url;
  if (output?.href) return output.href;
  return null;
};

const removeBackground = async (imageUrl) => {
  if (!imageUrl) return null;
  if (typeof imageUrl !== 'string') {
    throw new Error('Character image URL must be a string');
  }
  try {
    const result = await replicate.run('bria/remove-background', {
      input: {
        image: imageUrl,
      },
    });
    const processedUrl = resolveReplicateOutputUrl(result);
    if (!processedUrl) {
      throw new Error('Unexpected response from remove-background model');
    }
    return fetchBufferFromUrl(processedUrl);
  } catch (error) {
    console.warn(`⚠️  Failed to remove background for ${imageUrl}: ${error.message}`);
    return null;
  }
};

async function generateStorybookPdf({ title, pages }) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('At least one page is required to build the PDF');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title || 'Storybook');
  pdfDoc.setCreator('AI Book Story');
  pdfDoc.setProducer('AI Book Story');

  let bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let accentFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const bodyFontPath = optionalFontPath('STORYBOOK_BODY_FONT', 'fonts/CanvaSans-Regular.otf');
  const accentFontPath = optionalFontPath('STORYBOOK_ACCENT_FONT', 'fonts/CanvaSans-Bold.otf');

  const customBodyFont = await tryEmbedCustomFont(pdfDoc, bodyFontPath);
  if (customBodyFont) {
    bodyFont = customBodyFont;
  }
  const customAccentFont = await tryEmbedCustomFont(pdfDoc, accentFontPath);
  if (customAccentFont) {
    accentFont = customAccentFont;
  }

  for (let index = 0; index < pages.length; index += 1) {
    const pageData = pages[index];
    const pageWidth = DEFAULT_PAGE_WIDTH;
    const pageHeight = DEFAULT_PAGE_HEIGHT;
    let backgroundImage = null;

    if (pageData.background) {
      try {
        const backgroundBuffer = await getImageBuffer(pageData.background);
        backgroundImage = await embedImage(pdfDoc, backgroundBuffer);
      } catch (error) {
        console.warn(`⚠️  Failed to render background for page ${index + 1}: ${error.message}`);
      }
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const isCharacterOnRight = index % 2 === 0;

    if (backgroundImage) {
      page.drawImage(backgroundImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } else {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1),
      });
    }

    // Character overlay
    let charWidth = 0;
    let charHeight = 0;
    let charX = 0;
    const charY = CHARACTER_BOTTOM_MARGIN;

    if (pageData.character) {
      try {
        let removedBgBuffer = null;
        if (pageData.character.url && pageData.character.url.trim()) {
          removedBgBuffer = await removeBackground(pageData.character.url.trim());
        }
        if (!removedBgBuffer) {
          removedBgBuffer = await getImageBuffer(pageData.character);
        }

        const characterImage = await embedImage(pdfDoc, removedBgBuffer);
        if (characterImage) {
          const aspectRatio = characterImage.width / characterImage.height;
          const maxCharWidth = pageWidth * CHARACTER_MAX_WIDTH_RATIO;
          const maxCharHeight = pageHeight * CHARACTER_MAX_HEIGHT_RATIO;

          if (aspectRatio > maxCharWidth / maxCharHeight) {
            charWidth = maxCharWidth;
            charHeight = charWidth / aspectRatio;
          } else {
            charHeight = maxCharHeight;
            charWidth = charHeight * aspectRatio;
          }

          charWidth = Math.min(charWidth, pageWidth);
          charHeight = Math.min(charHeight, pageHeight);
          charX = isCharacterOnRight ? Math.max(pageWidth - charWidth, 0) : 0;

          page.drawImage(characterImage, {
            x: charX,
            y: charY,
            width: charWidth,
            height: charHeight,
          });
        }
      } catch (error) {
        console.warn(`⚠️  Failed to render character for page ${index + 1}: ${error.message}`);
      }
    }

    // Text block
    const maxAvailableTextWidth = Math.max(pageWidth - TEXT_MARGIN * 2, 80);
    const preferredTextWidth = Math.min(pageWidth * TEXT_BLOCK_WIDTH_RATIO, TEXT_BLOCK_WIDTH);
    const textBlockWidth = Math.min(Math.max(preferredTextWidth, 80), maxAvailableTextWidth);
    const textX = isCharacterOnRight
      ? TEXT_MARGIN
      : Math.max(pageWidth - textBlockWidth - TEXT_MARGIN, TEXT_MARGIN);
    const textY = pageHeight * 0.7;

    const lines = wrapText(pageData.text || '', bodyFont, textBlockWidth, FONT_SIZE);
    drawTextBlock(page, lines, bodyFont, {
      x: textX,
      y: textY,
      maxWidth: textBlockWidth,
    });

    page.drawText(`Page ${pageData.order || index + 1}`, {
      x: TEXT_MARGIN,
      y: Math.max(pageHeight - 35, TEXT_MARGIN),
      size: 14,
      font: accentFont,
      color: rgb(1, 1, 1),
      opacity: 0.65,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return {
    buffer: Buffer.from(pdfBytes),
    pageCount: pages.length,
  };
}

module.exports = {
  generateStorybookPdf,
};
