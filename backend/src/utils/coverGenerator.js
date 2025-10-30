const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Helper function to draw rounded rectangles
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Box blur implementation
 */
function boxBlur(imageData, width, height, radius) {
  const pixels = imageData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let kx = -radius; kx <= radius; kx++) {
        const px = x + kx;
        if (px >= 0 && px < width) {
          const idx = (y * width + px) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          a += pixels[idx + 3];
          count++;
        }
      }

      const idx = (y * width + x) * 4;
      tempPixels[idx] = r / count;
      tempPixels[idx + 1] = g / count;
      tempPixels[idx + 2] = b / count;
      tempPixels[idx + 3] = a / count;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        const py = y + ky;
        if (py >= 0 && py < height) {
          const idx = (py * width + x) * 4;
          r += tempPixels[idx];
          g += tempPixels[idx + 1];
          b += tempPixels[idx + 2];
          a += tempPixels[idx + 3];
          count++;
        }
      }

      const idx = (y * width + x) * 4;
      pixels[idx] = r / count;
      pixels[idx + 1] = g / count;
      pixels[idx + 2] = b / count;
      pixels[idx + 3] = a / count;
    }
  }

  return imageData;
}

/**
 * Get font size from font string
 */
function getFontSize(font) {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  return match ? parseFloat(match[1]) : 24;
}

/**
 * Build wrapped text lines
 */
function buildWrappedLines(ctx, segments, maxWidth) {
  const groups = { before: [], after: [] };
  let currentGroup = groups.before;

  segments.forEach((segment) => {
    if (segment.type === 'qrBreak') {
      currentGroup = groups.after;
      return;
    }

    if (segment.type === 'spacer') {
      currentGroup.push({
        type: 'spacer',
        size: segment.size ?? 24,
      });
      return;
    }

    if (segment.type === 'text') {
      const font = segment.font || '30px Arial';
      const lineHeight = segment.lineHeight || 1.3;
      const color = segment.color;

      const rawLines = segment.text.split('\n');
      rawLines.forEach((rawLine) => {
        if (!rawLine.trim()) {
          currentGroup.push({
            type: 'spacer',
            size: getFontSize(font) * (lineHeight + 0.2),
          });
          return;
        }

        ctx.font = font;
        const words = rawLine.split(' ');
        let currentLine = '';

        words.forEach((word) => {
          const candidate = currentLine ? `${currentLine} ${word}` : word;
          const width = ctx.measureText(candidate).width;

          if (width > maxWidth && currentLine) {
            currentGroup.push({
              type: 'text',
              text: currentLine,
              font,
              lineHeight,
              color,
            });
            currentLine = word;
          } else {
            currentLine = candidate;
          }
        });

        if (currentLine) {
          currentGroup.push({
            type: 'text',
            text: currentLine,
            font,
            lineHeight,
            color,
          });
        }
      });
    }
  });

  return groups;
}

/**
 * Layout text lines with positioning
 */
function layoutTextLines(lines, startX, startY) {
  const positioned = [];
  let cursorY = startY;
  let top = Infinity;
  let bottom = -Infinity;

  lines.forEach((line) => {
    if (line.type === 'spacer') {
      cursorY += line.size;
      return;
    }

    if (line.type === 'text') {
      const fontSize = getFontSize(line.font);
      const leading = line.lineHeight || 1.3;
      cursorY += fontSize;

      positioned.push({
        ...line,
        x: startX,
        y: cursorY,
      });

      top = Math.min(top, cursorY - fontSize * 1.05);
      bottom = Math.max(bottom, cursorY);

      cursorY += Math.round(fontSize * Math.max(leading - 1, 0.25));
    }
  });

  if (!positioned.length) {
    top = startY;
    bottom = startY;
  }

  return { lines: positioned, top, bottom, cursor: cursorY };
}

/**
 * Load image from buffer or URL
 */
async function loadImageFromSource(source) {
  if (Buffer.isBuffer(source)) {
    return await loadImage(source);
  } else if (typeof source === 'string') {
    // It's a URL
    const response = await fetch(source);
    const buffer = await response.buffer();
    return await loadImage(buffer);
  }
  throw new Error('Invalid image source');
}

/**
 * Generate cover page
 */
async function generateCoverPage(options) {
  const {
    backgroundImage,
    characterImage = null,
    leftSide = {},
    rightSide = {},
    qrCode = null,
  } = options;

  // Load background image
  const bgImage = await loadImageFromSource(backgroundImage);
  const width = bgImage.width;
  const height = bgImage.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.drawImage(bgImage, 0, 0, width, height);

  // Load and draw character image if provided with transparent background
  let charImage = null;
  if (characterImage) {
    try {
      console.log('Loading and removing background from character image...');

      // Determine if characterImage is a URL or buffer
      let imageUrl;
      if (Buffer.isBuffer(characterImage)) {
        // If it's a buffer, we need to convert it to a URL or handle it differently
        // For now, let's assume it's a URL string
        imageUrl = characterImage;
      } else {
        imageUrl = characterImage;
      }

      // Remove background using Replicate API
      const removeBgInput = { image: imageUrl };
      const bgRemovedOutput = await replicate.run('bria/remove-background', {
        input: removeBgInput,
      });

      // Load the background-removed image
      const bgRemovedImageResponse = await fetch(bgRemovedOutput);
      const bgRemovedImageBuffer = await bgRemovedImageResponse.buffer();
      charImage = await loadImage(Buffer.from(bgRemovedImageBuffer));

      console.log('Background removed successfully from character image');
    } catch (error) {
      console.warn('Failed to load or process character image:', error.message);
    }
  }

  // Draw character image if loaded - positioned in bottom center of right half
  if (charImage) {
    // Character size optimized for better visibility
    const charTargetWidth = width * 0.42; // 42% of canvas width
    const charTargetHeight = height * 1.25; // 125% of canvas height

    const charAspectRatio = charImage.width / charImage.height;
    const targetAspectRatio = charTargetWidth / charTargetHeight;

    let drawWidth;
    let drawHeight;

    // Calculate dimensions to fit the target area while maintaining aspect ratio
    if (charAspectRatio > targetAspectRatio) {
      drawWidth = charTargetWidth;
      drawHeight = drawWidth / charAspectRatio;
    } else {
      drawHeight = charTargetHeight;
      drawWidth = drawHeight * charAspectRatio;
    }

    // Position: horizontally centered in right half (shifted 40px left), vertically aligned to bottom
    const rightHalfCenterX = width * 0.75 - 40; // Center of right half (50% + 25%) - 40px
    const drawX = rightHalfCenterX - drawWidth / 2; // Center the character
    const drawY = height - drawHeight; // Align to bottom

    ctx.drawImage(charImage, drawX, drawY, drawWidth, drawHeight);
  }

  // Load QR code if provided
  let qrImage = null;
  if (qrCode) {
    try {
      qrImage = await loadImageFromSource(qrCode);
    } catch (error) {
      console.warn('Failed to load QR code:', error.message);
    }
  }

  // Prepare text segments for left side
  const textSegments = [];

  if (leftSide.title) {
    textSegments.push({
      type: 'text',
      text: leftSide.title,
      font: '600 100px Arial',
      lineHeight: 1.08,
      color: 'rgba(255,255,255,0.96)',
    });
    textSegments.push({ type: 'spacer', size: 28 });
  }

  if (leftSide.content) {
    textSegments.push({
      type: 'text',
      text: leftSide.content,
      font: '70px Arial',
      lineHeight: 1.45,
      color: 'rgba(255,255,255,0.92)',
    });
  }

  if (qrImage) {
    textSegments.push({ type: 'qrBreak' });
    textSegments.push({ type: 'spacer', size: 28 });
  }

  if (leftSide.bottomText) {
    textSegments.push({
      type: 'text',
      text: leftSide.bottomText,
      font: 'bold 60px Arial',
      lineHeight: 1.1,
      color: 'rgba(255,255,255,0.94)',
    });
  }

  // Calculate text layout
  const textX = width * 0.06;
  const textStartY = height * 0.22;
  const textMaxWidth = width * 0.32;

  const textGroups = buildWrappedLines(ctx, textSegments, textMaxWidth);
  const beforeLayout = layoutTextLines(textGroups.before, textX, textStartY);

  // QR code dimensions and layout
  const qrSize = qrImage ? Math.min(height * 0.10, Math.max(width * 0.06, 100)) : 0;
  const qrGapTop = qrImage ? 50 : 0;
  const qrGapBottom = qrImage ? 50 : 0;
  const qrY = qrImage ? beforeLayout.bottom + qrGapTop : beforeLayout.bottom;

  const afterLayout = layoutTextLines(
    textGroups.after,
    textX,
    qrY + (qrImage ? qrSize + qrGapBottom : 0)
  );

  // Calculate blur box dimensions
  const blurPaddingX = width * 0.03;
  const internalPadding = 80;

  const textContentTop = beforeLayout.top - 10;
  let textContentBottom = beforeLayout.bottom;
  if (afterLayout.lines.length > 0) {
    textContentBottom = afterLayout.bottom;
  }
  if (qrImage) {
    textContentBottom = Math.max(textContentBottom, qrY + qrSize);
  }

  const blurHeight = (textContentBottom - textContentTop) + (internalPadding * 2);
  const verticalCenter = height / 2;
  const blurY = verticalCenter - (blurHeight / 2);
  const blurX = Math.max(0, textX - blurPaddingX);
  const blurWidth = Math.min(width - blurX, textMaxWidth + blurPaddingX * 2);

  const overlayRadius = 20;

  // Create and apply blur
  if (blurHeight > 0 && blurWidth > 0) {
    const scale = 0.5;
    const tempWidth = Math.floor(blurWidth * scale);
    const tempHeight = Math.floor(blurHeight * scale);

    const blurCanvas = createCanvas(tempWidth, tempHeight);
    const blurCtx = blurCanvas.getContext('2d');

    blurCtx.drawImage(
      bgImage,
      blurX,
      blurY,
      blurWidth,
      blurHeight,
      0,
      0,
      tempWidth,
      tempHeight
    );

    const imageData = blurCtx.getImageData(0, 0, tempWidth, tempHeight);

    const blurRadius = 15;
    for (let i = 0; i < 8; i++) {
      boxBlur(imageData, tempWidth, tempHeight, blurRadius);
    }

    blurCtx.putImageData(imageData, 0, 0);

    ctx.save();
    drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
    ctx.clip();
    ctx.drawImage(blurCanvas, blurX, blurY, blurWidth, blurHeight);

    // Add subtle dark overlay for better text readability on bright backgrounds
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(blurX, blurY, blurWidth, blurHeight);

    // TEMPORARY: Add thick red border for testing
    ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
    ctx.lineWidth = 10;
    ctx.strokeRect(blurX, blurY, blurWidth, blurHeight);

    const edgeFade = 20;
    const fadeGradient = ctx.createLinearGradient(blurX, 0, blurX + edgeFade, 0);
    fadeGradient.addColorStop(0, "rgba(255, 255, 255, 0.05)");
    fadeGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = fadeGradient;
    ctx.fillRect(blurX, blurY, edgeFade, blurHeight);

    ctx.restore();
  }

  // Draw text
  const allTextLines = beforeLayout.lines.concat(afterLayout.lines);
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  allTextLines.forEach((line) => {
    ctx.font = line.font;
    ctx.fillStyle = line.color || '#ffffff';

    if (line.text.includes(leftSide.bottomText)) {
      ctx.textAlign = 'center';
      const centerX = blurX + blurWidth / 2;
      ctx.fillText(line.text, centerX, line.y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line.text, line.x, line.y);
    }
  });

  // Draw QR code
  if (qrImage && blurHeight > 0) {
    const qrX = blurX + (blurWidth - qrSize) / 2;
    const frameX = qrX - 18;
    const frameY = qrY - 18;
    const frameSize = qrSize + 36;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    drawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.restore();

    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  }

  // Draw right side title
  if (rightSide.mainTitle) {
    const mainTitleText = (rightSide.mainTitle || '').toUpperCase();
    const textXRight = width * 0.75 - 40; // Shifted 40px left
    const bottomMargin = 250;
    const topY = height - bottomMargin - 280;
    const bottomY = topY + 280;

    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Draw main title
    const topGradient = ctx.createLinearGradient(0, topY - 280, 0, topY);
    topGradient.addColorStop(0, '#FFE082');
    topGradient.addColorStop(0.3, '#FFD54F');
    topGradient.addColorStop(0.7, '#FFB300');
    topGradient.addColorStop(1, '#FF9800');

    ctx.font = 'bold 280px Arial';
    ctx.strokeStyle = '#1565C0';
    ctx.lineWidth = 35;
    ctx.strokeText(mainTitleText, textXRight, topY);
    ctx.fillStyle = topGradient;
    ctx.fillText(mainTitleText, textXRight, topY);

    // Draw subtitle if provided
    if (rightSide.subtitle) {
      const bottomGradient = ctx.createLinearGradient(0, bottomY - 200, 0, bottomY);
      bottomGradient.addColorStop(0, '#FFE082');
      bottomGradient.addColorStop(0.3, '#FFD54F');
      bottomGradient.addColorStop(0.7, '#FFB300');
      bottomGradient.addColorStop(1, '#FF9800');

      ctx.font = 'bold 200px Arial';
      ctx.strokeStyle = '#1565C0';
      ctx.lineWidth = 28;
      ctx.strokeText(rightSide.subtitle, textXRight, bottomY);
      ctx.fillStyle = bottomGradient;
      ctx.fillText(rightSide.subtitle, textXRight, bottomY);
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  generateCoverPage,
};
