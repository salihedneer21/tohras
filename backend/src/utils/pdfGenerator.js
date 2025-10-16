const fs = require('fs');
const path = require('path');
const https = require('https');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fetch = require('node-fetch');
const Replicate = require('replicate');
const { downloadFromS3 } = require('../config/s3');

const replicate = new Replicate();

const PAGE_WIDTH = 842; // A4 landscape width in points
const PAGE_HEIGHT = 421; // A4 landscape height in points
const CHARACTER_MAX_WIDTH_RATIO = 0.4;
const CHARACTER_MAX_HEIGHT_RATIO = 0.8;
const TEXT_BLOCK_WIDTH = 300;
const TEXT_BLOCK_WIDTH_RATIO = 0.35;
const TEXT_MARGIN = 40;
const FONT_SIZE = 16;
const LINE_HEIGHT = FONT_SIZE * 1.4;

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
    return null;
  }
};

const fetchBufferFromUrl = async (url) => {
  if (!url) return null;
  if (typeof url !== 'string') {
    throw new Error('Asset URL must be a string');
  }
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    throw new Error('Asset URL must be a non-empty string');
  }

  const response = await fetch(normalizedUrl, {
    timeout: 30000,
    agent: normalizedUrl.startsWith('https') ? HTTP_AGENT : undefined,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.buffer();
  return buffer;
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

const resolveReplicateOutputBuffer = async (output) => {
  if (!output) return null;
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof Uint8Array) return Buffer.from(output);

  if (typeof output === 'string') {
    return fetchBufferFromUrl(output);
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const buffer = await resolveReplicateOutputBuffer(item);
      if (buffer) return buffer;
    }
    return null;
  }

  if (typeof output === 'object') {
    if (typeof output.url === 'function') {
      try {
        const urlValue = output.url();
        const resolvedUrl = typeof urlValue === 'string' ? urlValue : await urlValue;
        if (typeof resolvedUrl === 'string' && resolvedUrl) {
          return fetchBufferFromUrl(resolvedUrl);
        }
      } catch (error) {
        // ignore and continue fallbacks
      }
    }

    if (typeof output.url === 'string' && output.url) {
      return fetchBufferFromUrl(output.url);
    }

    if (typeof output.href === 'string' && output.href) {
      return fetchBufferFromUrl(output.href);
    }

    if (output.output) {
      return resolveReplicateOutputBuffer(output.output);
    }
  }

  return null;
};

const removeBackground = async (character) => {
  if (!character) return null;
  const imageUrl = typeof character.url === 'string' ? character.url.trim() : '';
  if (!imageUrl) return null;
  try {
    const result = await replicate.run('bria/remove-background', {
      input: {
        image: imageUrl,
        content_moderation: false,
        preserve_partial_alpha: true,
      },
    });
    const processedBuffer = await resolveReplicateOutputBuffer(result);
    if (!processedBuffer) {
      throw new Error('Unexpected response from remove-background model');
    }
    return processedBuffer;
  } catch (error) {
    return null;
  }
};

const wrapText = (text, maxWidth, fontSize) => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  const avgCharWidth = fontSize * 0.45;

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = testLine.length * avgCharWidth;
    if (lineWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

async function generateStorybookPdf({ title, pages }) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('At least one page is required to build the PDF');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
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
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const isCharacterOnRight = index % 2 === 0;

    const backgroundBuffer = await getImageBuffer(pageData.background);
    if (backgroundBuffer) {
      const backgroundImage = await embedImage(pdfDoc, backgroundBuffer);
      if (backgroundImage) {
        page.drawImage(backgroundImage, {
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
        });
      }
    } else {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: rgb(1, 1, 1),
      });
    }

    let characterBuffer = await removeBackground(pageData.character);
    if (!characterBuffer) {
      characterBuffer = await getImageBuffer(pageData.character);
    }

    if (characterBuffer) {
      const characterImage = await embedImage(pdfDoc, characterBuffer);
      if (characterImage) {
        const aspectRatio = characterImage.width / characterImage.height;
        const maxCharWidth = PAGE_WIDTH * CHARACTER_MAX_WIDTH_RATIO;
        const maxCharHeight = PAGE_HEIGHT * CHARACTER_MAX_HEIGHT_RATIO;

        let charWidth;
        let charHeight;
        if (aspectRatio > maxCharWidth / maxCharHeight) {
          charWidth = maxCharWidth;
          charHeight = charWidth / aspectRatio;
        } else {
          charHeight = maxCharHeight;
          charWidth = charHeight * aspectRatio;
        }

        const charX = isCharacterOnRight ? PAGE_WIDTH - charWidth : 0;
        const charY = 0;

        page.drawImage(characterImage, {
          x: charX,
          y: charY,
          width: charWidth,
          height: charHeight,
        });
      }
    }

    const textBlockWidth = Math.min(
      Math.max(PAGE_WIDTH * TEXT_BLOCK_WIDTH_RATIO, TEXT_BLOCK_WIDTH),
      PAGE_WIDTH - TEXT_MARGIN * 2
    );

    const textX = isCharacterOnRight ? TEXT_MARGIN : PAGE_WIDTH - textBlockWidth - TEXT_MARGIN;
    const textY = PAGE_HEIGHT * 0.7;

    const textLines = wrapText(pageData.text || '', textBlockWidth, FONT_SIZE);
    const textHeight = textLines.length * LINE_HEIGHT;

    if (textLines.length) {
      page.drawRectangle({
        x: textX - 20,
        y: textY - textHeight - 20,
        width: textBlockWidth + 40,
        height: textHeight + 40,
        color: rgb(1, 1, 1),
        opacity: 0.5,
        borderColor: rgb(1, 1, 1),
        borderRadius: 24,
      });

      textLines.forEach((line, lineIndex) => {
        const y = textY - lineIndex * LINE_HEIGHT - 18;
        page.drawText(line, {
          x: textX,
          y,
          size: FONT_SIZE,
          font: bodyFont,
          color: rgb(0, 0, 0),
        });
      });
    }

    if (pageData.quote) {
      const quoteLines = wrapText(pageData.quote, PAGE_WIDTH * 0.3, FONT_SIZE);
      quoteLines.forEach((line, lineIndex) => {
        const x = isCharacterOnRight ? PAGE_WIDTH - 260 : TEXT_MARGIN;
        const y = PAGE_HEIGHT - 80 - lineIndex * LINE_HEIGHT;
        page.drawText(line, {
          x,
          y,
          size: FONT_SIZE,
          font: accentFont,
          color: rgb(0, 0, 0),
        });
      });
    }

    page.drawText(`Page ${pageData.order || index + 1}`, {
      x: TEXT_MARGIN,
      y: Math.max(PAGE_HEIGHT - 35, TEXT_MARGIN),
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
