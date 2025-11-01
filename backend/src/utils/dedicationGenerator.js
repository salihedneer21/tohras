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

    // Draw dedication text on the right half
    const textAreaX = halfWidth + width * 0.08;
    const textAreaWidth = halfWidth - width * 0.16;
    const textAreaY = height * 0.18;
    const textAreaHeight = height * 0.64;

    renderDedicationTextBlock(ctx, {
      area: {
        x: textAreaX,
        y: textAreaY,
        width: textAreaWidth,
        height: textAreaHeight,
      },
      bigText: secondTitle,
      smallText: title,
    });

    // Return buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in generateDedicationPage:', error);
    throw error;
  }
}

function sanitizeDedicationText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(value || '').trim();
}

function splitDedicationText(value) {
  const sanitized = sanitizeDedicationText(value);
  if (!sanitized) return [];
  return sanitized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function fitCanvasFontSize(ctx, lines, { target, min, maxWidth, weight }) {
  if (!lines.length) {
    return 0;
  }

  const safeMaxWidth = Math.max(1, maxWidth);
  let size = Math.max(Math.round(target), Math.round(min));

  while (size > min) {
    ctx.font = `${weight} ${size}px "CanvaSans"`;
    const isTooWide = lines.some((line) => ctx.measureText(line).width > safeMaxWidth);
    if (!isTooWide) {
      return size;
    }
    size -= Math.max(2, Math.round(size * 0.06));
  }

  size = Math.max(Math.round(min), 20);
  ctx.font = `${weight} ${size}px "CanvaSans"`;
  let stillTooWide = lines.some((line) => ctx.measureText(line).width > safeMaxWidth);
  while (stillTooWide && size > 20) {
    size -= Math.max(1, Math.round(size * 0.05));
    ctx.font = `${weight} ${size}px "CanvaSans"`;
    stillTooWide = lines.some((line) => ctx.measureText(line).width > safeMaxWidth);
  }

  return Math.max(size, 20);
}

function renderDedicationTextBlock(ctx, { area, bigText, smallText }) {
  const primaryLines = splitDedicationText(bigText);
  const secondaryLines = splitDedicationText(smallText);

  if (!primaryLines.length && !secondaryLines.length) {
    return;
  }

  const maxWidth = area.width;
  const areaHeight = area.height;

  const bigTarget = Math.min(480, maxWidth * 0.6, areaHeight * 0.5);
  const bigMin = Math.max(140, Math.round(Math.min(maxWidth, areaHeight) * 0.18));
  const bigFontSize = primaryLines.length
    ? fitCanvasFontSize(ctx, primaryLines, {
        target: bigTarget,
        min: bigMin,
        maxWidth,
        weight: '700',
      })
    : 0;

  let smallFontSize = 0;
  if (secondaryLines.length) {
    const baseSmallTarget = bigFontSize
      ? Math.max(Math.min(bigFontSize * 0.55, bigFontSize - 60), 0)
      : Math.min(260, maxWidth * 0.4, areaHeight * 0.3);
    const smallMin = Math.max(90, Math.round(Math.min(maxWidth, areaHeight) * 0.12));
    const smallTarget = Math.max(baseSmallTarget, smallMin);

    smallFontSize = fitCanvasFontSize(ctx, secondaryLines, {
      target: smallTarget,
      min: smallMin,
      maxWidth,
      weight: '500',
    });

    if (bigFontSize && smallFontSize >= bigFontSize) {
      smallFontSize = Math.max(bigFontSize - 60, smallMin);
    }
  }

  const bigLineHeight = primaryLines.length && bigFontSize ? bigFontSize * 1.05 : 0;
  const bigIntraSpacing =
    primaryLines.length > 1 && bigFontSize ? Math.round(bigFontSize * 0.2) : 0;
  const bigBlockHeight =
    primaryLines.length && bigFontSize
      ? primaryLines.length * bigLineHeight + (primaryLines.length - 1) * bigIntraSpacing
      : 0;

  const smallLineHeight = secondaryLines.length && smallFontSize ? smallFontSize * 1.05 : 0;
  const smallIntraSpacing =
    secondaryLines.length > 1 && smallFontSize ? Math.round(smallFontSize * 0.18) : 0;
  const smallBlockHeight =
    secondaryLines.length && smallFontSize
      ? secondaryLines.length * smallLineHeight + (secondaryLines.length - 1) * smallIntraSpacing
      : 0;

  const blockGap =
    primaryLines.length && secondaryLines.length
      ? Math.round(Math.min(bigFontSize || 0, smallFontSize || 0) * 0.4)
      : 0;

  const totalHeight = bigBlockHeight + smallBlockHeight + blockGap;
  const centerX = area.x + area.width / 2;
  let cursorY = area.y + (area.height - totalHeight) / 2;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (primaryLines.length && bigFontSize) {
    ctx.font = `700 ${Math.round(bigFontSize)}px "CanvaSans"`;
    primaryLines.forEach((line, index) => {
      cursorY += bigLineHeight;
      ctx.fillText(line, centerX, cursorY);
      if (index < primaryLines.length - 1) {
        cursorY += bigIntraSpacing;
      }
    });
  }

  if (secondaryLines.length && smallFontSize) {
    if (primaryLines.length && bigFontSize) {
      cursorY += blockGap;
    }
    ctx.font = `500 ${Math.round(smallFontSize)}px "CanvaSans"`;
    secondaryLines.forEach((line, index) => {
      cursorY += smallLineHeight;
      ctx.fillText(line, centerX, cursorY);
      if (index < secondaryLines.length - 1) {
        cursorY += smallIntraSpacing;
      }
    });
  }

  ctx.restore();
}

module.exports = {
  generateDedicationPage,
};
