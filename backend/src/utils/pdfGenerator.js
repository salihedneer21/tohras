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

  const isS3Private =
    normalizedUrl.includes('amazonaws.com') && !normalizedUrl.includes('replicate.delivery');

  const response = await fetch(normalizedUrl, {
    timeout: 30000,
    agent: normalizedUrl.startsWith('https') ? HTTP_AGENT : undefined,
    headers: isS3Private
      ? { 'User-Agent': 'aws-sdk-nodejs/3.x' }
      : {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36',
        },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.buffer();
  console.log('[fetchBufferFromUrl] fetched', normalizedUrl, 'size', buffer.length);
  return buffer;
};

const getImageBuffer = async (source) => {
  if (!source) return null;
  if (source.buffer) return source.buffer;
  if (source.key) {
    const buffer = await downloadFromS3(source.key);
    if (buffer) return buffer;
  }
  if (source.signedUrl && typeof source.signedUrl === 'string') {
    return fetchBufferFromUrl(source.signedUrl);
  }
  if (source.url) {
    return fetchBufferFromUrl(source.url);
  }
  return null;
};

const embedImage = async (pdfDoc, buffer) => {
  if (!buffer) return null;
  try {
    console.log('[pdf] embedding PNG buffer of length', buffer.length);
    return await pdfDoc.embedPng(buffer);
  } catch (error) {
    console.warn('[pdf] embedPng failed, falling back to JPG:', error.message);
    return pdfDoc.embedJpg(buffer);
  }
};

const resolveReplicateOutputBuffer = async (output) => {
  if (!output) return null;
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof Uint8Array) return Buffer.from(output);

  if (typeof output === 'string') {
    console.log('[resolveReplicateOutputBuffer] string output', output.slice(0, 80));
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
    if (output.output && typeof output.output === 'string') {
      console.log('[resolveReplicateOutputBuffer] direct output string', output.output.slice(0, 120));
      return fetchBufferFromUrl(output.output);
    }

    if (Array.isArray(output.output)) {
      const buffer = await resolveReplicateOutputBuffer(output.output);
      if (buffer) return buffer;
    }

    if (output.output && typeof output.output === 'object') {
      const buffer = await resolveReplicateOutputBuffer(output.output);
      if (buffer) return buffer;
    }

    if (typeof output.image === 'string' && output.image) {
      return fetchBufferFromUrl(output.image);
    }

    if (output.image && typeof output.image === 'object') {
      const buffer = await resolveReplicateOutputBuffer(output.image);
      if (buffer) return buffer;
    }

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

    if (typeof output.base64 === 'string' && output.base64) {
      return Buffer.from(output.base64, 'base64');
    }

    if (typeof output.file === 'string' && output.file.startsWith('data:')) {
      const base64 = output.file.split(',')[1];
      if (base64) return Buffer.from(base64, 'base64');
    }

    if (output.urls?.get) {
      try {
        const response = await fetch(output.urls.get, {
          headers: {
            Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          },
        });
        if (response.ok) {
          const prediction = await response.json();
          return resolveReplicateOutputBuffer(prediction.output);
        }
        console.warn('[resolve] prediction lookup failed', response.status, response.statusText);
      } catch (error) {
        console.warn('[resolve] failed to fetch prediction detail', error.message);
      }
    }
  }

  return null;
};

const removeBackground = async (character) => {
  if (!character) return null;
  const imageUrl = typeof character.signedUrl === 'string' && character.signedUrl.trim()
    ? character.signedUrl.trim()
    : typeof character.url === 'string'
    ? character.url.trim()
    : '';
  if (!imageUrl) return null;
  try {
    console.log('[bria] requesting background removal for:', imageUrl);
    const result = await replicate.run('bria/remove-background', {
      input: {
        image: imageUrl,
      },
    });
    console.log('[bria] remove-background response type:', typeof result);
    console.log('[bria] remove-background response keys:', result && typeof result === 'object' ? Object.keys(result) : 'N/A');
    console.log('[bria] remove-background response constructor:', result && typeof result === 'object' ? result.constructor.name : 'N/A');

    // Handle FileOutput objects (Replicate SDK v1.3.0+)
    if (result && typeof result === 'object' && typeof result.url === 'function') {
      console.log('[bria] detected FileOutput object, calling url() method');
      const urlValue = result.url();
      // Convert URL object to string if needed
      let outputUrl;
      if (typeof urlValue === 'string') {
        outputUrl = urlValue;
      } else if (urlValue && typeof urlValue === 'object' && urlValue.href) {
        // URL object has href property
        outputUrl = urlValue.href;
      } else if (urlValue && typeof urlValue.toString === 'function') {
        outputUrl = urlValue.toString();
      } else {
        outputUrl = await urlValue;
      }
      console.log('[bria] FileOutput URL string:', outputUrl);
      const processedBuffer = await fetchBufferFromUrl(outputUrl);
      console.log('[bria] resolved buffer length', processedBuffer ? processedBuffer.length : null);
      return processedBuffer;
    }

    // Handle direct URL string responses (older SDK versions)
    if (typeof result === 'string' && result.trim()) {
      console.log('[bria] direct URL string:', result);
      const processedBuffer = await fetchBufferFromUrl(result);
      console.log('[bria] resolved buffer length', processedBuffer ? processedBuffer.length : null);
      return processedBuffer;
    }

    // Handle object responses with nested properties
    if (result && typeof result === 'object') {
      let outputUrl = null;

      // Check various possible response formats
      if (typeof result.output === 'string' && result.output) {
        outputUrl = result.output;
      } else if (Array.isArray(result) && result.length > 0) {
        // Handle array of FileOutput objects
        const firstItem = result[0];
        if (typeof firstItem === 'string') {
          outputUrl = firstItem;
        } else if (firstItem && typeof firstItem.url === 'function') {
          const urlValue = firstItem.url();
          outputUrl = typeof urlValue === 'string' ? urlValue : await urlValue;
        }
      } else if (typeof result.url === 'string' && result.url) {
        outputUrl = result.url;
      }

      if (outputUrl) {
        console.log('[bria] extracted URL from object:', outputUrl);
        const processedBuffer = await fetchBufferFromUrl(outputUrl);
        console.log('[bria] resolved buffer length', processedBuffer ? processedBuffer.length : null);
        return processedBuffer;
      }
    }

    // If we get here, we couldn't extract a valid URL
    console.error('[bria] unable to extract URL from response:', JSON.stringify(result));
    throw new Error('No valid output URL in response from remove-background model');
  } catch (error) {
    console.error(`[bria] Background removal failed for ${imageUrl}`);
    console.error(`[bria] Error: ${error.message}`);
    console.error(`[bria] Stack:`, error.stack);
    throw error; // Re-throw the error instead of returning null
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
    console.log(`[pdf] background buffer length for page ${index + 1}:`, backgroundBuffer.length);
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

    // Remove background from character image (required, no fallback)
    if (pageData.character) {
      const characterBuffer = await removeBackground(pageData.character);
      console.log(`[pdf] removeBackground result for page ${index + 1}:`, characterBuffer ? characterBuffer.length : null);

      if (!characterBuffer) {
        throw new Error(`Failed to remove background from character image for page ${index + 1}. Background removal is required.`);
      }

      const characterImage = await embedImage(pdfDoc, characterBuffer);
      console.log('[pdf] embedded character image', characterImage ? { width: characterImage.width, height: characterImage.height } : null);

      if (!characterImage) {
        throw new Error(`Failed to embed character image for page ${index + 1}`);
      }

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
