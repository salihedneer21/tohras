const { PDFDocument } = require('pdf-lib');

/**
 * Split a storybook PDF so that each interior page is divided vertically into two halves.
 * The first page (typically the cover) is preserved as a single page.
 *
 * @param {Buffer|Uint8Array} pdfBuffer - The source PDF bytes.
 * @param {Object} [options]
 * @param {boolean} [options.skipFirstPage=true] - Preserve the first page without splitting.
 * @returns {Promise<{ buffer: Buffer, pageCount: number }>}
 */
async function splitStorybookPdf(pdfBuffer, options = {}) {
  if (!pdfBuffer) {
    throw new Error('Missing PDF buffer for splitting');
  }

  const { skipFirstPage = true } = options;
  const sourceDocument = await PDFDocument.load(pdfBuffer);
  const outputDocument = await PDFDocument.create();
  const sourcePages = sourceDocument.getPages();

  if (!sourcePages.length) {
    const emptyBytes = await outputDocument.save();
    return {
      buffer: Buffer.from(emptyBytes),
      pageCount: 0,
    };
  }

  const firstPageIndex = skipFirstPage ? 1 : 0;

  if (skipFirstPage && sourcePages[0]) {
    const [coverPage] = await outputDocument.copyPages(sourceDocument, [0]);
    outputDocument.addPage(coverPage);
  }

  for (let pageIndex = firstPageIndex; pageIndex < sourcePages.length; pageIndex += 1) {
    const page = sourcePages[pageIndex];
    if (!page) continue;

    const { width, height } = page.getSize();
    if (!width || !height) {
      // Fallback: copy the page as-is if dimensions are invalid.
      const [copiedPage] = await outputDocument.copyPages(sourceDocument, [pageIndex]);
      outputDocument.addPage(copiedPage);
      continue;
    }

    const halfWidth = width / 2;
    const boundingBoxes = [
      { left: 0, bottom: 0, right: halfWidth, top: height }, // Left half
      { left: halfWidth, bottom: 0, right: width, top: height }, // Right half
    ];

    const [topSlice, bottomSlice] = await outputDocument.embedPages(
      [page, page],
      boundingBoxes
    );

    const leftPage = outputDocument.addPage([halfWidth, height]);
    const leftDims = topSlice.scale(1);
    leftPage.drawPage(topSlice, {
      x: 0,
      y: 0,
      width: leftDims.width,
      height: leftDims.height,
    });

    const rightPage = outputDocument.addPage([halfWidth, height]);
    const rightDims = bottomSlice.scale(1);
    rightPage.drawPage(bottomSlice, {
      x: 0,
      y: 0,
      width: rightDims.width,
      height: rightDims.height,
    });
  }

  const outputBytes = await outputDocument.save();
  return {
    buffer: Buffer.from(outputBytes),
    pageCount: outputDocument.getPageCount(),
  };
}

module.exports = {
  splitStorybookPdf,
};
