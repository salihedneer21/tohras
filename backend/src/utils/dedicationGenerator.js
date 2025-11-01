const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fetch = require('node-fetch');
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const registerDedicationFonts = (() => {
  let registered = false;
  return () => {
    if (registered) return;
    const fontDir = path.join(__dirname, '..', '..', 'fonts');
    const fontEntries = [
      { file: 'CanvaSans-Regular.otf', family: 'CanvaSans', weight: '400' },
      { file: 'CanvaSans-Medium.otf', family: 'CanvaSans', weight: '500' },
      { file: 'CanvaSans-Bold.otf', family: 'CanvaSans', weight: '700' },
      { file: 'CanvaSans-RegularItalic.otf', family: 'CanvaSans', weight: '400', style: 'italic' },
      { file: 'CanvaSans-MediumItalic.otf', family: 'CanvaSans', weight: '500', style: 'italic' },
      { file: 'CanvaSans-BoldItalic.otf', family: 'CanvaSans', weight: '700', style: 'italic' },
    ];
    fontEntries.forEach(({ file, ...options }) => {
      try {
        registerFont(path.join(fontDir, file), options);
      } catch (error) {
        console.warn('[dedicationGenerator] Failed to register font', file, error.message);
      }
    });
    registered = true;
  };
})();

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
 * Load image from buffer or URL
 */
async function loadImageFromSource(source) {
  if (Buffer.isBuffer(source)) {
    return await loadImage(source);
  } else if (typeof source === 'string') {
    const response = await fetch(source);
    const buffer = await response.buffer();
    return await loadImage(buffer);
  } else {
    throw new Error('Invalid image source');
  }
}

function boxBlur(imageData, width, height, radius) {
  const pixels = imageData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let kx = -radius; kx <= radius; kx++) {
        const px = x + kx;
        if (px >= 0 && px < width) {
          const idx = (y * width + px) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          a += pixels[idx + 3];
          count += 1;
        }
      }

      const idx = (y * width + x) * 4;
      tempPixels[idx] = r / count;
      tempPixels[idx + 1] = g / count;
      tempPixels[idx + 2] = b / count;
      tempPixels[idx + 3] = a / count;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        const py = y + ky;
        if (py >= 0 && py < height) {
          const idx = (py * width + x) * 4;
          r += tempPixels[idx];
          g += tempPixels[idx + 1];
          b += tempPixels[idx + 2];
          a += tempPixels[idx + 3];
          count += 1;
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
 * Generate dedication page
 * Canvas: 5375 x 2975 px
 * Left half: Kid image (will be AI-enhanced later)
 * Right half: Title and second title with 50px left margin
 */
async function generateDedicationPage({ backgroundImage, kidImage, title = '', secondTitle = '' }) {
  try {
    registerDedicationFonts();

    const width = 5375;
    const height = 2975;
    const halfWidth = width / 2; // 2687.5px per side

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load background image
    const bgImage = await loadImageFromSource(backgroundImage);

    // Draw background image covering the entire canvas
    ctx.drawImage(bgImage, 0, 0, width, height);

    // Load and draw kid image on the left half with background removal
    if (kidImage) {
      try {
        console.log('Processing kid image with background removal...');

        // Determine if kidImage is a URL or buffer
        let imageUrl;
        if (Buffer.isBuffer(kidImage)) {
          // For buffers, we need to use the URL instead
          // The controller should pass URL for background removal to work
          console.warn('Kid image is a buffer - background removal requires URL');
          imageUrl = kidImage;
        } else {
          imageUrl = kidImage;
        }

        let kidImg;

        // Remove background using Replicate API if it's a URL
        if (typeof imageUrl === 'string') {
          try {
            const removeBgInput = { image: imageUrl };
            const bgRemovedOutput = await replicate.run('bria/remove-background', {
              input: removeBgInput,
            });

            // Load the background-removed image
            const bgRemovedImageResponse = await fetch(bgRemovedOutput);
            const bgRemovedImageBuffer = await bgRemovedImageResponse.buffer();
            kidImg = await loadImage(Buffer.from(bgRemovedImageBuffer));
            console.log('Background removed successfully from kid image');
          } catch (bgError) {
            console.warn('Background removal failed, using original image:', bgError.message);
            kidImg = await loadImageFromSource(kidImage);
          }
        } else {
          // If it's a buffer, use it directly without background removal
          kidImg = await loadImageFromSource(kidImage);
        }

        // Calculate dimensions - match cover page proportions (40% width, 80% height)
        const kidAspectRatio = kidImg.width / kidImg.height;

        // Use same proportions as cover page: 0.4 * 1.1 = 0.44 for width, 0.8 * 1.1 = 0.88 for height
        const baseWidthRatio = 0.4 * 1.1;
        const baseHeightRatio = 0.8 * 1.1;
        const charAreaWidth = width * baseWidthRatio;
        const charAreaHeight = height * baseHeightRatio;

        const targetAspectRatio = charAreaWidth / charAreaHeight;

        let drawWidth;
        let drawHeight;

        if (kidAspectRatio > targetAspectRatio) {
          drawWidth = charAreaWidth;
          drawHeight = drawWidth / kidAspectRatio;
        } else {
          drawHeight = charAreaHeight;
          drawWidth = drawHeight * kidAspectRatio;
        }

        // Position in left half - centered horizontally, aligned to bottom
        const drawX = (halfWidth - drawWidth) / 2;
        const drawY = height - drawHeight - height * 0.02;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 55;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 25;
        ctx.drawImage(kidImg, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
      } catch (error) {
        console.warn('Failed to load kid image:', error.message);
      }
    }

    // Draw text on right half
    const textAreaStartX = halfWidth + width * 0.06;
    const textMaxWidth = halfWidth - width * 0.12;
    const textStartY = height * 0.24;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const segments = buildDedicationSegments({ title, secondTitle });
    const lines = layoutDedicationLines(ctx, segments, textAreaStartX, textStartY, textMaxWidth);
    const blurMetrics = computeDedicationBlurMetrics(lines, {
      textAreaStartX,
      textMaxWidth,
      width,
      height,
      paddingX: width * 0.03,
    });

    if (blurMetrics) {
      const { blurX, blurY, blurWidth, blurHeight } = blurMetrics;
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
      const overlayRadius = 24;
      drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
      ctx.clip();
      ctx.drawImage(blurCanvas, blurX, blurY, blurWidth, blurHeight);
      drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fill();
      ctx.restore();
    }

    drawDedicationText(ctx, lines);

    // Return buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in generateDedicationPage:', error);
    throw error;
  }
}

function buildDedicationSegments({ title = '', secondTitle = '' }) {
  const segments = [];

  // Title = Main heading (larger, bolder) - appears on TOP
  if (title && title.trim()) {
    title.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) {
        segments.push({ type: 'spacer', size: 120 });
      } else {
        segments.push({
          type: 'text',
          text: line,
          font: '800 280px "CanvaSans"', // Even bolder and larger
          lineHeight: 1.12,
          color: 'white',
          isTitle: true,
        });
      }
    });
    segments.push({ type: 'spacer', size: 90 });
  }

  // SecondTitle = Subtitle (smaller, lighter) - appears BELOW title
  if (secondTitle && secondTitle.trim()) {
    secondTitle.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) {
        segments.push({ type: 'spacer', size: 100 });
      } else {
        segments.push({
          type: 'text',
          text: line,
          font: '500 170px "CanvaSans"', // Medium weight
          lineHeight: 1.28,
          color: 'white',
          isTitle: false,
        });
      }
    });
  }

  return segments;
}

function getFontSize(font) {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  return match ? parseFloat(match[1]) : 24;
}

function layoutDedicationLines(ctx, segments, startX, startY, maxWidth) {
  const positioned = [];
  let cursorY = startY;
  let top = Infinity;
  let bottom = -Infinity;

  segments.forEach((segment) => {
    if (segment.type === 'spacer') {
      cursorY += segment.size ?? 120;
      return;
    }
    if (segment.type === 'text') {
      const fontSize = getFontSize(segment.font);
      const leading = segment.lineHeight || 1.2;
      ctx.font = segment.font;
      const measuredWidth = Math.min(ctx.measureText(segment.text).width, maxWidth);
      cursorY += fontSize;
      positioned.push({
        ...segment,
        x: startX,
        y: cursorY,
        width: measuredWidth,
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

  return { lines: positioned, top, bottom };
}

function computeDedicationBlurMetrics(lines, { textAreaStartX, textMaxWidth, width, height, paddingX }) {
  if (!lines || !lines.lines || !lines.lines.length) {
    return null;
  }

  const { top, bottom } = lines;
  const lastLine = lines.lines[lines.lines.length - 1];
  const lastFontSize = lastLine ? getFontSize(lastLine.font) : 0;
  const dynamicPadding = Math.max(40, Math.round(lastFontSize * 0.6));
  const topPadding = 70;
  const bottomPadding = Math.max(100, dynamicPadding);
  const blurHeight = bottom - top + topPadding + bottomPadding;
  let blurY = top - topPadding;
  if (blurY < 0) blurY = 0;
  if (blurY + blurHeight > height) {
    blurY = Math.max(0, height - blurHeight);
  }

  const baseMaxWidth = Math.max(
    textMaxWidth,
    lines.lines.reduce((max, line) => Math.max(max, line.width || 0), 0)
  );
  const desiredWidth = baseMaxWidth + paddingX * 2;
  let blurX = Math.max(0, textAreaStartX - paddingX);
  let blurWidth = desiredWidth;

  if (blurX + blurWidth > width) {
    if (desiredWidth >= width) {
      blurX = 0;
      blurWidth = width;
    } else {
      blurX = Math.max(0, width - desiredWidth);
      blurWidth = desiredWidth;
    }
  }

  return { blurX, blurY, blurWidth, blurHeight };
}

function drawDedicationText(ctx, layout) {
  if (!layout || !layout.lines) return;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  layout.lines.forEach((line) => {
    ctx.font = line.font;
    const fontSize = getFontSize(line.font);

    // Draw text with enhanced shadow and white color
    ctx.save();

    // Stronger shadow for titles, softer for subtitles
    if (line.isTitle) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 28;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 35;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 20;
    }

    // Create white gradient with slight variation for depth
    const gradient = ctx.createLinearGradient(
      line.x,
      line.y - fontSize * 1.1,
      line.x,
      line.y + fontSize * 0.1
    );
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.5, '#F8F8F8');
    gradient.addColorStop(1, '#F0F0F0');

    ctx.fillStyle = gradient;
    ctx.fillText(line.text, line.x, line.y);

    ctx.restore();
  });
}

module.exports = {
  generateDedicationPage,
};
