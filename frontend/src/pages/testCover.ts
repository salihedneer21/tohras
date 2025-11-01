require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, registerFont } = require("canvas");
const fetch = require("node-fetch");
const https = require("https");
const Replicate = require("replicate");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const registerCoverFonts = (() => {
  let registered = false;
  return () => {
    if (registered) return;
    const fontDir = path.resolve(__dirname, "../../../backend/fonts");
    const fontEntries = [
      { file: "CanvaSans-Regular.otf", family: "CanvaSans", weight: "400" },
      { file: "CanvaSans-Medium.otf", family: "CanvaSans", weight: "500" },
      { file: "CanvaSans-Bold.otf", family: "CanvaSans", weight: "700" },
      { file: "CanvaSans-RegularItalic.otf", family: "CanvaSans", weight: "400", style: "italic" },
      { file: "CanvaSans-MediumItalic.otf", family: "CanvaSans", weight: "500", style: "italic" },
      { file: "CanvaSans-BoldItalic.otf", family: "CanvaSans", weight: "700", style: "italic" },
    ];
    fontEntries.forEach(({ file, ...options }) => {
      try {
        registerFont(path.join(fontDir, file), options);
      } catch (error) {
        console.warn("[testCover] Failed to register font", file, error.message);
      }
    });
    registered = true;
  };
})();

function resolveAssetPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Asset not found. Checked: ${candidates.join(", ")}`);
}

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
 * Pixel-level box blur (same as index.js)
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
 * Convert PDF file to PNG image buffer using pdftoppm (Poppler)
 */
async function convertPdfToImage(pdfPath) {
  try {
    console.log(`[pdf] Converting PDF to image: ${pdfPath}`);

    if (!fs.existsSync("./temp")) {
      fs.mkdirSync("./temp");
    }

    const outputPrefix = `./temp/pdf_${Date.now()}`;
    const command = `pdftoppm -png -r 300 -f 1 -l 1 "${pdfPath}" "${outputPrefix}"`;

    await execAsync(command);

    // Find the generated PNG file (pdftoppm adds -1.png suffix)
    const outputFile = `${outputPrefix}-1.png`;

    if (!fs.existsSync(outputFile)) {
      throw new Error(`PDF conversion failed: output file not found at ${outputFile}`);
    }

    console.log(`[pdf] Successfully converted PDF to image`);

    // Read the generated file
    const imageBuffer = fs.readFileSync(outputFile);

    // Clean up temp file
    try {
      fs.unlinkSync(outputFile);
    } catch (cleanupError) {
      console.log(`[pdf] Could not clean up temp file: ${cleanupError.message}`);
    }

    return imageBuffer;
  } catch (error) {
    console.error(`[pdf] Error converting PDF to image:`, error.message);
    throw error;
  }
}

function getFontSize(font) {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  return match ? parseFloat(match[1]) : 24;
}

function buildWrappedLines(ctx, segments, maxWidth) {
  const groups = { before: [], after: [] };
  let currentGroup = groups.before;

  segments.forEach((segment) => {
    if (segment.type === "qrBreak") {
      currentGroup = groups.after;
      return;
    }

    if (segment.type === "spacer") {
      currentGroup.push({
        type: "spacer",
        size: segment.size ?? 24,
      });
      return;
    }

    if (segment.type === "text") {
      const font = segment.font || '30px "CanvaSans"';
      const lineHeight = segment.lineHeight || 1.3;
      const color = segment.color;

      const rawLines = segment.text.split(/\r?\n/);
      rawLines.forEach((rawLine) => {
        if (!rawLine.trim()) {
          currentGroup.push({
            type: "spacer",
            size: getFontSize(font) * (lineHeight + 0.2),
          });
          return;
        }

        currentGroup.push({
          type: "text",
          text: rawLine,
          font,
          lineHeight,
          color,
        });
      });
    }
  });

  return groups;
}

function layoutTextLines(ctx, lines, startX, startY) {
  const positioned = [];
  let cursorY = startY;
  let top = Infinity;
  let bottom = -Infinity;

  lines.forEach((line) => {
    if (line.type === "spacer") {
      cursorY += line.size;
      return;
    }

    if (line.type === "text") {
      const fontSize = getFontSize(line.font);
      const leading = line.lineHeight || 1.3;
      ctx.font = line.font || '30px "CanvaSans"';
      const measuredWidth = ctx.measureText(line.text).width;
      cursorY += fontSize;

      positioned.push({
        ...line,
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

  return { lines: positioned, top, bottom, cursor: cursorY };
}

function drawCurvedTextLine(ctx, text, radius, options = {}) {
  if (!text) {
    return;
  }

  const {
    font = '700 80px "CanvaSans"',
    fillStyle = "#ffd54f",
    strokeStyle = "#0a3ca6",
    lineWidth = 14,
    letterSpacing = 0,
    offsetY = 0,
  } = options;

  ctx.save();
  ctx.translate(0, offsetY);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const totalWidth =
    ctx.measureText(text).width + letterSpacing * Math.max(0, text.length - 1);
  const totalAngle = totalWidth / radius;
  let currentAngle = -totalAngle / 2;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth =
      ctx.measureText(char).width +
      (i < text.length - 1 ? letterSpacing : 0);
    const charAngle = charWidth / radius;

    ctx.save();
    ctx.rotate(currentAngle + charAngle / 2);
    ctx.translate(0, -radius);

    if (strokeStyle) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.strokeText(char, 0, 0);
    }

    ctx.fillStyle = fillStyle;
    ctx.fillText(char, 0, 0);

    ctx.restore();
    currentAngle += charAngle;
  }

  ctx.restore();
}

function drawHeroTitle(ctx, childName, width, height) {
  const safeName =
    childName && childName.trim() ? childName.trim().toUpperCase() : "YOUR CHILD";
  const topLine = `${safeName}'S TRIP`;
  const bottomLine = "TO ISRAEL";

  // SIMPLE STRAIGHT TEXT - GUARANTEED TO WORK
  const textX = width * 0.75;
  const bottomMargin = 250;

  const topY = height - bottomMargin - 280;
  const bottomY = topY + 280; // Position TO ISRAEL right below with minimal gap

  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Draw "CHAIM'S TRIP"
  const topGradient = ctx.createLinearGradient(0, topY - 280, 0, topY);
  topGradient.addColorStop(0, "#FFE082");
  topGradient.addColorStop(0.3, "#FFD54F");
  topGradient.addColorStop(0.7, "#FFB300");
  topGradient.addColorStop(1, "#FF9800");

  ctx.font = '700 280px "CanvaSans"';
  ctx.strokeStyle = "#1565C0";
  ctx.lineWidth = 35;
  ctx.strokeText(topLine, textX, topY);
  ctx.fillStyle = topGradient;
  ctx.fillText(topLine, textX, topY);

  // Draw "TO ISRAEL"
  const bottomGradient = ctx.createLinearGradient(0, bottomY - 200, 0, bottomY);
  bottomGradient.addColorStop(0, "#FFE082");
  bottomGradient.addColorStop(0.3, "#FFD54F");
  bottomGradient.addColorStop(0.7, "#FFB300");
  bottomGradient.addColorStop(1, "#FF9800");

  ctx.font = '700 200px "CanvaSans"';
  ctx.strokeStyle = "#1565C0";
  ctx.lineWidth = 28;
  ctx.strokeText(bottomLine, textX, bottomY);
  ctx.fillStyle = bottomGradient;
  ctx.fillText(bottomLine, textX, bottomY);
}

async function generateBackCover(childName, characterImageUrl, outputPath) {
  registerCoverFonts();
  try {
    console.log("[generate] Starting back cover generation...");

    const backgroundCandidates = [
      path.join(__dirname, "assets", "THIRDBG.pdf"),
      path.join(__dirname, "THIRD BG", "THIRDBG.pdf"),
      path.join(__dirname, "THIRDBG", "THIRDBG.pdf"),
      path.join(__dirname, "bg", "THIRDBG.pdf"),
      path.join(__dirname, "assets", "THIRDBG.jpg"),
      path.join(__dirname, "THIRD BG", "THIRDBG.jpg"),
      path.join(__dirname, "THIRD BG", "THIRD BG.jpg"),
      path.join(__dirname, "THIRDBG", "THIRDBG.jpg"),
      path.join(__dirname, "assets", "THIRD BG.jpg"),
      path.join(__dirname, "bg", "THIRDBG.jpg"),
      path.join(__dirname, "bg", "THIRD BG.jpg"),
    ];
    const bgImagePath = resolveAssetPath(backgroundCandidates);
    console.log(`[generate] Using background: ${bgImagePath}`);

    let bgImage;
    if (bgImagePath.toLowerCase().endsWith(".pdf")) {
      const pdfBuffer = await convertPdfToImage(bgImagePath);
      bgImage = await loadImage(pdfBuffer);
    } else {
      bgImage = await loadImage(bgImagePath);
    }
    const width = bgImage.width;
    const height = bgImage.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(bgImage, 0, 0, width, height);

    console.log("[generate] Loading character artwork...");
    const removeBgInput = { image: characterImageUrl };
    const bgRemovedOutput = await replicate.run("bria/remove-background", {
      input: removeBgInput,
    });
    const bgRemovedImageResponse = await fetch(bgRemovedOutput);
    const bgRemovedImageBuffer = await bgRemovedImageResponse.arrayBuffer();
    const characterImage = await loadImage(Buffer.from(bgRemovedImageBuffer));

    const baseWidthRatio = 0.4 * 1.1;
    const baseHeightRatio = 0.8 * 1.1;
    const charAreaWidth = width * baseWidthRatio;
    const charAreaHeight = height * baseHeightRatio;
    const horizontalMargin = width * 0.02;
    const bottomMargin = height * 0.02;
    const areaX = width - charAreaWidth - horizontalMargin;
    const areaY = Math.max(-height * 0.02, height - charAreaHeight - bottomMargin);

    const charAspectRatio = characterImage.width / characterImage.height;
    const targetAspectRatio = charAreaWidth / charAreaHeight;

    let drawWidth;
    let drawHeight;

    if (charAspectRatio > targetAspectRatio) {
      drawWidth = charAreaWidth;
      drawHeight = drawWidth / charAspectRatio;
    } else {
      drawHeight = charAreaHeight;
      drawWidth = drawHeight * charAspectRatio;
    }

    const drawX = areaX + (charAreaWidth - drawWidth) / 2;
    const drawY = areaY + (charAreaHeight - drawHeight);

    ctx.drawImage(characterImage, drawX, drawY, drawWidth, drawHeight);

    let qrImage = null;
    try {
      const qrCandidates = [
        path.join(__dirname, "FIRST QR", "FIRSTQR.png"),
        path.join(__dirname, "FIRST QR", "FIRST QR.png"),
        path.join(__dirname, "FIRSTQR", "FIRSTQR.png"),
        path.join(__dirname, "assets", "FIRSTQR.png"),
        path.join(__dirname, "assets", "FIRST QR.png"),
        path.join(__dirname, "qr", "FIRSTQR.png"),
      ];
      const qrImagePath = resolveAssetPath(qrCandidates);
      console.log(`[generate] Using QR image: ${qrImagePath}`);
      qrImage = await loadImage(qrImagePath);
    } catch (qrError) {
      console.warn("[generate] QR code image not found. Continuing without it.");
    }

    const narrativeText = `From the sparkling shores of the Kinneret to the ancient stones of the Kotel, ${childName} is on a journey like no other! With his trusty backpack and endless curiosity, he explores Israel's most treasured landmarks - floating in the Dead Sea, climbing Masada at sunrise, and dancing through the colorful streets of Jerusalem.
Packed with wonder, learning, and heart, ${childName}'s Trip to Israel is the perfect introduction to the Land of Israel for young explorers everywhere.`;

    const textSegments = [
      {
        type: "text",
        text: `Join ${childName} on an Unforgettable Adventure Across Israel!`,
        font: '600 100px "CanvaSans"',
        lineHeight: 1.08,
        color: "rgba(255,255,255,0.96)",
      },
      { type: "spacer", size: 28 },
      {
        type: "text",
        text: narrativeText,
        font: '400 70px "CanvaSans"',
        lineHeight: 1.45,
        color: "rgba(255,255,255,0.92)",
      },
      { type: "qrBreak" },
      { type: "spacer", size: 28 },
      {
        type: "text",
        text: "Shop more books at Mytorahtales.com",
        font: '700 60px "CanvaSans"',
        lineHeight: 1.1,
        color: "rgba(255,255,255,0.94)",
      },
    ];

    const textX = width * 0.06;
    const textStartY = height * 0.22; // Adjusted for better centering
    const textMaxWidth = width * 0.32; // Reduced width for book cover

    const textGroups = buildWrappedLines(ctx, textSegments, textMaxWidth);
    const beforeLayout = layoutTextLines(ctx, textGroups.before, textX, textStartY);

    const blurPaddingX = width * 0.03;
    const qrGapTop = qrImage ? 50 : 0;
    const qrGapBottom = qrImage ? 50 : 0;

    const qrSize = qrImage
      ? Math.min(height * 0.10, Math.max(width * 0.06, 100)) // Further reduced QR size
      : 0;

    let blurX = Math.max(0, textX - blurPaddingX);
    const baseMaxLineWidth = Math.max(
      textMaxWidth,
      beforeLayout.lines.reduce((max, line) => Math.max(max, line.width || 0), 0)
    );

    const computeLayout = (qrYPosition) => {
      const afterLayout = layoutTextLines(
        ctx,
        textGroups.after,
        textX,
        qrYPosition + (qrImage ? qrSize + qrGapBottom : 0)
      );

      const textContentTop = beforeLayout.top - 10;
      let textContentBottom = beforeLayout.bottom;
      if (afterLayout.lines.length > 0) {
        textContentBottom = afterLayout.bottom;
      }
      if (qrImage) {
        textContentBottom = Math.max(textContentBottom, qrYPosition + qrSize);
      }

      const lastLineGroup = afterLayout.lines.length > 0 ? afterLayout.lines : beforeLayout.lines;
      const lastLine = lastLineGroup[lastLineGroup.length - 1];
      const lastFontSize = lastLine ? getFontSize(lastLine.font) : 0;
      const dynamicPadding = Math.max(40, Math.round(lastFontSize * 0.6));
      const topPadding = 70;
      const bottomPadding = Math.max(100, dynamicPadding);

      const blurHeight = (textContentBottom - textContentTop) + (topPadding + bottomPadding);
      let blurY = textContentTop - topPadding;
      if (blurY < 0) blurY = 0;
      if (blurY + blurHeight > height) {
        blurY = Math.max(0, height - blurHeight);
      }

      const afterMaxWidth = afterLayout.lines.reduce(
        (max, line) => Math.max(max, line.width || 0),
        0
      );
      const maxLineWidth = Math.max(baseMaxLineWidth, afterMaxWidth, qrImage ? qrSize : 0);
      const desiredWidth = maxLineWidth + blurPaddingX * 2;
      let effectiveBlurX = blurX;
      let blurWidth = desiredWidth;

      if (effectiveBlurX + blurWidth > width) {
        if (desiredWidth >= width) {
          effectiveBlurX = 0;
          blurWidth = width;
        } else {
          effectiveBlurX = Math.max(0, width - desiredWidth);
          blurWidth = desiredWidth;
        }
      }

      return { afterLayout, blurY, blurHeight, blurWidth, blurX: effectiveBlurX };
    };

    // Ensure proper QR positioning with margin from text
    let qrY = qrImage ? beforeLayout.bottom + qrGapTop : beforeLayout.bottom;
    let { afterLayout, blurY, blurHeight, blurWidth, blurX: effectiveBlurX } = computeLayout(qrY);
    blurX = effectiveBlurX;

    const overlayRadius = 20; // Fixed border radius

    if (blurHeight > 0 && blurWidth > 0) {
      // Create larger temporary canvas for stronger blur
      const scale = 0.5; // Downscale for performance
      const tempWidth = Math.floor(blurWidth * scale);
      const tempHeight = Math.floor(blurHeight * scale);

      const blurCanvas = createCanvas(tempWidth, tempHeight);
      const blurCtx = blurCanvas.getContext("2d");

      // Draw scaled down version
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

      // Get pixel data for box blur
      const imageData = blurCtx.getImageData(0, 0, tempWidth, tempHeight);

      // Apply stronger box blur multiple times
      const blurRadius = 15;
      for (let i = 0; i < 8; i++) {
        boxBlur(imageData, tempWidth, tempHeight, blurRadius);
      }

      // Put blurred data back
      blurCtx.putImageData(imageData, 0, 0);

      // Draw blurred background with dark shade overlay
      ctx.save();

      // Draw with smooth rounded corners (20px border radius)
      drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
      ctx.clip();

      // Draw scaled back up for blur effect
      ctx.drawImage(blurCanvas, blurX, blurY, blurWidth, blurHeight);

      // Add dark shade overlay for third cover
      drawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, overlayRadius);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)"; // Dark shade overlay (35% opacity)
      ctx.fill();

      ctx.restore();
    }

    const allTextLines = beforeLayout.lines.concat(afterLayout.lines);

    ctx.textBaseline = "alphabetic";
    // No shadow on left side text
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    allTextLines.forEach((line) => {
      ctx.font = line.font;
      ctx.fillStyle = line.color || "#ffffff";

      // Center align "Shop more books" text, left align others
      if (line.text.includes("Shop more books")) {
        ctx.textAlign = "center";
        const centerX = blurX + blurWidth / 2;
        ctx.fillText(line.text, centerX, line.y);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(line.text, line.x, line.y);
      }
    });

    let qrX = 0;
    if (qrImage && blurHeight > 0) {
      qrX = blurX + (blurWidth - qrSize) / 2;

      const frameX = qrX - 18;
      const frameY = qrY - 18;
      const frameSize = qrSize + 36;

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      drawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 28);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
      ctx.restore();

      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    }

    drawHeroTitle(ctx, childName, width, height);

    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);

    console.log(`[generate] Back cover generated successfully: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("[generate] Error generating back cover:", error);
    throw error;
  }
}

async function loadImageFromUrl(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[loader] Attempt ${attempt}/${maxRetries}: ${url}`);

      const agent = new https.Agent({
        keepAlive: true,
        timeout: 30000,
        keepAliveMsecs: 30000,
      });

      const response = await fetch(url, {
        timeout: 30000,
        agent: url.startsWith("https") ? agent : undefined,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      console.log(`[loader] Loaded image (${buffer.length} bytes)`);

      return await loadImage(buffer);
    } catch (error) {
      console.error(`[loader] Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[loader] Waiting ${delay}ms before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function example() {
  try {
    console.log("[example] Starting back cover generation example...");

    const dataPath = path.join(__dirname, "test-data.json");
    const testData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const characterImageUrl = testData.pages[0].characterImageUrl;
    const childName = "Chaim";

    await generateBackCover(childName, characterImageUrl, "./back-cover.png");

    console.log("[example] Back cover created successfully.");
  } catch (error) {
    console.error("[example] Error creating back cover:", error);
  }
}

module.exports = { generateBackCover, example };

if (require.main === module) {
  example();
}
