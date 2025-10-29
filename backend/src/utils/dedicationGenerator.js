const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

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

        // Calculate dimensions - scale to fit left half, making kid prominent
        const kidAspectRatio = kidImg.width / kidImg.height;

        // Scale to 1.3x canvas height (helps with zoomed-out photos) but constrain to left half
        const scaleFactor = 1.3;
        let drawHeight = height * scaleFactor;
        let drawWidth = drawHeight * kidAspectRatio;

        // Constrain to left half width if it exceeds
        if (drawWidth > halfWidth) {
          drawWidth = halfWidth;
          drawHeight = drawWidth / kidAspectRatio;
        }

        // Position: centered horizontally in left half, aligned to bottom
        const drawX = (halfWidth - drawWidth) / 2; // Center horizontally in left half
        const drawY = height - drawHeight; // Align bottom of kid image with bottom of canvas

        // Draw kid image on left half, centered and bottom-aligned
        ctx.drawImage(kidImg, drawX, drawY, drawWidth, drawHeight);
      } catch (error) {
        console.warn('Failed to load kid image:', error.message);
      }
    }

    // Draw text on right half
    const rightHalfStartX = halfWidth;
    const rightHalfCenterX = rightHalfStartX + (halfWidth / 2); // Center of right half
    const textX = rightHalfCenterX;
    const textMaxWidth = halfWidth - 120; // 60px margin on both sides

    ctx.textAlign = 'center'; // Center align text
    ctx.textBaseline = 'middle';

    // Calculate text dimensions first for vertical centering
    let titleLines = [];
    let titleLineHeight = 0;
    let totalTitleHeight = 0;
    let secondTitleLines = [];
    let secondTitleLineHeight = 0;
    let totalSecondTitleHeight = 0;
    let spacing = 30; // Space between title and second title (reduced gap)

    if (title) {
      ctx.font = 'bold 360px Arial'; // 3x bigger (120px * 3)
      titleLines = wrapText(ctx, title, textMaxWidth);
      titleLineHeight = 420; // Line height for 360px font
      totalTitleHeight = titleLines.length * titleLineHeight;
    }

    if (secondTitle) {
      ctx.font = '160px Arial'; // 2x bigger (80px * 2)
      secondTitleLines = wrapText(ctx, secondTitle, textMaxWidth);
      secondTitleLineHeight = 200; // Line height for 160px font
      totalSecondTitleHeight = secondTitleLines.length * secondTitleLineHeight;
    }

    // Calculate total height of both texts combined
    let totalTextHeight = totalTitleHeight + totalSecondTitleHeight;
    if (title && secondTitle) {
      totalTextHeight += spacing; // Add spacing between texts if both exist
    }

    // Center both texts vertically
    let currentY = (height - totalTextHeight) / 2;

    // Draw title
    if (title) {
      ctx.font = 'bold 360px Arial';
      ctx.fillStyle = '#000000';

      titleLines.forEach((line) => {
        ctx.fillText(line, textX, currentY);
        currentY += titleLineHeight;
      });

      if (secondTitle) {
        currentY += spacing; // Add spacing before second title
      }
    }

    // Draw second title
    if (secondTitle) {
      ctx.font = '160px Arial';
      ctx.fillStyle = '#333333';

      secondTitleLines.forEach((line) => {
        ctx.fillText(line, textX, currentY);
        currentY += secondTitleLineHeight;
      });
    }

    // Return buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error in generateDedicationPage:', error);
    throw error;
  }
}

/**
 * Word wrap helper function
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

module.exports = {
  generateDedicationPage,
};
