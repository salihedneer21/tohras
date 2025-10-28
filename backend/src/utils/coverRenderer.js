const { createCanvas, loadImage } = require('canvas');

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

function boxBlur(imageData, width, height, radius) {
  const pixels = imageData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

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

function fitImageCover(ctx, image, width, height) {
  const imgRatio = image.width / image.height;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = drawHeight * imgRatio;
    offsetX = -(drawWidth - width) / 2;
  } else {
    drawWidth = width;
    drawHeight = drawWidth / imgRatio;
    offsetY = -(drawHeight - height) / 2;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function createTextSegments({ headline, bodyText, footer }) {
  const segments = [];
  if (headline) {
    segments.push({
      type: 'text',
      text: headline,
      font: '600 100px Arial',
      lineHeight: 1.08,
      color: 'rgba(255,255,255,0.96)',
    });
    segments.push({ type: 'spacer', size: 28 });
  }
  if (bodyText) {
    segments.push({
      type: 'text',
      text: bodyText,
      font: '70px Arial',
      lineHeight: 1.45,
      color: 'rgba(255,255,255,0.92)',
    });
  }
  segments.push({ type: 'qrBreak' });
  segments.push({ type: 'spacer', size: 28 });
  if (footer) {
    segments.push({
      type: 'text',
      text: footer,
      font: 'bold 60px Arial',
      lineHeight: 1.1,
      color: 'rgba(255,255,255,0.94)',
    });
  }
  return segments;
}

function getFontSize(font) {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  return match ? parseFloat(match[1]) : 24;
}

function layoutText(ctx, segments, startX, startY, maxWidth) {
  const groups = { before: [], after: [] };
  let currentGroup = groups.before;
  segments.forEach((segment) => {
    if (segment.type === 'qrBreak') {
      currentGroup = groups.after;
      return;
    }
    if (segment.type === 'spacer') {
      currentGroup.push({ type: 'spacer', size: segment.size ?? 24 });
      return;
    }
    if (segment.type === 'text') {
      const font = segment.font || '30px Arial';
      const lineHeight = segment.lineHeight || 1.3;
      const color = segment.color;
      const rawLines = segment.text.split('\n');
      rawLines.forEach((rawLine) => {
        if (!rawLine.trim()) {
          currentGroup.push({ type: 'spacer', size: getFontSize(font) * (lineHeight + 0.2) });
          return;
        }
        ctx.font = font;
        const words = rawLine.split(' ');
        let currentLine = '';
        words.forEach((word) => {
          const candidate = currentLine ? `${currentLine} ${word}` : word;
          const width = ctx.measureText(candidate).width;
          if (width > maxWidth && currentLine) {
            currentGroup.push({ type: 'text', text: currentLine, font, lineHeight, color });
            currentLine = word;
          } else {
            currentLine = candidate;
          }
        });
        if (currentLine) {
          currentGroup.push({ type: 'text', text: currentLine, font, lineHeight, color });
        }
      });
    }
  });
  return groups;
}

function layoutLines(lines, startX, startY) {
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
      positioned.push({ ...line, x: startX, y: cursorY });
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

function drawHeroTitle(ctx, childName, width, height) {
  const safeName = childName && childName.trim() ? childName.trim().toUpperCase() : 'YOUR CHILD';
  const topLine = `${safeName}'S TRIP`;
  const bottomLine = 'TO ISRAEL';

  const textX = width * 0.75;
  const bottomMargin = 250;
  const topY = height - bottomMargin - 280;
  const bottomY = topY + 280;

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const topGradient = ctx.createLinearGradient(0, topY - 280, 0, topY);
  topGradient.addColorStop(0, '#FFE082');
  topGradient.addColorStop(0.3, '#FFD54F');
  topGradient.addColorStop(0.7, '#FFB300');
  topGradient.addColorStop(1, '#FF9800');

  ctx.font = 'bold 280px Arial';
  ctx.strokeStyle = '#1565C0';
  ctx.lineWidth = 35;
  ctx.strokeText(topLine, textX, topY);
  ctx.fillStyle = topGradient;
  ctx.fillText(topLine, textX, topY);

  const bottomGradient = ctx.createLinearGradient(0, bottomY - 200, 0, bottomY);
  bottomGradient.addColorStop(0, '#FFE082');
  bottomGradient.addColorStop(0.3, '#FFD54F');
  bottomGradient.addColorStop(0.7, '#FFB300');
  bottomGradient.addColorStop(1, '#FF9800');

  ctx.font = 'bold 200px Arial';
  ctx.strokeStyle = '#1565C0';
  ctx.lineWidth = 28;
  ctx.strokeText(bottomLine, textX, bottomY);
  ctx.fillStyle = bottomGradient;
  ctx.fillText(bottomLine, textX, bottomY);
}

async function renderCoverToCanvas({
  pageWidth,
  pageHeight,
  backgroundBuffer,
  characterBuffer,
  qrBuffer,
  cover,
  bodyText,
  childName,
}) {
  const canvas = createCanvas(pageWidth, pageHeight);
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  ctx.restore();

  let backgroundImage = null;
  if (backgroundBuffer) {
    try {
      backgroundImage = await loadImage(backgroundBuffer);
      fitImageCover(ctx, backgroundImage, pageWidth, pageHeight);
    } catch (error) {
      console.warn('[coverRenderer] Failed to load background image:', error.message);
      backgroundImage = null;
      ctx.fillStyle = '#0b1d3a';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
    }
  } else {
    ctx.fillStyle = '#0b1d3a';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
  }

  let characterImage = null;
  if (characterBuffer) {
    try {
      characterImage = await loadImage(characterBuffer);
    } catch (error) {
      console.warn('[coverRenderer] Failed to load character image:', error.message);
      characterImage = null;
    }
  }

  if (characterImage) {
    const charTargetWidth = pageWidth * 0.5;
    const charTargetHeight = pageHeight * 1.04;
    const charX = pageWidth * 0.5;
    const charY = -pageHeight * 0.02;

    const charAspectRatio = characterImage.width / characterImage.height;
    const targetAspectRatio = charTargetWidth / charTargetHeight;

    let drawWidth;
    let drawHeight;
    let drawX;
    let drawY;

    if (charAspectRatio > targetAspectRatio) {
      drawWidth = charTargetWidth;
      drawHeight = drawWidth / charAspectRatio;
      drawX = charX;
      drawY = charY + (charTargetHeight - drawHeight);
    } else {
      drawHeight = charTargetHeight;
      drawWidth = drawHeight * charAspectRatio;
      drawX = charX + (charTargetWidth - drawWidth) / 2;
      drawY = charY;
    }
    ctx.drawImage(characterImage, drawX, drawY, drawWidth, drawHeight);
  }

  const segments = createTextSegments({
    headline: cover?.headline || '',
    bodyText,
    footer: cover?.footer || '',
  });

  const textX = pageWidth * 0.06;
  const textStartY = pageHeight * 0.22;
  const textMaxWidth = pageWidth * 0.32;

  const textGroups = layoutText(ctx, segments, textX, textStartY, textMaxWidth);
  const beforeLayout = layoutLines(textGroups.before, textX, textStartY);

  const blurPaddingX = pageWidth * 0.03;
  let qrImage = null;
  if (qrBuffer) {
    try {
      qrImage = await loadImage(qrBuffer);
    } catch (error) {
      console.warn('[coverRenderer] Failed to load QR image:', error.message);
      qrImage = null;
    }
  }
  const qrSize = qrImage
    ? Math.min(pageHeight * 0.1, Math.max(pageWidth * 0.06, 100))
    : 0;

  const blurX = Math.max(0, textX - blurPaddingX);
  const blurWidth = Math.min(pageWidth - blurX, textMaxWidth + blurPaddingX * 2);

  const computeLayout = (qrYPosition) => {
    const afterLayout = layoutLines(
      textGroups.after,
      textX,
      qrYPosition + (qrImage ? qrSize + 36 : 0)
    );

    const textBottom = afterLayout.lines.length ? afterLayout.bottom : beforeLayout.bottom;
    const contentBottom = Math.max(textBottom, qrImage ? qrYPosition + qrSize : beforeLayout.bottom);

    const internalPadding = 80;
    const textContentTop = beforeLayout.top - 10;
    let textContentBottom = beforeLayout.bottom;
    if (afterLayout.lines.length) {
      textContentBottom = afterLayout.bottom;
    }
    if (qrImage) {
      textContentBottom = Math.max(textContentBottom, qrYPosition + qrSize);
    }

    const blurHeight = textContentBottom - textContentTop + internalPadding * 2;
    const blurY = pageHeight / 2 - blurHeight / 2;

    return { afterLayout, contentBottom, blurY, blurHeight };
  };

  let qrY = qrImage ? beforeLayout.bottom + 50 : beforeLayout.bottom;
  let { afterLayout, blurY, blurHeight } = computeLayout(qrY);

  if (blurHeight > 0 && blurWidth > 0) {
    const scale = 0.5;
    const tempWidth = Math.floor(blurWidth * scale);
    const tempHeight = Math.floor(blurHeight * scale);
    const blurCanvas = createCanvas(tempWidth, tempHeight);
    const blurCtx = blurCanvas.getContext('2d');

    if (backgroundImage) {
      blurCtx.drawImage(
        backgroundImage,
        blurX,
        blurY,
        blurWidth,
        blurHeight,
        0,
        0,
        tempWidth,
        tempHeight
      );
    } else {
      blurCtx.fillStyle = 'rgba(12, 32, 78, 0.85)';
      blurCtx.fillRect(0, 0, tempWidth, tempHeight);
    }

    const imageData = blurCtx.getImageData(0, 0, tempWidth, tempHeight);
    const blurRadius = 15;
    for (let i = 0; i < 8; i++) {
      boxBlur(imageData, tempWidth, tempHeight, blurRadius);
    }
    blurCtx.putImageData(imageData, 0, 0);

    ctx.save();
    const overlayRadius = 20;
    drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
    ctx.clip();
    ctx.drawImage(blurCanvas, blurX, blurY, blurWidth, blurHeight);

    const edgeFade = 20;
    const fadeGradient = ctx.createLinearGradient(blurX, 0, blurX + edgeFade, 0);
    fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = fadeGradient;
    ctx.fillRect(blurX, blurY, edgeFade, blurHeight);

    ctx.restore();
  }

  const allLines = beforeLayout.lines.concat(afterLayout.lines);
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  allLines.forEach((line) => {
    ctx.font = line.font;
    ctx.fillStyle = line.color || '#ffffff';
    if (line.text.toLowerCase().includes('shop more books')) {
      ctx.textAlign = 'center';
      const centerX = blurX + blurWidth / 2;
      ctx.fillText(line.text, centerX, line.y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line.text, line.x, line.y);
    }
  });

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

  drawHeroTitle(ctx, childName, pageWidth, pageHeight);

  return canvas;
}

async function generateCoverImage(options) {
  const canvas = await renderCoverToCanvas(options);
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateCoverImage,
  renderCoverToCanvas,
};
