require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { createCanvas, loadImage } = require("canvas");
const fetch = require("node-fetch");
const https = require("https");
const Replicate = require("replicate");
const { fromPath } = require("pdf2pic");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Generate PDF with alternating layout of background images, character images, text, and Hebrew quotes
 * @param {Array} data - Array of objects containing { backgroundImageUrl, characterImageUrl, text, hebrewQuote }
 * @param {string} outputPath - Path where the PDF will be saved
 */
async function generatePDF(data, outputPath) {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Use standard PDF fonts instead of custom fonts
    const { StandardFonts } = require("pdf-lib");
    const canvaSansFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const hebrewFont = await pdfDoc.embedFont(StandardFonts.Helvetica); // Using Helvetica for now - you'll need a proper Hebrew font later

    // Define page dimensions (A4 landscape: 297mm x 210mm converted to points)
    const pageWidth = 842; // 297mm in points
    const pageHeight = 421; // 210mm in points

    for (let i = 0; i < data.length; i++) {
      const { backgroundImageUrl, characterImageUrl, text, hebrewQuote } =
        data[i];

      console.log(`Processing page ${i + 1}/${data.length}`);

      // Add a new page
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Determine layout based on index (right/left alternating)
      const isCharacterOnRight = i % 2 === 0;

      try {
        // Load background image
        console.log("Loading background image...");
        const backgroundImageBuffer = await loadImageFromUrl(
          backgroundImageUrl
        );

        // Load character image (keep original background)
        console.log("Loading character image...");
        const removeBgInput = {
          image: characterImageUrl,
        };

        const bgRemovedOutput = await replicate.run("bria/remove-background", {
          input: removeBgInput,
        });

        const bgRemovedImageResponse = await fetch(bgRemovedOutput);
        const bgRemovedImageBuffer = await bgRemovedImageResponse.arrayBuffer();

        // Embed images in PDF
        const pdfBackgroundImage = await pdfDoc.embedPng(backgroundImageBuffer);
        const pdfCharacterImage = await pdfDoc.embedPng(bgRemovedImageBuffer);

        // Draw background image to fill entire page
        page.drawImage(pdfBackgroundImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });

        // Calculate character image dimensions (max 40% of page width, maintain within page bounds)
        const charAspectRatio =
          pdfCharacterImage.width / pdfCharacterImage.height;
        const maxCharWidth = pageWidth * 0.4;
        const maxCharHeight = pageHeight * 0.8; // Leave some margin

        let charWidth, charHeight;
        if (charAspectRatio > maxCharWidth / maxCharHeight) {
          charWidth = maxCharWidth;
          charHeight = charWidth / charAspectRatio;
        } else {
          charHeight = maxCharHeight;
          charWidth = charHeight * charAspectRatio;
        }

        // Position character image aligned to page edges
        let charX;
        if (isCharacterOnRight) {
          // Character on right: align right edge of character to right edge of page
          charX = pageWidth - charWidth;
        } else {
          // Character on left: align left edge of character to left edge of page
          charX = 0;
        }
        const charY = 0; // Bottom aligned to page bottom

        // Draw character image
        page.drawImage(pdfCharacterImage, {
          x: charX,
          y: charY,
          width: charWidth,
          height: charHeight,
        });

        // Add Hebrew quote positioning
        const hebrewBaseFontSize = 16; // Base font size (smaller than before)
        const hebrewX = isCharacterOnRight
          ? charX + charWidth * 0.1
          : charX + charWidth * 0.1;
        const hebrewY = charY + charHeight + 20;

        // Render Hebrew quote with scroll-like wave effect
        if (hebrewQuote && hebrewQuote.trim()) {
          const wrappedHebrew = wrapText(
            hebrewQuote,
            charWidth * 0.8,
            hebrewBaseFontSize
          );

          wrappedHebrew.forEach((line, lineIndex) => {
            // Split line into individual characters for wave effect
            const chars = line.split("");
            const centerIndex = Math.floor(chars.length / 2);

            chars.forEach((char, charIndex) => {
              // Calculate position in wave
              const progress = charIndex / (chars.length - 1); // 0 to 1
              const wave = Math.sin(progress * Math.PI); // Create wave pattern

              // Calculate vertical offset for wave effect
              const waveY = wave * 8; // 8 points wave height

              // Calculate font size variation (smaller at edges, larger in middle)
              const sizeFactor = 1 + Math.cos(progress * Math.PI) * 0.3; // 0.7 to 1.3
              const fontSize = hebrewBaseFontSize * sizeFactor;

              // Calculate x position with proper spacing
              const previousCharsWidth = chars
                .slice(0, charIndex)
                .reduce((width, c) => width + hebrewBaseFontSize * 0.6, 0);
              const x = hebrewX + previousCharsWidth;
              const y = hebrewY - lineIndex * hebrewBaseFontSize * 1.4 + waveY;

              // Draw white outline
              // [-0.5, 0.5].forEach((dx) => {
              //   [-0.5, 0.5].forEach((dy) => {
              //     page.drawText(char, {
              //       x: x + dx,
              //       y: y + dy,
              //       size: fontSize,
              //       font: hebrewFont,
              //       color: rgb(1, 1, 1),
              //     });
              //   });
              // });

              // Draw black text
              // page.drawText(char, {
              //   x,
              //   y,
              //   size: fontSize,
              //   font: hebrewFont,
              //   color: rgb(0, 0, 0),
              // });
            });
          });
        }

        // Add text on opposite side of character with improved positioning and styling
        let textX, maxTextWidth;

        if (isCharacterOnRight) {
          // Character on right, text on left: 40px margin from left edge
          textX = 40;
          maxTextWidth = 300; // Available space minus margins (40px on each side)
        } else {
          // Character on left, text on right: 40px margin from right edge
          textX = pageWidth - 340;
          maxTextWidth = 300; // Available space minus right margin
        }

        const textY = pageHeight * 0.7; // Position text in upper portion
        const fontSize = 16;
        const lineHeight = fontSize * 1.4;

        // Wrap text to fit within maxTextWidth
        const wrappedText = wrapText(text, maxTextWidth, fontSize);

        // Calculate text block height
        const textBlockHeight = wrappedText.length * lineHeight;

        // Create blurred background for text (expanded more on left side)
        const leftPadding = 90;  // More padding on left
        const rightPadding = 60; // Keep right padding as is
        const verticalPadding = 40; // Reduced top/bottom padding

        const blurredBgBuffer = await createBlurredBackground(
          backgroundImageBuffer,
          textX - leftPadding,
          textY - textBlockHeight - verticalPadding,
          maxTextWidth + leftPadding + rightPadding,
          textBlockHeight + verticalPadding * 2,
          15 // blur radius in pixels (pixel-level box blur)
        );

        // Embed and draw the blurred background
        const blurredBgImage = await pdfDoc.embedPng(blurredBgBuffer);
        page.drawImage(blurredBgImage, {
          x: textX - leftPadding,
          y: textY - textBlockHeight - verticalPadding,
          width: maxTextWidth + leftPadding + rightPadding,
          height: textBlockHeight + verticalPadding * 2,
        });

        // Draw text lines (English text) - white text on blurred background
        wrappedText.forEach((line, index) => {
          const x = textX;
          const y = textY - index * lineHeight - 18;

          // Draw white text
          page.drawText(line, {
            x,
            y,
            size: fontSize,
            font: canvaSansFont,
            color: rgb(1, 1, 1), // White color
          });
        });

        console.log(`✅ Page ${i + 1} completed successfully`);
      } catch (imageError) {
        console.error(
          `❌ Error processing images for page ${i + 1}:`,
          imageError.message
        );
      }
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`📄 PDF generated successfully: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    throw error;
  }
}

/**
 * Load image from URL or local file and convert to PNG buffer with retry logic
 */
async function loadImageFromUrl(url, maxRetries = 3) {
  // Check if this is a local file path (PDF or image)
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    try {
      console.log(`  Loading local file: ${url}`);

      // Check if file is a PDF
      if (url.toLowerCase().endsWith(".pdf")) {
        return await convertPdfToImage(url);
      }

      // Load local image file
      const buffer = fs.readFileSync(url);
      const image = await loadImage(buffer);

      // Convert to PNG buffer using canvas
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      console.log(`  ✅ Successfully loaded local file (${buffer.length} bytes)`);
      return canvas.toBuffer("image/png");
    } catch (error) {
      console.error(`  ❌ Error loading local file:`, error.message);
      throw error;
    }
  }

  // Handle URL downloads with retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${maxRetries} for: ${url}`);

      // Create custom agent with longer timeout and keep-alive
      const agent = new https.Agent({
        keepAlive: true,
        timeout: 30000, // 30 seconds
        keepAliveMsecs: 30000,
      });

      const response = await fetch(url, {
        timeout: 30000, // 30 second timeout
        agent: url.startsWith("https") ? agent : undefined,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      console.log(`  ✅ Successfully loaded image (${buffer.length} bytes)`);

      const image = await loadImage(buffer);

      // Convert to PNG buffer using canvas
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      return canvas.toBuffer("image/png");
    } catch (error) {
      console.error(`  ❌ Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        // On final failure, try to create a placeholder image
        console.log(`  🎨 Creating placeholder image for: ${url}`);
        return createPlaceholderImage(400, 500, `Image ${attempt} failed`);
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  ⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Convert PDF file to PNG image buffer
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function convertPdfToImage(pdfPath) {
  try {
    console.log(`  Converting PDF to image: ${pdfPath}`);

    // Configure pdf2pic
    const options = {
      density: 300,           // DPI for high quality
      saveFilename: "temp",   // Temporary filename
      savePath: "./temp",     // Temporary directory
      format: "png",          // Output format
      width: 2400,            // Width in pixels (for high quality at 300 DPI)
      height: 1200,           // Height in pixels
    };

    // Create temp directory if it doesn't exist
    if (!fs.existsSync("./temp")) {
      fs.mkdirSync("./temp");
    }

    const convert = fromPath(pdfPath, options);

    // Convert first page only
    const pageToConvert = 1;
    const result = await convert(pageToConvert, { responseType: "buffer" });

    console.log(`  ✅ Successfully converted PDF to image`);

    // Clean up temp files
    try {
      if (fs.existsSync(result.path)) {
        fs.unlinkSync(result.path);
      }
    } catch (cleanupError) {
      console.log(`  Note: Could not clean up temp file: ${cleanupError.message}`);
    }

    return result.buffer;
  } catch (error) {
    console.error(`  ❌ Error converting PDF to image:`, error.message);
    throw error;
  }
}

/**
 * Create a placeholder image when the original fails to load
 */
function createPlaceholderImage(width, height, text) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Fill with light gray background
  ctx.fillRect(0, 0, width, height);

  // Add border
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // Add text
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Image Not Available", width / 2, height / 2 - 20);
  ctx.font = "14px Arial";
  ctx.fillText(text, width / 2, height / 2 + 20);

  return canvas.toBuffer("image/png");
}

/**
 * Simple box blur using pixel manipulation
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
 * Create a blurred background with pixel-level box blur
 */
async function createBlurredBackground(backgroundImageBuffer, x, y, width, height, blurRadius = 20) {
  try {
    // Load the background image
    const bgImage = await loadImage(backgroundImageBuffer);

    // Calculate which portion of the background to extract
    const scaleX = bgImage.width / 842; // pageWidth
    const scaleY = bgImage.height / 421; // pageHeight

    // Create canvas for the background portion
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Draw the portion of background
    ctx.drawImage(
      bgImage,
      x * scaleX,
      (421 - y - height) * scaleY,
      width * scaleX,
      height * scaleY,
      0,
      0,
      width,
      height
    );

    // Get image data for pixel manipulation
    const imageData = ctx.getImageData(0, 0, width, height);

    // Apply box blur multiple times for stronger effect
    boxBlur(imageData, width, height, blurRadius);
    boxBlur(imageData, width, height, blurRadius); // Second pass

    // Put blurred data back
    ctx.putImageData(imageData, 0, 0);

    // Create final masked canvas with oval shape and feathered edges
    const maskedCanvas = createCanvas(width, height);
    const maskedCtx = maskedCanvas.getContext("2d");

    // Draw the blurred image first
    maskedCtx.drawImage(canvas, 0, 0);

    // Get the image data to apply feathered mask
    const maskImageData = maskedCtx.getImageData(0, 0, width, height);
    const pixels = maskImageData.data;

    // Create feathered oval mask
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width / 2.2;
    const radiusY = height / 2;
    const featherSize = 30; // Size of the feather/fade in pixels

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Calculate normalized distance from center (elliptical)
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate alpha based on distance with feathering
        let alpha = 1;
        if (distance > 1) {
          // Outside the oval - fully transparent
          alpha = 0;
        } else if (distance > 1 - featherSize / Math.min(radiusX, radiusY)) {
          // In the feather zone - smooth transition
          const featherDistance = (1 - distance) / (featherSize / Math.min(radiusX, radiusY));
          alpha = Math.pow(featherDistance, 1.5); // Smooth curve using power function
        }

        // Apply alpha to pixel
        const idx = (y * width + x) * 4;
        pixels[idx + 3] = pixels[idx + 3] * alpha; // Multiply existing alpha
      }
    }

    // Put modified image data back
    maskedCtx.putImageData(maskImageData, 0, 0);

    return maskedCanvas.toBuffer("image/png");
  } catch (error) {
    console.error("Error creating blurred background:", error);
    // Fallback - semi-transparent white oval
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const radiusX = width / 2.2;
    const radiusY = height / 2;

    ctx.beginPath();
    ctx.moveTo(radiusX, 0);
    ctx.lineTo(width - radiusX, 0);
    ctx.quadraticCurveTo(width, 0, width, radiusY);
    ctx.lineTo(width, height - radiusY);
    ctx.quadraticCurveTo(width, height, width - radiusX, height);
    ctx.lineTo(radiusX, height);
    ctx.quadraticCurveTo(0, height, 0, height - radiusY);
    ctx.lineTo(0, radiusY);
    ctx.quadraticCurveTo(0, 0, radiusX, 0);
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();

    return canvas.toBuffer("image/png");
  }
}

/**
 * Simple text wrapping function
 */
function wrapText(text, maxWidth, fontSize) {
  if (!text) return [];

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  // Improved character width calculation
  const avgCharWidth = fontSize * 0.45; // adjusted multiplier
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

  for (const word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;

    // More accurate line length calculation
    const lineLength = testLine.length * avgCharWidth;

    if (lineLength <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is too long, force break
        lines.push(word);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Example usage function
async function example() {
  try {
    console.log("🚀 Starting PDF generation...");
    const testData = JSON.parse(fs.readFileSync("./test-data.json", "utf8"));
    await generatePDF(testData.pages, "./output.pdf");
    console.log("🎉 Example PDF created successfully!");
  } catch (error) {
    console.error("💥 Error creating example PDF:", error);
  }
}

// Export the functions
module.exports = { generatePDF, example };

// If this file is run directly, run the example
if (require.main === module) {
  example();
}