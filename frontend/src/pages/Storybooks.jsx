import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Download,
  Image as ImageIcon,
  ImageOff,
  Upload,
  Sparkles,
  PlugZap,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  RefreshCw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  FileImage,
} from 'lucide-react';
import { bookAPI, trainingAPI, userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const JOB_HISTORY_LIMIT = 10;

const JOB_STATUS_META = {
  queued: { label: 'Queued', variant: 'outline' },
  generating: { label: 'Generating', variant: 'default' },
  assembling: { label: 'Assembling', variant: 'warning' },
  succeeded: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const PAGE_STATUS_META = {
  queued: { label: 'Queued', tone: 'text-foreground/60' },
  generating: { label: 'Generating', tone: 'text-foreground' },
  ranking: { label: 'Ranking', tone: 'text-foreground' },
  completed: { label: 'Completed', tone: 'text-emerald-400' },
  failed: { label: 'Failed', tone: 'text-red-400' },
};

const sortByCreatedAtDesc = (a, b) =>
  new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

const mergeJobPayload = (current = {}, incoming = {}) => {
  const merged = {
    ...current,
    ...incoming,
  };

  merged.events = Array.isArray(incoming.events)
    ? incoming.events
    : Array.isArray(current.events)
    ? current.events
    : [];

  merged.pages = Array.isArray(incoming.pages)
    ? incoming.pages
    : Array.isArray(current.pages)
    ? current.pages
    : [];

  return merged;
};

const upsertJobList = (list, incoming) => {
  if (!incoming?._id) {
    return list;
  }

  const existingIndex = list.findIndex((item) => item._id === incoming._id);
  if (existingIndex === -1) {
    const next = [incoming, ...list];
    return next.sort(sortByCreatedAtDesc).slice(0, JOB_HISTORY_LIMIT);
  }

  const next = [...list];
  next[existingIndex] = mergeJobPayload(list[existingIndex], incoming);
  return next.sort(sortByCreatedAtDesc).slice(0, JOB_HISTORY_LIMIT);
};

const getJobStatusMeta = (status) => JOB_STATUS_META[status] || JOB_STATUS_META.queued;
const getPageStatusMeta = (status) => PAGE_STATUS_META[status] || PAGE_STATUS_META.queued;

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h${remMinutes ? ` ${remMinutes}m` : ''}`;
  }

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m${remainingSeconds ? ` ${remainingSeconds}s` : ''}`;
};

const CHARACTER_POSITION_OPTIONS = [
  { value: 'auto', label: 'Auto alternate' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const NAME_PLACEHOLDER_DETECTION = /\{name\}/i;

const containsNamePlaceholder = (value) =>
  typeof value === 'string' ? NAME_PLACEHOLDER_DETECTION.test(value) : false;

const getGenderPronouns = (gender) => {
  if (!gender) return { subject: '', possessive: '', object: '' };
  const lowerGender = gender.toLowerCase();
  if (lowerGender === 'male') {
    return { subject: 'He', possessive: 'His', object: 'Him' };
  }
  if (lowerGender === 'female') {
    return { subject: 'She', possessive: 'Hers', object: 'Her' };
  }
  return { subject: 'They', possessive: 'Their', object: 'Them' };
};

const replaceNamePlaceholders = (value, replacement) => {
  if (!value || typeof value !== 'string') {
    return value || '';
  }
  if (!replacement) return value;
  return value.replace(/\{name\}/gi, replacement);
};

const replacePlaceholders = (value, readerName, readerGender) => {
  if (!value || typeof value !== 'string') {
    return value || '';
  }
  let result = value;
  if (readerName) {
    result = result.replace(/\{name\}/gi, readerName);
  }
  if (readerGender) {
    const pronouns = getGenderPronouns(readerGender);
    result = result.replace(/\{gender\}/gi, pronouns.subject);
    result = result.replace(/\{genderpos\}/gi, pronouns.possessive);
    result = result.replace(/\{genderper\}/gi, pronouns.object);
  }
  return result;
};

const resolveCoverText = ({ cover = {}, bodyFallback = '', readerName = '' }) => {
  const uppercaseName =
    typeof cover.uppercaseName === 'boolean' ? cover.uppercaseName : true;
  const baseName = readerName || cover.childName || '';
  const resolvedName = uppercaseName ? baseName.toUpperCase() : baseName;
  const apply = (text) => {
    if (!text || typeof text !== 'string') return text || '';
    if (!baseName) return text;
    return text.replace(/\{name\}/gi, resolvedName || baseName);
  };

  const headline = apply(cover.headline || '');
  const footer = apply(cover.footer || '');
  const bodyTextRaw = cover.bodyOverride ? apply(cover.bodyOverride) : apply(bodyFallback);

  return {
    headline,
    footer,
    bodyText: bodyTextRaw,
    uppercaseName,
    childName: resolvedName || baseName,
  };
};

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Missing image source'));
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image ${src}`));
    image.src = src;
  });

const coverDrawRoundedRect = (ctx, x, y, width, height, radius) => {
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
};

const coverBoxBlur = (imageData, width, height, radius) => {
  const pixels = imageData.data;
  const tempPixels = new Uint8ClampedArray(pixels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let kx = -radius; kx <= radius; kx += 1) {
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

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let ky = -radius; ky <= radius; ky += 1) {
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
};

const coverFitImage = (ctx, image, width, height) => {
  if (!image) return;
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
};

const coverCreateSegments = ({ headline, bodyText, footer }) => {
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
};

const coverGetFontSize = (font) => {
  const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
  return match ? parseFloat(match[1]) : 24;
};

const coverLayoutText = (ctx, segments, startX, startY, maxWidth) => {
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
      segment.text.split('\n').forEach((rawLine) => {
        if (!rawLine.trim()) {
          currentGroup.push({ type: 'spacer', size: coverGetFontSize(font) * (lineHeight + 0.2) });
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
};

const coverLayoutLines = (lines, startX, startY) => {
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
      const fontSize = coverGetFontSize(line.font);
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
};

const coverDrawHero = (ctx, childName, width, height) => {
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
};

const renderCoverPreview = async (canvas, model, signal) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = PDF_PAGE_WIDTH;
  canvas.height = PDF_PAGE_HEIGHT;

  ctx.fillStyle = '#0b1d3a';
  ctx.fillRect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

  let backgroundImage = null;
  if (model.backgroundSrc) {
    try {
      backgroundImage = await loadImageElement(model.backgroundSrc);
      if (signal?.cancelled) return;
      coverFitImage(ctx, backgroundImage, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);
    } catch (error) {
      console.warn('[coverPreview] background load failed:', error.message);
      ctx.fillStyle = '#0b1d3a';
      ctx.fillRect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);
    }
  }

  let characterImage = null;
  if (model.characterSrc) {
    try {
      characterImage = await loadImageElement(model.characterSrc);
      if (signal?.cancelled) return;
    } catch (error) {
      console.warn('[coverPreview] character load failed:', error.message);
    }
  }

  let qrImage = null;
  if (model.qrSrc) {
    try {
      qrImage = await loadImageElement(model.qrSrc);
      if (signal?.cancelled) return;
    } catch (error) {
      console.warn('[coverPreview] qr load failed:', error.message);
    }
  }

  if (characterImage) {
    const charTargetWidth = PDF_PAGE_WIDTH * 0.5;
    const charTargetHeight = PDF_PAGE_HEIGHT * 1.04;
    const charX = PDF_PAGE_WIDTH * 0.5;
    const charY = -PDF_PAGE_HEIGHT * 0.02;
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

  const bodyText = model.cover?.bodyOverride || model.bodyText || '';
  const segments = coverCreateSegments({
    headline: model.cover?.headline || '',
    bodyText,
    footer: model.cover?.footer || '',
  });

  const textX = PDF_PAGE_WIDTH * 0.06;
  const textStartY = PDF_PAGE_HEIGHT * 0.22;
  const textMaxWidth = PDF_PAGE_WIDTH * 0.32;
  const textGroups = coverLayoutText(ctx, segments, textX, textStartY, textMaxWidth);
  const beforeLayout = coverLayoutLines(textGroups.before, textX, textStartY);

  const blurPaddingX = PDF_PAGE_WIDTH * 0.12;
  const qrSize = qrImage
    ? Math.min(PDF_PAGE_HEIGHT * 0.1, Math.max(PDF_PAGE_WIDTH * 0.06, 100))
    : 0;
  const blurX = Math.max(0, textX - blurPaddingX);
  const blurWidth = Math.min(PDF_PAGE_WIDTH - blurX, textMaxWidth + blurPaddingX * 2);

  const computeLayout = (qrYPosition) => {
    const afterLayout = coverLayoutLines(
      textGroups.after,
      textX,
      qrYPosition + (qrImage ? qrSize + 36 : 0)
    );

    const textBottom = afterLayout.lines.length ? afterLayout.bottom : beforeLayout.bottom;
    const contentBottom = Math.max(
      textBottom,
      qrImage ? qrYPosition + qrSize : beforeLayout.bottom
    );

    const internalPadding = 120;
    const textContentTop = beforeLayout.top - 10;
    let textContentBottom = beforeLayout.bottom;
    if (afterLayout.lines.length) {
      textContentBottom = afterLayout.bottom;
    }
    if (qrImage) {
      textContentBottom = Math.max(textContentBottom, qrYPosition + qrSize);
    }

    const blurHeight = textContentBottom - textContentTop + internalPadding * 2;
    const blurY = PDF_PAGE_HEIGHT / 2 - blurHeight / 2;

    return { afterLayout, blurY, blurHeight };
  };

  let qrY = qrImage ? beforeLayout.bottom + 50 : beforeLayout.bottom;
  let { afterLayout, blurY, blurHeight } = computeLayout(qrY);

  if (blurHeight > 0 && blurWidth > 0) {
    const scale = 0.5;
    const tempWidth = Math.max(1, Math.floor(blurWidth * scale));
    const tempHeight = Math.max(1, Math.floor(blurHeight * scale));
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = tempWidth;
    blurCanvas.height = tempHeight;
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
    for (let i = 0; i < 8; i += 1) {
      coverBoxBlur(imageData, tempWidth, tempHeight, 15);
    }
    blurCtx.putImageData(imageData, 0, 0);

    ctx.save();
    coverDrawRoundedRect(ctx, blurX, blurY, blurWidth, blurHeight, 60);
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
    coverDrawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.restore();

    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  }

  coverDrawHero(ctx, model.cover?.childName || '', PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);
};

const CoverPagePreview = React.memo(({ model, className = '' }) => {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  if (model.renderedImageSrc) {
    return (
      <div className={['h-full w-full overflow-hidden', className].filter(Boolean).join(' ')}>
        <img
          src={model.renderedImageSrc}
          alt="Cover page preview"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    const canvas = canvasRef.current;
    setError(null);
    if (!canvas) return () => {
      cancelled = true;
      signal.cancelled = true;
    };

    renderCoverPreview(canvas, model, signal).catch((err) => {
      if (!cancelled) {
        console.warn('[coverPreview] rendering failed:', err.message);
        setError(err);
      }
    });

    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, [
    model.cacheToken,
    model.backgroundSrc,
    model.characterSrc,
    model.qrSrc,
    model.cover?.headline,
    model.cover?.footer,
    model.cover?.bodyOverride,
    model.cover?.childName,
    model.bodyText,
  ]);

  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-muted text-xs ${className}`}>
        Cover preview unavailable
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={['h-full w-full object-contain', className].filter(Boolean).join(' ')}
    />
  );
});

const DedicationPagePreview = React.memo(({ model, className = '' }) => {
  if (!model) return null;
  const dedication = model.dedicationPage || {};

  if (model.renderedImageSrc) {
    return (
      <div className={['h-full w-full overflow-hidden', className].filter(Boolean).join(' ')}>
        <img
          src={model.renderedImageSrc}
          alt="Dedication page preview"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={[
        'relative h-full w-full overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ aspectRatio: '5375 / 2975' }}
    >
      {dedication.backgroundSrc ? (
        <img
          src={dedication.backgroundSrc}
          alt="Dedication background"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-black/15 to-black/35" />
      <div className="relative grid h-full w-full grid-cols-2">
        <div className="relative flex items-end justify-center p-[6%]">
          {dedication.kidSrc ? (
            <img
              src={dedication.kidSrc}
              alt="Featured child"
              className="max-h-[95%] w-auto object-contain drop-shadow-[0_25px_55px_rgba(0,0,0,0.45)]"
            />
          ) : null}
        </div>
        <div className="relative flex flex-col items-center justify-center px-[8%] text-center text-white">
          {dedication.title ? (
            <p className="text-5xl font-extrabold tracking-tight drop-shadow-[0_12px_25px_rgba(0,0,0,0.45)]">
              {dedication.title}
            </p>
          ) : null}
          {dedication.secondTitle ? (
            <p className="mt-6 text-2xl font-medium leading-snug drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
              {dedication.secondTitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
});

const PDF_PAGE_WIDTH = 842;
const PDF_PAGE_HEIGHT = 421;
const PDF_CHARACTER_MAX_WIDTH_RATIO = 0.4;
const PDF_CHARACTER_MAX_HEIGHT_RATIO = 0.8;
const PDF_TEXT_BLOCK_WIDTH = 300;
const PDF_TEXT_BLOCK_WIDTH_RATIO = 0.35;
const PDF_TEXT_MARGIN = 40;
const PDF_FONT_SIZE = 16;
const PDF_LINE_HEIGHT = PDF_FONT_SIZE * 1.4;
const TEXT_BASELINE_OFFSET = 18;
const TEXT_BG_LEFT_PADDING = 90;
const TEXT_BG_RIGHT_PADDING = 60;
const TEXT_BG_VERTICAL_PADDING = 40;
const HEBREW_BASE_FONT_SIZE = 16;
const HEBREW_LINE_HEIGHT = HEBREW_BASE_FONT_SIZE * 1.4;
const HEBREW_WAVE_AMPLITUDE = 8;

const wrapTextToLines = (text, maxWidth, fontSize) => {
  if (!text) return [];

  // Split by newlines to preserve admin's exact line breaks
  // No auto-wrapping - respect only the line breaks provided by admin
  const lines = text.split(/\r?\n/).map(line => line.trim());

  return lines;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const withCacheBust = (url, token) => {
  if (!url) return '';
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}cb=${encodeURIComponent(token)}`;
};

const resolveAssetUrl = (asset) => {
  if (!asset) return '';
  const direct = typeof asset.url === 'string' ? asset.url.trim() : '';
  if (direct) return direct;
  const download = typeof asset.downloadUrl === 'string' ? asset.downloadUrl.trim() : '';
  if (download) return download;
  const signed = typeof asset.signedUrl === 'string' ? asset.signedUrl.trim() : '';
  if (signed) return signed;
  return '';
};

const getDisplayPageNumber = (pageType, pageOrder, fallbackIndex) => {
  if (pageType === 'cover') return 1;
  if (pageType === 'dedication') return 2;
  const baseOrder =
    Number.isFinite(pageOrder) && pageOrder > 0 ? pageOrder : fallbackIndex + 1;
  return baseOrder + 2;
};

const buildPagePreviewModel = ({
  page,
  index = 0,
  assetIdentifier = 'storybook',
  assetUpdatedAt,
  readerName = '',
  readerGender = '',
}) => {
  if (!page) return null;

  const safeIndex = Number.isInteger(index) ? index : 0;
  const rawType = page.pageType;
  const pageType = rawType === 'cover' ? 'cover' : rawType === 'dedication' ? 'dedication' : 'story';
  const pageLabel = getDisplayPageNumber(pageType, page.order, safeIndex);
  const cacheToken = page.updatedAt || assetUpdatedAt || `${assetIdentifier}-${pageLabel}`;

  const renderedImageSrc = page.renderedImage
    ? withCacheBust(
        resolveAssetUrl(page.renderedImage),
        `${cacheToken}-rendered-${pageLabel}`
      )
    : '';

  if (pageType === 'cover') {
    const coverPage = page.coverPage || {};
    const backgroundAsset = coverPage.backgroundImage || page.background || null;
    const characterAsset = coverPage.characterImage || page.character || null;
    const qrAsset = coverPage.qrCode || page.cover?.qrCodeImage || null;

    const backgroundSrc = withCacheBust(
      resolveAssetUrl(backgroundAsset),
      `${cacheToken}-background-${pageLabel}`
    );
    const characterSrc = withCacheBust(
      resolveAssetUrl(characterAsset),
      `${cacheToken}-character-${pageLabel}`
    );
    const qrSrc = qrAsset
      ? withCacheBust(resolveAssetUrl(qrAsset), `${cacheToken}-qr-${pageLabel}`)
      : '';

    const leftSide = {
      title: replaceNamePlaceholders(coverPage.leftSide?.title, readerName),
      content: replaceNamePlaceholders(coverPage.leftSide?.content, readerName),
      bottomText: replaceNamePlaceholders(coverPage.leftSide?.bottomText, readerName),
    };
    const rightSide = {
      mainTitle: (replaceNamePlaceholders(coverPage.rightSide?.mainTitle, readerName) || '').toUpperCase(),
      subtitle: replaceNamePlaceholders(coverPage.rightSide?.subtitle, readerName),
    };

    const syntheticCover =
      page.cover ||
      {
        headline: coverPage.leftSide?.title || '',
        footer: coverPage.leftSide?.bottomText || '',
        bodyOverride: coverPage.leftSide?.content || '',
        uppercaseName: true,
        childName: page.childName || readerName || '',
        qrCodeImage: qrAsset || null,
      };

    const resolvedCover = resolveCoverText({
      cover: syntheticCover,
      bodyFallback: page.text || '',
      readerName,
    });

    return {
      pageType: 'cover',
      cacheToken,
      pageLabel,
      renderedImageSrc,
      backgroundSrc,
      characterSrc,
      qrSrc,
      cover: {
        headline: resolvedCover.headline,
        footer: resolvedCover.footer,
        bodyOverride: syntheticCover.bodyOverride ? resolvedCover.bodyText : '',
        uppercaseName: resolvedCover.uppercaseName,
        childName: resolvedCover.childName,
      },
      bodyText: resolvedCover.bodyText,
      coverPage: {
        backgroundSrc,
        characterSrc,
        qrSrc,
        leftSide,
        rightSide,
      },
    };
  }

  if (pageType === 'dedication') {
    const dedicationPage = page.dedicationPage || {};
    const backgroundAsset = dedicationPage.backgroundImage || page.background || null;
    const kidAsset = dedicationPage.generatedImage || dedicationPage.kidImage || null;

    const backgroundSrc = withCacheBust(
      resolveAssetUrl(backgroundAsset),
      `${cacheToken}-background-${pageLabel}`
    );
    const kidSrc = kidAsset
      ? withCacheBust(resolveAssetUrl(kidAsset), `${cacheToken}-kid-${pageLabel}`)
      : '';

    return {
      pageType: 'dedication',
      cacheToken,
      pageLabel,
      renderedImageSrc,
      dedicationPage: {
        backgroundSrc,
        kidSrc,
        title: replaceNamePlaceholders(dedicationPage.title, readerName),
        secondTitle: replaceNamePlaceholders(dedicationPage.secondTitle, readerName),
      },
    };
  }

  const isCharacterOnRight = safeIndex % 2 === 0;
  const backgroundSrc = withCacheBust(
    resolveAssetUrl(page.background),
    `${cacheToken}-background-${pageLabel}`
  );
  const characterSrc = withCacheBust(
    resolveAssetUrl(page.character),
    `${cacheToken}-character-${pageLabel}`
  );

  const hasCharacter = Boolean(characterSrc);
  const characterMaxWidth = hasCharacter ? PDF_PAGE_WIDTH * PDF_CHARACTER_MAX_WIDTH_RATIO : 0;
  const characterMaxHeight = hasCharacter ? PDF_PAGE_HEIGHT * PDF_CHARACTER_MAX_HEIGHT_RATIO : 0;
  const characterX = isCharacterOnRight ? PDF_PAGE_WIDTH - characterMaxWidth : 0;
  const characterSvgY = PDF_PAGE_HEIGHT - (characterMaxHeight + 0);
  const characterFrame = hasCharacter
    ? {
        x: characterX,
        y: characterSvgY,
        width: characterMaxWidth,
        height: characterMaxHeight,
        preserveAspectRatio: isCharacterOnRight ? 'xMaxYMax meet' : 'xMinYMax meet',
      }
    : null;

  const textBlockWidth = Math.min(
    Math.max(PDF_PAGE_WIDTH * PDF_TEXT_BLOCK_WIDTH_RATIO, PDF_TEXT_BLOCK_WIDTH),
    PDF_PAGE_WIDTH - PDF_TEXT_MARGIN * 2
  );
  const processedText = replacePlaceholders(page.text || '', readerName, readerGender);
  const textLines = wrapTextToLines(processedText, textBlockWidth, PDF_FONT_SIZE);
  const textBaseline = PDF_PAGE_HEIGHT * 0.7;
  const textHeight = textLines.length * PDF_LINE_HEIGHT;
  const textX = isCharacterOnRight
    ? PDF_TEXT_MARGIN
    : PDF_PAGE_WIDTH - textBlockWidth - PDF_TEXT_MARGIN;

  const rawBgX = textX - TEXT_BG_LEFT_PADDING;
  const rawBgY = textBaseline - textHeight - TEXT_BG_VERTICAL_PADDING;
  const rawBgWidth = textBlockWidth + TEXT_BG_LEFT_PADDING + TEXT_BG_RIGHT_PADDING;
  const rawBgHeight = textHeight + TEXT_BG_VERTICAL_PADDING * 2;

  const bgX = clamp(rawBgX, 0, PDF_PAGE_WIDTH - 1);
  const bgY = clamp(rawBgY, 0, PDF_PAGE_HEIGHT - 1);
  const xOffset = bgX - rawBgX;
  const yOffset = bgY - rawBgY;
  const availableWidth = Math.max(1, Math.round(PDF_PAGE_WIDTH - bgX));
  const availableHeight = Math.max(1, Math.round(PDF_PAGE_HEIGHT - bgY));
  const bgWidth = Math.min(Math.max(1, Math.round(rawBgWidth - xOffset)), availableWidth);
  const bgHeight = Math.min(Math.max(1, Math.round(rawBgHeight - yOffset)), availableHeight);

  const hebrewQuote = (page.hebrewQuote || page.quote || '').trim();
  const availableHebrewWidth = clamp(
    Math.max(characterMaxWidth * 0.8, PDF_PAGE_WIDTH * 0.3),
    80,
    PDF_PAGE_WIDTH - PDF_TEXT_MARGIN * 2
  );
  const hebrewBaseX = characterMaxWidth
    ? characterX + characterMaxWidth * 0.1
    : isCharacterOnRight
    ? PDF_TEXT_MARGIN
    : PDF_PAGE_WIDTH - availableHebrewWidth - PDF_TEXT_MARGIN;
  const hebrewMinX = PDF_TEXT_MARGIN;
  const hebrewMaxX = Math.max(hebrewMinX, PDF_PAGE_WIDTH - availableHebrewWidth - PDF_TEXT_MARGIN);
  const hebrewX = clamp(hebrewBaseX, hebrewMinX, hebrewMaxX);
  const hebrewBaseY = characterMaxHeight + 20;
  const hebrewY = clamp(hebrewBaseY, PDF_TEXT_MARGIN, PDF_PAGE_HEIGHT - HEBREW_BASE_FONT_SIZE);
  const hebrewLines = hebrewQuote
    ? wrapTextToLines(hebrewQuote, availableHebrewWidth, HEBREW_BASE_FONT_SIZE)
    : [];

  return {
    pageType: 'story',
    cacheToken,
    pageLabel,
    isCharacterOnRight,
    backgroundSrc,
    characterSrc,
    characterFrame,
    text: {
      lines: textLines,
      x: textX,
      baseline: textBaseline,
      blockWidth: textBlockWidth,
      overlay: {
        x: bgX,
        y: PDF_PAGE_HEIGHT - (bgY + bgHeight),
        width: bgWidth,
        height: bgHeight,
      },
    },
    hebrew: {
      lines: hebrewLines,
      x: hebrewX,
      baseline: hebrewY,
      width: availableHebrewWidth,
    },
  };
};

const StorybookPageSvg = React.memo(
  ({ model, className = '' }) => {
    if (!model) return null;

    if (model.pageType === 'cover') {
      return <CoverPagePreview model={model} className={className} />;
    }
    if (model.pageType === 'dedication') {
      return <DedicationPagePreview model={model} className={className} />;
    }

    const { backgroundSrc, characterSrc, characterFrame, pageLabel, text, hebrew } = model;
    const hasTextOverlay = Boolean(text?.lines?.length && text.overlay);
    const hasHebrew = Boolean(hebrew?.lines?.length);
    const blurId = React.useMemo(() => `storybook-blur-${pageLabel}`, [pageLabel]);
    const maskId = React.useMemo(() => `storybook-mask-${pageLabel}`, [pageLabel]);
    const svgClasses = ['h-full', 'w-full', className].filter(Boolean).join(' ');
    const toSvgY = (pdfY) => PDF_PAGE_HEIGHT - pdfY;

    return (
      <svg
        viewBox={`0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}`}
        className={svgClasses}
        role="img"
        aria-label={`Storybook page ${pageLabel}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {hasTextOverlay ? (
            <>
              <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="12" edgeMode="duplicate" />
              </filter>
              <radialGradient id={`${maskId}-gradient`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="82%" stopColor="white" stopOpacity="1" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id={maskId}>
                <ellipse
                  cx={text.overlay.x + text.overlay.width / 2 - 20}
                  cy={text.overlay.y + text.overlay.height / 2}
                  rx={text.overlay.width / 2.2 * 1.12}
                  ry={text.overlay.height / 2 * 1.12}
                  fill={`url(#${maskId}-gradient)`}
                />
              </mask>
            </>
          ) : null}
        </defs>

        {backgroundSrc ? (
          <image
            href={backgroundSrc}
            x="0"
            y="0"
            width={PDF_PAGE_WIDTH}
            height={PDF_PAGE_HEIGHT}
            preserveAspectRatio="none"
          />
        ) : (
          <rect x="0" y="0" width={PDF_PAGE_WIDTH} height={PDF_PAGE_HEIGHT} fill="#10131a" />
        )}

        {characterSrc && characterFrame ? (
          <image
            href={characterSrc}
            x={characterFrame.x}
            y={characterFrame.y}
            width={characterFrame.width}
            height={characterFrame.height}
            preserveAspectRatio={characterFrame.preserveAspectRatio}
          />
        ) : null}

        {hasTextOverlay ? (
          <>
            <g mask={`url(#${maskId})`}>
              {backgroundSrc ? (
                <image
                  href={backgroundSrc}
                  x="0"
                  y="0"
                  width={PDF_PAGE_WIDTH}
                  height={PDF_PAGE_HEIGHT}
                  preserveAspectRatio="none"
                  filter={`url(#${blurId})`}
                />
              ) : (
                <rect
                  x={text.overlay.x}
                  y={text.overlay.y}
                  width={text.overlay.width}
                  height={text.overlay.height}
                  fill="rgba(0, 0, 0, 0.45)"
                />
              )}
            </g>
            {text.lines.map((line, index) => {
              const baseline = text.baseline - index * PDF_LINE_HEIGHT - TEXT_BASELINE_OFFSET;
              const svgY = toSvgY(baseline);
              return (
                <text
                  key={`text-line-${pageLabel}-${index}`}
                  x={text.x}
                  y={svgY}
                  fontSize={PDF_FONT_SIZE}
                  fontFamily="Helvetica, Arial, sans-serif"
                  fill="#ffffff"
                  dominantBaseline="alphabetic"
                >
                  {line}
                </text>
              );
            })}
          </>
        ) : null}

        {hasHebrew ? (
          <g>
            {hebrew.lines.map((line, lineIndex) => {
              const chars = line.split('');
              if (!chars.length) return null;
              const totalChars = Math.max(chars.length - 1, 1);
              let cursorX = hebrew.x;
              return (
                <React.Fragment key={`hebrew-line-${pageLabel}-${lineIndex}`}>
                  {chars.map((char, charIndex) => {
                    const progress = totalChars > 0 ? charIndex / totalChars : 0.5;
                    const sizeFactor = 1 + Math.cos(progress * Math.PI) * 0.3;
                    const fontSize = HEBREW_BASE_FONT_SIZE * sizeFactor;
                    const waveOffset = Math.sin(progress * Math.PI) * HEBREW_WAVE_AMPLITUDE;
                    const pdfY =
                      hebrew.baseline - lineIndex * HEBREW_LINE_HEIGHT + waveOffset;
                    const svgY = toSvgY(pdfY);
                    const x = cursorX;
                    cursorX += fontSize * 0.6;
                    const key = `hebrew-char-${pageLabel}-${lineIndex}-${charIndex}`;
                    return (
                      <React.Fragment key={key}>
                        {[[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]].map(([dx, dy], outlineIdx) => (
                          <text
                            key={`${key}-outline-${outlineIdx}`}
                            x={x + dx}
                            y={svgY + dy}
                            fontSize={fontSize}
                            fontFamily="Helvetica, Arial, sans-serif"
                            fill="rgba(0, 0, 0, 0.7)"
                          >
                            {char}
                          </text>
                        ))}
                        <text
                          x={x}
                          y={svgY}
                          fontSize={fontSize}
                          fontFamily="Helvetica, Arial, sans-serif"
                          fill="#ffffff"
                        >
                          {char}
                        </text>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </g>
        ) : null}
      </svg>
    );
  },
  (prev, next) => {
    if (!prev.model && !next.model) return true;
    if (!prev.model || !next.model) return false;
    if (prev.model.pageType !== next.model.pageType) return false;

    if (prev.model.pageType === 'cover') {
      return (
        prev.model.cacheToken === next.model.cacheToken &&
        prev.model.backgroundSrc === next.model.backgroundSrc &&
        prev.model.characterSrc === next.model.characterSrc &&
        prev.model.qrSrc === next.model.qrSrc &&
        prev.model.cover?.headline === next.model.cover?.headline &&
        prev.model.cover?.footer === next.model.cover?.footer &&
        prev.model.cover?.bodyOverride === next.model.cover?.bodyOverride &&
        prev.model.cover?.childName === next.model.cover?.childName &&
        prev.model.bodyText === next.model.bodyText
      );
    }

    return (
      prev.model.cacheToken === next.model.cacheToken &&
      prev.model.pageLabel === next.model.pageLabel &&
      prev.model.backgroundSrc === next.model.backgroundSrc &&
      prev.model.characterSrc === next.model.characterSrc &&
      (prev.model.text?.lines || []).join('\n') === (next.model.text?.lines || []).join('\n') &&
      (prev.model.hebrew?.lines || []).join('\n') === (next.model.hebrew?.lines || []).join('\n')
    );
  }
);

const cloneCoverConfig = (cover) => {
  if (!cover || typeof cover !== 'object') return null;
  const extractLegacy = () => {
    if (!Array.isArray(cover.textSegments)) return { headline: '', body: '', footer: '' };
    const textSegments = cover.textSegments.filter((segment) => segment?.type === 'text');
    if (!textSegments.length) return { headline: '', body: '', footer: '' };
    const headlineSegment = textSegments[0]?.text || '';
    const footerSegment = textSegments.length > 1 ? textSegments[textSegments.length - 1].text || '' : '';
    const middleSegments = textSegments.slice(1, Math.max(textSegments.length - 1, 1));
    const body = middleSegments
      .map((segment) => (typeof segment?.text === 'string' ? segment.text : ''))
      .filter(Boolean)
      .join('\n');
    return { headline: headlineSegment, body, footer: footerSegment };
  };

  const legacy = extractLegacy();

  return {
    headline:
      typeof cover.headline === 'string' && cover.headline.trim()
        ? cover.headline
        : legacy.headline || '',
    footer:
      typeof cover.footer === 'string' && cover.footer.trim()
        ? cover.footer
        : legacy.footer || '',
    bodyOverride:
      typeof cover.bodyOverride === 'string' && cover.bodyOverride.trim()
        ? cover.bodyOverride
        : legacy.body || '',
    uppercaseName:
      typeof cover.uppercaseName === 'boolean' ? cover.uppercaseName : true,
    qrCodeImage: cover.qrCodeImage ? { ...cover.qrCodeImage } : null,
  };
};

const cloneCoverPageConfig = (coverPage) => {
  if (!coverPage || typeof coverPage !== 'object') return null;
  return {
    backgroundImage: coverPage.backgroundImage ? { ...coverPage.backgroundImage } : null,
    characterImage: coverPage.characterImage ? { ...coverPage.characterImage } : null,
    qrCode: coverPage.qrCode ? { ...coverPage.qrCode } : null,
    characterPrompt:
      typeof coverPage.characterPrompt === 'string' ? coverPage.characterPrompt : '',
    leftSide: {
      title: typeof coverPage.leftSide?.title === 'string' ? coverPage.leftSide.title : '',
      content: typeof coverPage.leftSide?.content === 'string' ? coverPage.leftSide.content : '',
      bottomText:
        typeof coverPage.leftSide?.bottomText === 'string' ? coverPage.leftSide.bottomText : '',
    },
    rightSide: {
      mainTitle:
        typeof coverPage.rightSide?.mainTitle === 'string' ? coverPage.rightSide.mainTitle : '',
      subtitle:
        typeof coverPage.rightSide?.subtitle === 'string' ? coverPage.rightSide.subtitle : '',
    },
  };
};

const cloneDedicationPageConfig = (dedicationPage) => {
  if (!dedicationPage || typeof dedicationPage !== 'object') return null;
  return {
    backgroundImage: dedicationPage.backgroundImage ? { ...dedicationPage.backgroundImage } : null,
    kidImage: dedicationPage.kidImage ? { ...dedicationPage.kidImage } : null,
    generatedImage: dedicationPage.generatedImage ? { ...dedicationPage.generatedImage } : null,
    characterPrompt:
      typeof dedicationPage.characterPrompt === 'string' ? dedicationPage.characterPrompt : '',
    title: typeof dedicationPage.title === 'string' ? dedicationPage.title : '',
    secondTitle:
      typeof dedicationPage.secondTitle === 'string' ? dedicationPage.secondTitle : '',
  };
};

const normaliseAssetPages = (pages) => {
  if (!Array.isArray(pages)) return [];
  const pageTypePriority = {
    cover: -2,
    dedication: -1,
    story: 0,
  };
  return pages
    .map((entry) => {
      const rawType = entry?.pageType;
      const pageType =
        rawType === 'cover' ? 'cover' : rawType === 'dedication' ? 'dedication' : 'story';
      const cover = pageType === 'cover' ? cloneCoverConfig(entry.cover) : null;
      const coverPage = pageType === 'cover' ? cloneCoverPageConfig(entry.coverPage) : null;
      const dedicationPage =
        pageType === 'dedication' ? cloneDedicationPageConfig(entry.dedicationPage) : null;

      const candidateAssetsSource = Array.isArray(entry?.candidateAssets)
        ? entry.candidateAssets
        : pageType === 'cover' && Array.isArray(entry?.coverPage?.candidateAssets)
        ? entry.coverPage.candidateAssets
        : pageType === 'dedication' && Array.isArray(entry?.dedicationPage?.candidateAssets)
        ? entry.dedicationPage.candidateAssets
        : [];

      const selectedCandidateIndexSource = Number.isFinite(entry?.selectedCandidateIndex)
        ? entry.selectedCandidateIndex
        : pageType === 'cover' && Number.isFinite(entry?.coverPage?.selectedCandidateIndex)
        ? entry.coverPage.selectedCandidateIndex
        : pageType === 'dedication' && Number.isFinite(entry?.dedicationPage?.selectedCandidateIndex)
        ? entry.dedicationPage.selectedCandidateIndex
        : null;

      const rankingSummarySource =
        typeof entry?.rankingSummary === 'string'
          ? entry.rankingSummary
          : pageType === 'cover' && typeof entry?.coverPage?.rankingSummary === 'string'
          ? entry.coverPage.rankingSummary
          : pageType === 'dedication' && typeof entry?.dedicationPage?.rankingSummary === 'string'
          ? entry.dedicationPage.rankingSummary
          : '';

      const rankingNotesSource = Array.isArray(entry?.rankingNotes)
        ? entry.rankingNotes
        : pageType === 'cover' && Array.isArray(entry?.coverPage?.rankingNotes)
        ? entry.coverPage.rankingNotes
        : pageType === 'dedication' && Array.isArray(entry?.dedicationPage?.rankingNotes)
        ? entry.dedicationPage.rankingNotes
        : [];

      const pagePrompt =
        typeof entry?.prompt === 'string'
          ? entry.prompt
          : pageType === 'cover' && typeof entry?.coverPage?.prompt === 'string'
          ? entry.coverPage.prompt
          : pageType === 'dedication' && typeof entry?.dedicationPage?.prompt === 'string'
          ? entry.dedicationPage.prompt
          : entry?.text || '';
      return {
        ...entry,
        pageType,
        cover,
        coverPage,
        dedicationPage,
        background: entry?.background ? { ...entry.background } : null,
        character: entry?.character ? { ...entry.character } : null,
        characterOriginal: entry?.characterOriginal ? { ...entry.characterOriginal } : null,
        candidateAssets: candidateAssetsSource.map((asset) => ({ ...asset })),
        selectedCandidateIndex: selectedCandidateIndexSource,
        generationId: entry?.generationId || null,
        renderedImage: entry?.renderedImage ? { ...entry.renderedImage } : null,
        childName: typeof entry?.childName === 'string' ? entry.childName : '',
        rankingSummary: rankingSummarySource,
        rankingNotes: rankingNotesSource.map((note) => ({ ...note })),
        prompt: pagePrompt,
      };
    })
    .sort((a, b) => {
      const priorityDiff =
        (pageTypePriority[a.pageType] || 0) - (pageTypePriority[b.pageType] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.order || 0) - (b.order || 0);
    });
};

const normaliseIdentifier = (value) => {
  if (!value && value !== 0) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (typeof value.$oid === 'string') return value.$oid;
    if (typeof value.toString === 'function') return value.toString();
  }
  return `${value}`;
};

const resolveAssetId = (asset) => {
  if (!asset) return '';
  return normaliseIdentifier(asset._id || asset.id || asset.key);
};

const resolveAssetVariant = (asset) => {
  const value = typeof asset?.variant === 'string' ? asset.variant.toLowerCase() : '';
  return value === 'split' ? 'split' : 'standard';
};

// Page Thumbnail Component - matches main preview exactly
const PageThumbnail = React.memo(
  ({ page, index, isActive, onClick, assetUpdatedAt, assetIdentifier, readerName, readerGender }) => {
    const previewModel = useMemo(
      () =>
        buildPagePreviewModel({
          page,
          index,
          assetUpdatedAt,
          assetIdentifier: assetIdentifier || 'storybook',
          readerName,
          readerGender,
        }),
      [assetIdentifier, assetUpdatedAt, index, page, readerName, readerGender]
    );

    return (
      <button
        onClick={onClick}
        className={`w-full overflow-hidden transition-colors ${
          isActive ? 'ring-2 ring-accent shadow-md' : 'ring-1 ring-border/40 hover:ring-accent/60'
        }`}
      >
        <div
          className="relative w-full bg-transparent border border-border/40"
          style={{ aspectRatio: `${PDF_PAGE_WIDTH}/${PDF_PAGE_HEIGHT}` }}
        >
          {previewModel ? (
            <StorybookPageSvg model={previewModel} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 bg-muted/20" />
          )}
        </div>
      </button>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isActive === nextProps.isActive &&
      prevProps.page.order === nextProps.page.order &&
      prevProps.page.updatedAt === nextProps.page.updatedAt &&
      prevProps.assetUpdatedAt === nextProps.assetUpdatedAt &&
      prevProps.assetIdentifier === nextProps.assetIdentifier &&
      prevProps.index === nextProps.index &&
      prevProps.readerName === nextProps.readerName
    );
  }
);

function Storybooks() {
  const [books, setBooks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [storyTitle, setStoryTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [trainings, setTrainings] = useState([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [storybookJobs, setStorybookJobs] = useState([]);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const handledJobCompletionsRef = useRef(new Set());
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [activeAsset, setActiveAsset] = useState(null);
  const [activeAssetPages, setActiveAssetPages] = useState([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [regeneratingOrder, setRegeneratingOrder] = useState(null);
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [applyingCandidateKey, setApplyingCandidateKey] = useState('');
  const [confirmingAssetId, setConfirmingAssetId] = useState('');
  const preloadRefs = useRef([]);

  const selectedReader = useMemo(
    () => users.find((user) => user._id === selectedUserId) || null,
    [selectedUserId, users]
  );

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [booksResponse, usersResponse] = await Promise.all([
          bookAPI.getAll({ limit: 0 }),
          userAPI.getAll({ limit: 0 }),
        ]);
        if (booksResponse?.success === false) {
          throw new Error(booksResponse?.message || 'Failed to load books');
        }
        if (usersResponse?.success === false) {
          throw new Error(usersResponse?.message || 'Failed to load users');
        }
        setBooks(Array.isArray(booksResponse?.data) ? booksResponse.data : []);
        setUsers(Array.isArray(usersResponse?.data) ? usersResponse.data : []);
      } catch (error) {
        toast.error(`Failed to load storybook data: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchBookDetails = useCallback(
    async (bookId, { preserveTitle = false } = {}) => {
      if (!bookId) return;
      try {
        setLoadingBook(true);
        const response = await bookAPI.getById(bookId);
        if (!response?.success || !response.data) {
          throw new Error(response?.message || 'Book not found');
        }
        const book = response.data;
        const normalisedPdfAssets = Array.isArray(book.pdfAssets)
          ? book.pdfAssets.map((asset) => ({
              ...asset,
              variant: resolveAssetVariant(asset),
              derivedFromAssetId: asset?.derivedFromAssetId || null,
              derivedFromAssetKey: asset?.derivedFromAssetKey || null,
              confirmedAt: asset?.confirmedAt || null,
              metadata: asset?.metadata || null,
              pages: normaliseAssetPages(asset.pages),
            }))
          : [];
        setSelectedBook({
          ...book,
          pdfAssets: normalisedPdfAssets,
        });
        setStoryTitle((prev) => {
          if (preserveTitle && prev) return prev;
          if (prev) return prev;
          return `${book.name} Storybook`;
        });
        setPages(
          (book.pages || []).map((page) => ({
            id: page._id,
            order: page.order,
             pageType: page.pageType === 'cover' ? 'cover' : 'story',
            text: page.text || '',
            prompt: page.characterPrompt || page.prompt || '',
            useCharacter: true,
            characterPosition: 'auto',
            backgroundImageUrl:
              page.backgroundImage?.url || page.characterImage?.url || '',
            characterFile: null,
            characterPreview: '',
            characterUrl: page.characterImage?.url || '',
            quote: page.quote || page.hebrewQuote || '',
            cover: page.pageType === 'cover' ? cloneCoverConfig(page.cover) : null,
          }))
        );
      } catch (error) {
        toast.error(`Failed to load book details: ${error.message}`);
        setSelectedBook(null);
        setPages([]);
      } finally {
        setLoadingBook(false);
      }
    },
    []
  );

  const disconnectJobStream = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreamConnected(false);
  }, []);

  const handleJobCompletion = useCallback(
    (job) => {
      if (!job || job.status !== 'succeeded') return;
      if (job.bookId && selectedBookId && job.bookId !== selectedBookId) return;

      if (handledJobCompletionsRef.current.has(job._id)) {
        return;
      }
      handledJobCompletionsRef.current.add(job._id);

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const existingAssets = Array.isArray(prev.pdfAssets) ? prev.pdfAssets : [];
        const alreadyPresent = existingAssets.some((asset) => asset.key === job.pdfAsset?.key);
        const enrichedPdfAsset = job.pdfAsset
          ? {
              ...job.pdfAsset,
              variant: resolveAssetVariant(job.pdfAsset),
              derivedFromAssetId: job.pdfAsset?.derivedFromAssetId || null,
              derivedFromAssetKey: job.pdfAsset?.derivedFromAssetKey || null,
              confirmedAt: job.pdfAsset?.confirmedAt || null,
              metadata: job.pdfAsset?.metadata || null,
              pages: normaliseAssetPages(job.pdfAsset.pages),
            }
          : null;
        const nextAssets =
          enrichedPdfAsset && !alreadyPresent
            ? [enrichedPdfAsset, ...existingAssets]
            : existingAssets;
        return {
          ...prev,
          pdfAssets: nextAssets,
        };
      });

      if (selectedBookId) {
        fetchBookDetails(selectedBookId, { preserveTitle: true });
      }

      toast.success('Storybook automation completed');
    },
    [fetchBookDetails, selectedBookId]
  );

  const applyJobUpdate = useCallback(
    (payload) => {
      if (!payload?._id) return;
      setStorybookJobs((previous) => upsertJobList(previous, payload));
      if (payload.status === 'succeeded') {
        handleJobCompletion(payload);
      }
    },
    [handleJobCompletion]
  );

  const fetchStorybookJobs = useCallback(
    async (bookId) => {
      if (!bookId) {
        setStorybookJobs([]);
        handledJobCompletionsRef.current = new Set();
        return;
      }
      try {
        const response = await bookAPI.getStorybookJobs(bookId, { limit: JOB_HISTORY_LIMIT });
        if (response?.success === false) {
          throw new Error(response?.message || 'Failed to load storybook runs');
        }
        const jobs = Array.isArray(response?.data) ? response.data : [];
        setStorybookJobs(jobs.sort(sortByCreatedAtDesc));
        handledJobCompletionsRef.current = new Set(
          jobs.filter((job) => job.status === 'succeeded').map((job) => job._id)
        );
      } catch (error) {
        toast.error(`Failed to load storybook runs: ${error.message}`);
      }
    },
    []
  );

  const connectJobStream = useCallback(
    (bookId) => {
      disconnectJobStream();
      if (!bookId) return;

      const streamUrl = `${API_BASE_URL}/books/storybooks/stream/live?bookId=${bookId}`;
      const source = new EventSource(streamUrl);
      eventSourceRef.current = source;

      source.onopen = () => {
        setIsStreamConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      source.onmessage = (event) => {
        if (!event?.data) return;
        try {
          const payload = JSON.parse(event.data);
          applyJobUpdate(payload);
        } catch (parseError) {
          console.error('Failed to parse storybook stream payload', parseError);
        }
      };

      source.onerror = () => {
        setIsStreamConnected(false);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectJobStream(bookId);
          }, 4000);
        }
      };
    },
    [applyJobUpdate, disconnectJobStream]
  );

  useEffect(() => {
    if (!selectedUserId) return;
    const stillExists = users.some((user) => user._id === selectedUserId);
    if (!stillExists) {
      setSelectedUserId('');
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUserId) {
      setTrainings([]);
      setSelectedTrainingId('');
      return;
    }

    let cancelled = false;

    const fetchTrainings = async () => {
      try {
        const response = await trainingAPI.getAll({
          userId: selectedUserId,
          status: 'succeeded',
          limit: 0,
        });
        if (cancelled) return;
        if (response?.success === false) {
          throw new Error(response?.message || 'Failed to load trainings');
        }
        const items = Array.isArray(response?.data)
          ? response.data.filter((training) => training.status === 'succeeded')
          : [];
        setTrainings(items);
        if (
          items.length &&
          !items.some((training) => training._id === selectedTrainingId)
        ) {
          setSelectedTrainingId(items[0]._id);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(`Failed to load trainings: ${error.message}`);
        }
      }
    };

    fetchTrainings();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, selectedTrainingId]);

  useEffect(() => {
    if (!selectedBookId) {
      disconnectJobStream();
      setSelectedBook(null);
      setPages([]);
      setStoryTitle('');
      setStorybookJobs([]);
      handledJobCompletionsRef.current = new Set();
      return;
    }

    fetchBookDetails(selectedBookId);
    fetchStorybookJobs(selectedBookId);
    connectJobStream(selectedBookId);

    return () => {
      disconnectJobStream();
    };
  }, [
    selectedBookId,
    fetchBookDetails,
    fetchStorybookJobs,
    connectJobStream,
    disconnectJobStream,
  ]);

  useEffect(() => {
    if (!activeAsset) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeAsset]);

  useEffect(() => {
    setActiveAsset(null);
    setActiveAssetPages([]);
    setActivePageIndex(0);
    setRegeneratingOrder(null);
  }, [selectedBookId]);

  useEffect(() => {
    if (!activeAsset || !selectedBook?.pdfAssets?.length) return;
    const updatedAsset =
      selectedBook.pdfAssets.find(
        (asset) =>
          (activeAsset._id && asset._id === activeAsset._id) ||
          asset.key === activeAsset.key
      ) || null;
    if (!updatedAsset) return;

    const updatedTimestamp = updatedAsset.updatedAt
      ? new Date(updatedAsset.updatedAt).toISOString()
      : updatedAsset.createdAt
      ? new Date(updatedAsset.createdAt).toISOString()
      : null;
    const currentTimestamp = activeAsset.updatedAt
      ? new Date(activeAsset.updatedAt).toISOString()
      : activeAsset.createdAt
      ? new Date(activeAsset.createdAt).toISOString()
      : null;

    if (updatedTimestamp && currentTimestamp && updatedTimestamp === currentTimestamp) {
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(updatedAsset));
    setActiveAsset(snapshot);
    if (Array.isArray(snapshot.pages) && snapshot.pages.length) {
      setActiveAssetPages(snapshot.pages);
    }
  }, [activeAsset, selectedBook?.pdfAssets]);

  const standardAssets = useMemo(() => {
    if (!Array.isArray(selectedBook?.pdfAssets)) return [];
    return selectedBook.pdfAssets
      .filter((asset) => resolveAssetVariant(asset) === 'standard')
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [selectedBook?.pdfAssets]);

  const splitAssets = useMemo(() => {
    if (!Array.isArray(selectedBook?.pdfAssets)) return [];
    return selectedBook.pdfAssets
      .filter((asset) => resolveAssetVariant(asset) === 'split')
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.confirmedAt || a.updatedAt || a.createdAt || 0);
        const bDate = new Date(b.confirmedAt || b.updatedAt || b.createdAt || 0);
        return bDate - aDate;
      });
  }, [selectedBook?.pdfAssets]);

  const splitLookup = useMemo(() => {
    const map = new Map();
    splitAssets.forEach((asset) => {
      const derivedId = asset?.derivedFromAssetId ? normaliseIdentifier(asset.derivedFromAssetId) : null;
      const derivedKey = asset?.derivedFromAssetKey || null;
      if (derivedId) {
        map.set(derivedId, asset);
      }
      if (derivedKey) {
        map.set(derivedKey, asset);
      }
    });
    return map;
  }, [splitAssets]);

  const totalPages = useMemo(() => pages.length, [pages.length]);
  const totalStorybooks = useMemo(() => standardAssets.length, [standardAssets.length]);
  const totalConfirmedStorybooks = useMemo(
    () => splitAssets.length,
    [splitAssets.length]
  );
  const activeJob = useMemo(
    () =>
      storybookJobs.find((job) =>
        ['queued', 'generating', 'assembling'].includes(job.status)
      ) || null,
    [storybookJobs]
  );

  // Memoize page index setter to prevent re-renders
  const handlePageIndexChange = useCallback((newIndex) => {
    setActivePageIndex(newIndex);
  }, []);

  const updatePage = (index, patch) => {
    setPages((prev) =>
      prev.map((page, pageIndex) => {
        if (pageIndex !== index) return page;

        if (patch.characterFile && page.characterPreview) {
          URL.revokeObjectURL(page.characterPreview);
        }

        return {
          ...page,
          ...patch,
        };
      })
    );
  };

  const handleCharacterFileChange = (index, event) => {
    const file = event.target.files?.[0];
    if (!file) {
      updatePage(index, {
        characterFile: null,
        characterPreview: '',
      });
      return;
    }

    updatePage(index, {
      characterFile: file,
      characterPreview: URL.createObjectURL(file),
      characterUrl: '',
      useCharacter: true,
    });
  };

  const handleCharacterUrlChange = (index, value) => {
    updatePage(index, {
      characterUrl: value,
      characterFile: null,
      characterPreview: '',
      useCharacter: Boolean((value || '').trim().length),
    });
  };

  const clearCharacterSelection = (index) => {
    const current = pages[index];
    if (current?.characterPreview) {
      URL.revokeObjectURL(current.characterPreview);
    }
    updatePage(index, {
      characterFile: null,
      characterPreview: '',
      characterUrl: selectedBook?.pages?.[index]?.characterImage?.url || '',
      useCharacter: Boolean(selectedBook?.pages?.[index]?.characterImage?.url),
    });
  };

  const handleStartAutomation = async () => {
    if (!selectedBookId) {
      toast.error('Select a book before starting automation');
      return;
    }
    if (!selectedUserId) {
      toast.error('Select a reader before starting automation');
      return;
    }
    if (!selectedTrainingId) {
      toast.error('Select a training model for automation');
      return;
    }

    try {
      setIsAutoGenerating(true);
      const response = await bookAPI.startAutoStorybook(selectedBookId, {
        trainingId: selectedTrainingId,
        userId: selectedUserId,
        readerId: selectedReader?._id || selectedUserId,
        readerName: selectedReader?.name || '',
        title: storyTitle || `${selectedBook?.name || 'Storybook'}`,
      });
      if (response?.success === false) {
        throw new Error(response?.message || 'Failed to start automation');
      }
      const jobPayload = response?.data;
      if (jobPayload?._id) {
        setStorybookJobs((previous) => upsertJobList(previous, jobPayload));
      }
      toast.success(response?.message || 'Automated storybook generation started');
    } catch (error) {
      toast.error(`Failed to start automation: ${error.message}`);
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedBookId) {
      toast.error('Select a book before generating a storybook');
      return;
    }

    if (!pages.length) {
      toast.error('Add at least one page to generate');
      return;
    }

    const hasNamePlaceholder = pages.some((page) => {
      if (containsNamePlaceholder(page.text)) return true;
      if (!selectedBook) return false;
      const sourcePage =
        selectedBook.pages?.find((bookPage) => {
          if (page.id && bookPage._id) {
            return bookPage._id === page.id;
          }
          return bookPage.order === page.order;
        }) || null;
      return containsNamePlaceholder(sourcePage?.text);
    });

    if (hasNamePlaceholder && !selectedReader?.name) {
      toast.error('Select a reader to replace {name} placeholders before generating.');
      return;
    }

    try {
      setIsGenerating(true);
      const formData = new FormData();
      if (storyTitle) {
        formData.append('title', storyTitle);
      }
      if (selectedReader?._id) {
        formData.append('readerId', selectedReader._id);
      }
      if (selectedReader?.name) {
        formData.append('readerName', selectedReader.name);
      }

      const pagesPayload = pages.map((page) => ({
        bookPageId: page.id,
        order: page.order,
        text: page.text,
        useCharacter: page.useCharacter,
        characterPosition: page.characterPosition,
        hasCharacterUpload: Boolean(page.characterFile),
        characterUrl: page.useCharacter && !page.characterFile ? page.characterUrl : undefined,
        hebrewQuote: page.quote || '',
      }));

      formData.append('pages', JSON.stringify(pagesPayload));

      pages.forEach((page) => {
        if (page.useCharacter && page.characterFile) {
          formData.append('characterImages', page.characterFile);
        }
      });

      const response = await bookAPI.generateStorybook(selectedBookId, formData);
      if (response?.success === false || !response?.data) {
        throw new Error(response?.message || 'Storybook generation failed');
      }
      toast.success(response?.message || 'Storybook generated!');

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const newAsset = {
          ...response.data,
          variant: resolveAssetVariant(response.data),
          derivedFromAssetId: response.data?.derivedFromAssetId || null,
          derivedFromAssetKey: response.data?.derivedFromAssetKey || null,
          confirmedAt: response.data?.confirmedAt || null,
          metadata: response.data?.metadata || null,
          pages: normaliseAssetPages(response.data?.pages),
        };
        const updatedAssets = [...(prev.pdfAssets || []), newAsset];
        return { ...prev, pdfAssets: updatedAssets };
      });
    } catch (error) {
      toast.error(`Failed to generate storybook: ${error.message}`);
  } finally {
    setIsGenerating(false);
  }
};

  const handleOpenAssetViewer = async (asset) => {
    if (!asset) return;
    const assetSnapshot = JSON.parse(JSON.stringify(asset));
    assetSnapshot.variant = resolveAssetVariant(assetSnapshot);
    const orderedPages = normaliseAssetPages(assetSnapshot.pages);

    setActiveAsset(assetSnapshot);
    setActiveAssetPages(orderedPages);
    setActivePageIndex(0);

    if (!selectedBookId) return;

    const assetIdentifier = assetSnapshot._id || assetSnapshot.key;
    if (!assetIdentifier) return;

    try {
      const response = await bookAPI.getStorybookAssetPages(selectedBookId, assetIdentifier);
      if (response?.success === false) {
        throw new Error(response?.message || 'Failed to load storybook pages');
      }
      const remotePages = normaliseAssetPages(response?.data?.pages || []);
      if (remotePages.length) {
        setActiveAssetPages(remotePages);
        setActivePageIndex((prev) =>
          prev >= remotePages.length ? remotePages.length - 1 : prev
        );
        setActiveAsset((prev) => (prev ? { ...prev, pages: remotePages } : prev));
        setSelectedBook((prev) => {
          if (!prev) return prev;
          const nextAssets = Array.isArray(prev.pdfAssets)
            ? prev.pdfAssets.map((existing) => {
                const matches =
                  (assetSnapshot._id && existing._id === assetSnapshot._id) ||
                  existing.key === assetSnapshot.key;
                if (!matches) return existing;
                return {
                  ...existing,
                  pages: remotePages,
                  updatedAt: new Date().toISOString(),
                };
              })
            : prev.pdfAssets;
          return {
            ...prev,
            pdfAssets: nextAssets,
          };
        });
      }
    } catch (error) {
      console.warn('Failed to fetch storybook pages', error);
    }
  };

  const handleConfirmStorybook = async (asset) => {
    if (!asset || !selectedBookId) return;
    const assetIdentifier = resolveAssetId(asset);
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for confirmation');
      return;
    }

    setConfirmingAssetId(assetIdentifier);
    try {
      const response = await bookAPI.confirmStorybookPdf(selectedBookId, assetIdentifier);
      if (response?.success === false) {
        throw new Error(response?.message || 'Failed to confirm storybook');
      }
      const payload = response?.data || {};
      const meta = response?.meta || {};
      const sourceAssetId = meta?.sourceAssetId ? normaliseIdentifier(meta.sourceAssetId) : assetIdentifier;
      const enrichedAsset = {
        ...payload,
        variant: 'split',
        derivedFromAssetId: payload?.derivedFromAssetId || null,
        derivedFromAssetKey: payload?.derivedFromAssetKey || null,
        confirmedAt: payload?.confirmedAt || null,
        metadata: payload?.metadata || null,
        pages: normaliseAssetPages(payload.pages),
      };
      const newDerivedId = enrichedAsset.derivedFromAssetId
        ? normaliseIdentifier(enrichedAsset.derivedFromAssetId)
        : null;
      const newDerivedKey = enrichedAsset.derivedFromAssetKey || null;

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const existingAssets = Array.isArray(prev.pdfAssets) ? [...prev.pdfAssets] : [];
        const filtered = existingAssets.filter((existing) => {
          if (resolveAssetVariant(existing) !== 'split') return true;
          if (newDerivedId && existing.derivedFromAssetId) {
            return normaliseIdentifier(existing.derivedFromAssetId) !== newDerivedId;
          }
          if (newDerivedKey && existing.derivedFromAssetKey) {
            return existing.derivedFromAssetKey !== newDerivedKey;
          }
          if (sourceAssetId && existing.derivedFromAssetId) {
            return normaliseIdentifier(existing.derivedFromAssetId) !== sourceAssetId;
          }
          return true;
        });
        filtered.push(enrichedAsset);
        return {
          ...prev,
          pdfAssets: filtered,
        };
      });

      setActiveAsset((prev) => {
        if (!prev) return prev;
        const prevId = resolveAssetId(prev);
        const newId = resolveAssetId(enrichedAsset);
        if (prevId && newId && prevId === newId) {
          return enrichedAsset;
        }
        return prev;
      });

      toast.success(response?.message || 'Split PDF generated successfully');
    } catch (error) {
      toast.error(`Failed to confirm storybook: ${error.message}`);
    } finally {
      setConfirmingAssetId('');
    }
  };

  const handleCloseAssetViewer = () => {
    setActiveAsset(null);
    setActiveAssetPages([]);
    setActivePageIndex(0);
    setRegeneratingOrder(null);
    setIsRegeneratingPdf(false);
    setApplyingCandidateKey('');
    if (Array.isArray(preloadRefs.current)) {
      preloadRefs.current.forEach((image) => {
        if (typeof Image !== 'undefined' && image && image instanceof Image) {
          image.src = '';
        }
      });
    }
    preloadRefs.current = [];
  };

  // Simplified preloading - only preload adjacent pages for better performance
  useEffect(() => {
    if (!activeAsset || !activeAssetPages.length || typeof window === 'undefined') {
      return;
    }

    const assetIdentifier = activeAsset._id || activeAsset.key || 'asset';
    const images = [];

    // Only preload current page and adjacent pages (prev and next)
    const pagesToPreload = [
      activePageIndex - 1,
      activePageIndex,
      activePageIndex + 1,
    ].filter((idx) => idx >= 0 && idx < activeAssetPages.length);

    pagesToPreload.forEach((index) => {
      const page = activeAssetPages[index];
      if (!page) return;

      const pageLabel = page.order || index + 1;
      const cacheToken = page.updatedAt || activeAsset.updatedAt || `${assetIdentifier}-${pageLabel}`;

      const backgroundUrl = resolveAssetUrl(page.background);
      const characterUrl = resolveAssetUrl(page.character);

      if (backgroundUrl) {
        const img = new Image();
        img.src = withCacheBust(backgroundUrl, `${cacheToken}-preload-bg`);
        images.push(img);
      }

      if (characterUrl) {
        const img = new Image();
        img.src = withCacheBust(characterUrl, `${cacheToken}-preload-char`);
        images.push(img);
      }
    });

    return () => {
      images.forEach((img) => {
        img.src = '';
      });
    };
  }, [activeAsset, activeAssetPages, activePageIndex]);

  const handleRegeneratePage = async (order) => {
    if (!activeAsset || !selectedBookId || order === undefined || order === null) return;
    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for regeneration');
      return;
    }
    if (!activeAsset.trainingId) {
      toast.error('This storybook is missing training metadata. Regeneration is unavailable.');
      return;
    }

    setRegeneratingOrder(order);
    try {
      const response = await bookAPI.regenerateStorybookPage(
        selectedBookId,
        assetIdentifier,
        order
      );
      if (response?.success === false) {
        throw new Error(response?.message || 'Regeneration failed');
      }
      const payload = response?.data || {};
      const { page: updatedBookPage, pdfAssetPage } = payload;

      if (pdfAssetPage) {
        setActiveAssetPages((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = next.findIndex((entry) => entry.order === pdfAssetPage.order);
          if (existingIndex === -1) {
            next.push(pdfAssetPage);
          } else {
            next[existingIndex] = { ...next[existingIndex], ...pdfAssetPage };
          }
          return normaliseAssetPages(next);
        });

        setActiveAsset((prev) => {
          if (!prev) return prev;
          const nextPages = normaliseAssetPages(
            Array.isArray(prev.pages)
              ? prev.pages.map((entry) =>
                  entry.order === pdfAssetPage.order ? { ...entry, ...pdfAssetPage } : entry
                )
              : [pdfAssetPage]
          );
          return {
            ...prev,
            pages: nextPages,
            updatedAt: new Date().toISOString(),
            variant: prev.variant || resolveAssetVariant(prev),
          };
        });
      }

      if (updatedBookPage?.characterImage) {
        setPages((prev) =>
          prev.map((page) =>
            page.order === updatedBookPage.order
              ? {
                  ...page,
                  characterUrl: updatedBookPage.characterImage?.url || '',
                  characterPreview: '',
                  characterFile: null,
                  useCharacter: true,
                }
              : page
          )
        );
      }

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const nextPages = Array.isArray(prev.pages)
          ? prev.pages.map((page) =>
              updatedBookPage && page.order === updatedBookPage.order
                ? { ...page, characterImage: updatedBookPage.characterImage }
                : page
            )
          : prev.pages;

        const nextAssets = Array.isArray(prev.pdfAssets)
          ? prev.pdfAssets.map((asset) => {
              const matches =
                (activeAsset?._id && asset._id === activeAsset._id) ||
                asset.key === activeAsset?.key;
              if (!matches) return asset;

              const updatedAsset = {
                ...asset,
                updatedAt: new Date().toISOString(),
              };
              if (pdfAssetPage) {
                const assetPages = Array.isArray(asset.pages) ? [...asset.pages] : [];
                const pageIndex = assetPages.findIndex(
                  (entry) => entry.order === pdfAssetPage.order
                );
                if (pageIndex === -1) {
                  assetPages.push(pdfAssetPage);
                } else {
                  assetPages[pageIndex] = { ...assetPages[pageIndex], ...pdfAssetPage };
                }
                updatedAsset.pages = normaliseAssetPages(assetPages);
              }
              updatedAsset.variant = resolveAssetVariant(updatedAsset);
              if (!updatedAsset.derivedFromAssetId && asset.derivedFromAssetId) {
                updatedAsset.derivedFromAssetId = asset.derivedFromAssetId;
              }
              if (!updatedAsset.derivedFromAssetKey && asset.derivedFromAssetKey) {
                updatedAsset.derivedFromAssetKey = asset.derivedFromAssetKey;
              }
              if (!updatedAsset.confirmedAt && asset.confirmedAt) {
                updatedAsset.confirmedAt = asset.confirmedAt;
              }
              if (!updatedAsset.metadata && asset.metadata) {
                updatedAsset.metadata = asset.metadata;
              }
              return updatedAsset;
            })
          : prev.pdfAssets;

        const nextCoverPage = payload.coverPage
          ? { ...(prev.coverPage || {}), ...payload.coverPage }
          : prev.coverPage;
        const nextDedicationPage = payload.dedicationPage
          ? { ...(prev.dedicationPage || {}), ...payload.dedicationPage }
          : prev.dedicationPage;

        return {
          ...prev,
          pages: nextPages,
          pdfAssets: nextAssets,
          coverPage: nextCoverPage,
          dedicationPage: nextDedicationPage,
        };
      });

      await fetchBookDetails(selectedBookId, { preserveTitle: true });
      try {
        const refreshedPagesResponse = await bookAPI.getStorybookAssetPages(
          selectedBookId,
          assetIdentifier
        );
        const refreshedPages = normaliseAssetPages(
          refreshedPagesResponse?.data?.pages || []
        );
        if (refreshedPages.length) {
          setActiveAssetPages(refreshedPages);
          setActivePageIndex((prev) =>
            prev >= refreshedPages.length ? refreshedPages.length - 1 : prev
          );
          setActiveAsset((prev) =>
            prev
              ? {
                  ...prev,
                  pages: refreshedPages,
                  variant: prev.variant || resolveAssetVariant(prev),
                }
              : prev
          );
        }
      } catch (fetchError) {
        console.warn('Failed to refresh storybook pages after regeneration', fetchError);
      }
      toast.success('Page regenerated. Regenerate the PDF to export the latest changes.');
    } catch (error) {
      toast.error(`Failed to regenerate page: ${error.message}`);
    } finally {
      setRegeneratingOrder(null);
    }
  };

  const handleRegeneratePdf = async () => {
    if (!activeAsset || !selectedBookId) {
      toast.error('Open a storybook to regenerate the PDF');
      return;
    }

    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for PDF regeneration');
      return;
    }

    setIsRegeneratingPdf(true);
    try {
      const response = await bookAPI.regenerateStorybookPdf(selectedBookId, assetIdentifier, {
        title: activeAsset.title,
      });
      if (response?.success === false) {
        throw new Error(response?.message || 'Failed to regenerate PDF');
      }
      const payload = response?.data || {};
      const normalisedPages = normaliseAssetPages(payload.pages || []);

      setActiveAsset((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...payload,
          variant: prev.variant || resolveAssetVariant(prev),
          derivedFromAssetId:
            payload?.derivedFromAssetId ?? prev.derivedFromAssetId ?? null,
          derivedFromAssetKey:
            payload?.derivedFromAssetKey ?? prev.derivedFromAssetKey ?? null,
          confirmedAt: payload?.confirmedAt ?? prev.confirmedAt ?? null,
          metadata: payload?.metadata ?? prev.metadata ?? null,
          pages: normalisedPages,
          updatedAt: payload.updatedAt || new Date().toISOString(),
        };
      });
      setActiveAssetPages(normalisedPages);

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const updatedAssets = Array.isArray(prev.pdfAssets)
          ? prev.pdfAssets.map((asset) => {
              const matches =
                (activeAsset?._id && asset._id === activeAsset._id) ||
                asset.key === activeAsset?.key;
              if (!matches) return asset;
              const variant = resolveAssetVariant({ ...asset, ...payload });
              return {
                ...asset,
                ...payload,
                 variant,
                 derivedFromAssetId:
                   payload?.derivedFromAssetId ?? asset.derivedFromAssetId ?? null,
                 derivedFromAssetKey:
                   payload?.derivedFromAssetKey ?? asset.derivedFromAssetKey ?? null,
                 confirmedAt: payload?.confirmedAt ?? asset.confirmedAt ?? null,
                 metadata: payload?.metadata ?? asset.metadata ?? null,
                pages: normalisedPages,
              };
            })
          : prev.pdfAssets;
        return {
          ...prev,
          pdfAssets: updatedAssets,
        };
      });

      toast.success('Regenerated PDF with the latest imagery');
    } catch (error) {
      toast.error(`Failed to regenerate PDF: ${error.message}`);
    } finally {
      setIsRegeneratingPdf(false);
    }
  };

  const handleDownloadPreviewAsPdf = async () => {
    if (!activeAssetPages.length) {
      toast.error('No pages to download');
      return;
    }

    setIsDownloadingPdf(true);
    const toastId = toast.loading('Generating PDF from preview...');

    try {
      // Create PDF document
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT],
      });

      const originalIndex = activePageIndex;

      // Process each page by navigating and capturing
      for (let i = 0; i < activeAssetPages.length; i++) {
        toast.loading(`Processing page ${i + 1} of ${activeAssetPages.length}...`, { id: toastId });

        // Navigate to the page
        setActivePageIndex(i);

        // Wait for React to render the page
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
          // Find the SVG element in the preview
          const previewContainer = document.querySelector('.preview-container');
          const svgElement = previewContainer?.querySelector('svg');

          if (!svgElement) {
            console.warn(`No SVG found for page ${i + 1}`);
            continue;
          }

          // Get the SVG data
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const svgUrl = URL.createObjectURL(svgBlob);

          // Load SVG as image
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = svgUrl;
          });

          // Create canvas and draw the image
          const canvas = document.createElement('canvas');
          canvas.width = PDF_PAGE_WIDTH;
          canvas.height = PDF_PAGE_HEIGHT;
          const ctx = canvas.getContext('2d');

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);
          ctx.drawImage(img, 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

          // Clean up
          URL.revokeObjectURL(svgUrl);

          // Add page to PDF
          if (i > 0) {
            pdf.addPage();
          }

          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          pdf.addImage(imgData, 'JPEG', 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

          console.log(`✓ Added page ${i + 1} to PDF`);

        } catch (pageError) {
          console.error(`Error processing page ${i + 1}:`, pageError);
          toast.error(`Failed to process page ${i + 1}, skipping...`, { id: toastId });
        }
      }

      // Restore original page
      setActivePageIndex(originalIndex);

      // Download the PDF
      const filename = `${activeAsset?.title || 'storybook'}-preview.pdf`;
      pdf.save(filename);

      toast.success('PDF downloaded successfully!', { id: toastId });
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error(`Failed to generate PDF: ${error.message}`, { id: toastId });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleApplyCandidate = async (order, candidateIndex) => {
    if (!activeAsset || !selectedBookId || order === undefined || order === null) return;
    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for candidate selection');
      return;
    }

    const selectionKey = `${order}-${candidateIndex}`;
    setApplyingCandidateKey(selectionKey);

    try {
      const response = await bookAPI.selectStorybookPageCandidate(
        selectedBookId,
        assetIdentifier,
        order,
        { candidateIndex }
      );
      if (response?.success === false) {
        throw new Error(response?.message || 'Candidate selection failed');
      }
      const payload = response?.data || {};
      if (payload.pdfAssetPage) {
        const [normalisedPage] = normaliseAssetPages([payload.pdfAssetPage]);

        setActiveAssetPages((prev) => {
          const next = Array.isArray(prev)
            ? prev.map((page) =>
                page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
              )
            : [normalisedPage];
          return normaliseAssetPages(next);
        });

        setActiveAsset((prev) => {
          if (!prev) return prev;
          const nextPages = normaliseAssetPages(
            Array.isArray(prev.pages)
              ? prev.pages.map((page) =>
                  page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
                )
              : [normalisedPage]
          );
          return {
            ...prev,
            pages: nextPages,
            updatedAt: payload.pdfAssetPage.updatedAt || new Date().toISOString(),
          };
        });

        setSelectedBook((prev) => {
          if (!prev) return prev;
          const updatedBookPages = Array.isArray(prev.pages)
            ? prev.pages.map((page) =>
                page.order === (payload.page?.order || order)
                  ? {
                      ...page,
                      characterImage: payload.page?.characterImage || page.characterImage,
                      characterImageOriginal:
                        payload.page?.characterImageOriginal || page.characterImageOriginal,
                    }
                  : page
              )
            : prev.pages;
          const updatedAssets = Array.isArray(prev.pdfAssets)
            ? prev.pdfAssets.map((asset) => {
                const matches =
                  (activeAsset?._id && asset._id === activeAsset._id) ||
                  asset.key === activeAsset?.key;
                if (!matches) return asset;
                const nextPages = normaliseAssetPages(
                  Array.isArray(asset.pages)
                    ? asset.pages.map((page) =>
                        page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
                      )
                    : [normalisedPage]
                );
                return {
                  ...asset,
                  pages: nextPages,
                  updatedAt:
                    payload.pdfAssetPage.updatedAt || asset.updatedAt || new Date().toISOString(),
                };
              })
            : prev.pdfAssets;
          const updatedCoverPage = payload.coverPage
            ? { ...(prev.coverPage || {}), ...payload.coverPage }
            : prev.coverPage;
          const updatedDedicationPage = payload.dedicationPage
            ? { ...(prev.dedicationPage || {}), ...payload.dedicationPage }
            : prev.dedicationPage;
          return {
            ...prev,
            pdfAssets: updatedAssets,
            pages: updatedBookPages,
            coverPage: updatedCoverPage,
            dedicationPage: updatedDedicationPage,
          };
        });

        if (payload.page?.characterImage) {
          setPages((prev) =>
            prev.map((page) =>
              page.order === (payload.page.order || order)
                ? {
                    ...page,
                    characterUrl: payload.page.characterImage?.url || page.characterUrl,
                    characterPreview: '',
                    characterFile: null,
                    useCharacter: true,
                  }
                : page
            )
          );
        }

        if ((payload.coverPage || payload.dedicationPage) && selectedBookId) {
          await fetchBookDetails(selectedBookId, { preserveTitle: true });
        }

        toast.success('Applied the selected candidate image');
      }
    } catch (error) {
      toast.error(`Failed to apply candidate: ${error.message}`);
    } finally {
      setApplyingCandidateKey('');
    }
  };

  const renderAssetViewer = useCallback(() => {
    if (!activeAsset) return null;

    const hasPages = Array.isArray(activeAssetPages) && activeAssetPages.length > 0;
    const safeIndex = hasPages
      ? activePageIndex >= activeAssetPages.length
        ? activeAssetPages.length - 1
        : Math.max(0, activePageIndex)
      : 0;
    const currentPage = hasPages ? activeAssetPages[safeIndex] || null : null;
    const assetIdentifier = activeAsset?._id || activeAsset?.key || 'storybook';
    const previewModel = currentPage
      ? buildPagePreviewModel({
          page: currentPage,
          index: safeIndex,
          assetIdentifier,
          assetUpdatedAt: activeAsset?.updatedAt,
          readerName: selectedReader?.name || '',
          readerGender: selectedReader?.gender || '',
        })
      : null;
    const canNavigatePrev = hasPages && safeIndex > 0;
    const canNavigateNext = hasPages && safeIndex < activeAssetPages.length - 1;
    const isCurrentPageRegenerating =
      currentPage?.order !== undefined && regeneratingOrder === currentPage.order;
    const pageLabel =
      previewModel?.pageLabel ??
      getDisplayPageNumber(currentPage?.pageType, currentPage?.order, safeIndex);
    const cacheToken = previewModel?.cacheToken || assetIdentifier;
    const pageRole = currentPage?.pageType || 'story';
    const isRegenerablePage = ['story', 'cover', 'dedication'].includes(pageRole);
    const readablePageRole =
      pageRole === 'cover' ? 'Cover' : pageRole === 'dedication' ? 'Dedication' : null;
    const isStoryPage = pageRole === 'story';
    const hasCandidateAssets =
      Array.isArray(currentPage?.candidateAssets) && currentPage.candidateAssets.length > 0;
    const hasRankingNotes = Array.isArray(currentPage?.rankingNotes) && currentPage.rankingNotes.length > 0;
    const shouldShowCandidateSection =
      isRegenerablePage &&
      (hasCandidateAssets || hasRankingNotes || Boolean(activeAsset?.trainingId));
    const rankingSummary = (currentPage?.rankingSummary || '').trim();

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative flex h-full w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-6 py-4 bg-background/95 backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-foreground/45">Storybook preview</p>
              <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
                {activeAsset.title || selectedBook?.name || 'Storybook'}
                {hasPages
                  ? ` · Page ${pageLabel}${
                      readablePageRole ? ` (${readablePageRole})` : ''
                    }`
                  : ' · No page snapshots yet'}
              </h3>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 px-2 sm:px-3"
                onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                disabled={!canNavigatePrev}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
              <span className="text-xs sm:text-sm font-medium text-foreground/60 px-1">
                {hasPages ? `${safeIndex + 1} / ${activeAssetPages.length}` : '0 / 0'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 px-2 sm:px-3"
                onClick={() =>
                  setActivePageIndex((prev) =>
                    prev + 1 >= activeAssetPages.length ? prev : prev + 1
                  )
                }
                disabled={!canNavigateNext}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {hasPages && isRegenerablePage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 hidden md:flex"
                  onClick={() => currentPage && handleRegeneratePage(currentPage.order)}
                  disabled={isCurrentPageRegenerating}
                >
                  {isCurrentPageRegenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden lg:inline">Regenerating…</span>
                    </>
                  ) : (
                    <span className="hidden lg:inline">Regenerate page</span>
                  )}
                </Button>
              ) : null}
              {hasPages ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1 hidden md:flex"
                  onClick={handleRegeneratePdf}
                  disabled={isRegeneratingPdf}
                >
                  {isRegeneratingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden lg:inline">Rebuilding…</span>
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      <span className="hidden lg:inline">Regenerate PDF</span>
                    </>
                  )}
                </Button>
              ) : null}
              {hasPages ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 hidden md:flex"
                  onClick={handleDownloadPreviewAsPdf}
                  disabled={isDownloadingPdf}
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden lg:inline">Downloading…</span>
                    </>
                  ) : (
                    <>
                      <FileImage className="h-4 w-4" />
                      <span className="hidden lg:inline">Download as PDF</span>
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseAssetViewer}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {hasPages ? (
              <div className="flex w-full h-full">
                {/* Left Sidebar - Page Thumbnails */}
                <div className="hidden md:flex w-44 lg:w-52 flex-col border-r border-border/50 bg-background/50 overflow-y-auto scroll-container">
                  <div className="p-2 border-b border-border/50 bg-background/95 sticky top-0 z-10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/60">Pages</p>
                  </div>
                  <div className="p-2 space-y-2" style={{ contain: 'layout style' }}>
                    {activeAssetPages.map((page, idx) => (
                      <PageThumbnail
                        key={`thumb-${page.order || idx}`}
                        page={page}
                        index={idx}
                        isActive={idx === safeIndex}
                        onClick={() => handlePageIndexChange(idx)}
                        assetUpdatedAt={activeAsset.updatedAt}
                        assetIdentifier={assetIdentifier}
                        readerName={selectedReader?.name || ''}
                        readerGender={selectedReader?.gender || ''}
                      />
                    ))}
                  </div>
                </div>

                {/* Center - Main Preview */}
                <div className="flex-1 flex flex-col overflow-y-auto scroll-container bg-muted/10">
                  <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
                    {/* Main Preview Image */}
                    <div
                      className="relative w-full bg-transparent shadow-xl preview-container border border-border/50"
                      style={{
                        aspectRatio: `${PDF_PAGE_WIDTH}/${PDF_PAGE_HEIGHT}`,
                      }}
                    >
                      {previewModel ? (
                        <StorybookPageSvg
                          key={`${previewModel.cacheToken}-preview`}
                          model={previewModel}
                          className="absolute inset-0"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-muted/10" />
                      )}
                    </div>

                    {/* Mobile Page Info */}
                    <div className="md:hidden px-4 py-3 border border-border/50 bg-background/80 rounded-lg">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/60">
                          Page {safeIndex + 1} of {activeAssetPages.length}
                        </span>
                        <span className="text-foreground/50">
                          {currentPage?.character?.backgroundRemoved
                            ? 'Background removed'
                            : currentPage?.character
                            ? 'Original background'
                            : 'No character'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex md:hidden gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => currentPage && handleRegeneratePage(currentPage.order)}
                        disabled={isCurrentPageRegenerating}
                      >
                        {isCurrentPageRegenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Regenerating…
                          </>
                        ) : (
                          'Regenerate page'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={handleRegeneratePdf}
                        disabled={isRegeneratingPdf}
                      >
                        {isRegeneratingPdf ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Rebuilding…
                          </>
                        ) : (
                          <>
                            <BookOpen className="h-4 w-4" />
                            Regenerate PDF
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Art Director Notes */}
                    {isStoryPage && rankingSummary ? (
                      <div className="rounded-lg border border-border/60 bg-background p-4 text-sm text-foreground/80">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55 mb-2">
                          Art Director Notes
                        </p>
                        <p className="leading-relaxed">{rankingSummary}</p>
                      </div>
                    ) : null}
                {shouldShowCandidateSection ? (
                  hasCandidateAssets ? (
                    <div className="space-y-3 border border-border/50 bg-background/50 p-3 sm:p-4">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs uppercase tracking-wide text-foreground/60">
                        <span className="font-semibold">Candidate images</span>
                        <span className="text-foreground/50">
                          {Number.isFinite(currentPage?.selectedCandidateIndex)
                            ? `Selected: ${currentPage.selectedCandidateIndex}`
                            : 'Choose alternate'}
                        </span>
                      </div>
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
                        {currentPage.candidateAssets.map((candidate, candidateIdx) => {
                          const optionNumber = candidateIdx + 1;
                          const candidateUrl = resolveAssetUrl(candidate);
                          const cacheKey = `${cacheToken}-candidate-${optionNumber}`;
                          const orderToken =
                            currentPage?.order ??
                            (currentPage?.pageType === 'cover'
                              ? 'cover'
                              : currentPage?.pageType === 'dedication'
                              ? 'dedication'
                              : pageLabel);
                          const candidateKey = `${orderToken}-${optionNumber}`;
                          const isSelected =
                            currentPage.selectedCandidateIndex === optionNumber;
                          const isApplying = applyingCandidateKey === candidateKey;
                          const rankingEntry = Array.isArray(currentPage?.rankingNotes)
                            ? currentPage.rankingNotes.find(
                                (entry) => entry.imageIndex === optionNumber
                              )
                            : null;
                          const rawScore = rankingEntry?.score;
                          const normalisedScore =
                            rawScore === null || rawScore === undefined
                              ? null
                              : Number(rawScore);
                          const scoreLabel = Number.isFinite(normalisedScore)
                            ? `${Math.round(normalisedScore)}/100`
                            : null;
                          const verdictLabel = rankingEntry?.verdict
                            ? rankingEntry.verdict.replace(/\b\w/g, (char) => char.toUpperCase())
                            : null;
                          const noteText = rankingEntry?.notes?.trim();
                          return (
                            <div
                              key={candidate.key || candidate.url || candidateKey}
                              className={`candidate-card flex flex-col gap-2 border ${
                                isSelected ? 'border-accent bg-accent/10' : 'border-border/40 bg-background'
                              } p-2 transition-colors hover:border-accent/70`}
                            >
                              <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
                                {candidateUrl ? (
                                  <img
                                    src={withCacheBust(candidateUrl, cacheKey)}
                                    alt={`Candidate ${optionNumber} for page ${pageLabel}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-foreground/50">
                                    No preview
                                  </div>
                                )}
                                {isSelected ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-accent/25">
                                    <div className="bg-accent px-2 py-1 text-[10px] font-bold text-accent-foreground">
                                      SELECTED
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-foreground/70">
                                <span className="font-medium">#{optionNumber}</span>
                                {scoreLabel && <span>{scoreLabel}</span>}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'outline' : 'default'}
                                className="gap-1 h-8 text-xs"
                                onClick={() =>
                                  handleApplyCandidate(orderToken, optionNumber)
                                }
                                disabled={isSelected || isApplying}
                              >
                                {isApplying ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Applying…
                                  </>
                                ) : isSelected ? (
                                  'Current'
                                ) : (
                                  'Use this'
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center text-sm text-foreground/60">
                      No alternate candidates stored for this page yet. Regenerate the page to
                      refresh options.
                    </div>
                  )
                ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-background/70 p-8 text-center text-sm text-foreground/60">
                <ImageOff className="h-8 w-8 text-foreground/40" />
                <p>Generate a storybook to preview its pages here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [
    activeAsset,
    activeAssetPages,
    activePageIndex,
    regeneratingOrder,
    isRegeneratingPdf,
    applyingCandidateKey,
    selectedBook?.name,
    handleRegeneratePage,
    handleRegeneratePdf,
    handleApplyCandidate,
  ]);

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Books grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {renderAssetViewer()}
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Storybook Generator
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Compose final PDFs using curated backgrounds, character art, and story text.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-wide text-foreground/60">
            <PlugZap
              className={`h-4 w-4 ${
                isStreamConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <span>
              {selectedBookId
                ? isStreamConnected
                  ? 'Live updates connected'
                  : 'Connecting to live updates…'
                : 'Select a book to start live updates'}
            </span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a book</CardTitle>
            <CardDescription>
              Choose a book to pull in its characters and page content.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="book">Book</Label>
              <SearchableSelect
                value={selectedBookId}
                onValueChange={setSelectedBookId}
                options={books.map((book) => ({
                  value: book._id,
                  label: book.name,
                  searchText: book.name,
                }))}
                placeholder="Select a book"
                searchPlaceholder="Search books..."
                emptyText="No books found."
                disabled={!books.length}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Storybook title</Label>
              <Input
                id="title"
                placeholder="My awesome story"
                value={storyTitle}
                onChange={(event) => setStoryTitle(event.target.value)}
                disabled={!selectedBook}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader">Reader</Label>
              <SearchableSelect
                value={selectedUserId || '__none'}
                onValueChange={(value) => setSelectedUserId(value === '__none' ? '' : value)}
                options={[
                  { value: '__none', label: 'No reader', searchText: 'none' },
                  ...users.map((user) => ({
                    value: user._id,
                    label: user.name,
                    searchText: user.name,
                  }))
                ]}
                placeholder="Select a reader"
                searchPlaceholder="Search users..."
                emptyText="No users found."
                disabled={!users.length}
              />
              <p className="text-xs text-foreground/50">
                Replaces any {'{name}'} placeholders in the story text.
              </p>
            </div>
          </CardContent>
        </Card>
  
        {selectedBook && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Automate character generation</CardTitle>
                <CardDescription>
                  Generate four variations per page, rank them automatically, and update the book
                  with the best characters before building the PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="training">Training model</Label>
                  <SearchableSelect
                    value={selectedTrainingId || '__none'}
                    onValueChange={(value) =>
                      setSelectedTrainingId(value === '__none' ? '' : value)
                    }
                    options={[
                      { value: '__none', label: 'Select training', searchText: 'none' },
                      ...trainings.map((training) => ({
                        value: training._id,
                        label: training.modelName,
                        searchText: training.modelName,
                      }))
                    ]}
                    placeholder="Select a training"
                    searchPlaceholder="Search trainings..."
                    emptyText="No trainings found."
                    disabled={!selectedUserId || !trainings.length}
                  />
                  {!selectedUserId && (
                    <p className="text-xs text-foreground/50">
                      Pick a reader to load their successful trainings.
                    </p>
                  )}
                  {selectedUserId && !trainings.length && (
                    <p className="text-xs text-foreground/50">
                      No successful trainings found for this reader yet.
                    </p>
                  )}
                </div>
              <div className="space-y-2">
                <Label>Active run</Label>
                {activeJob ? (
                  (() => {
                    const statusMeta = getJobStatusMeta(activeJob.status);
                    return (
                      <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {activeJob.title || 'Storybook run'}
                          </span>
                          <span className="text-xs text-foreground/55">
                            Started {formatTimestamp(activeJob.createdAt)}
                          </span>
                        </div>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                    No automation in progress
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Estimated time remaining</Label>
                {activeJob ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-foreground/70">
                    <Clock className="h-4 w-4 text-foreground/40" />
                    <span>
                      {activeJob.estimatedSecondsRemaining
                        ? formatEta(activeJob.estimatedSecondsRemaining)
                        : 'Calculating…'}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                    —
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-foreground/50 sm:max-w-md">
                Automation uses ranked image generation and Replicate webhooks to stream progress for
                each page. You&apos;ll see updates here as soon as images are ready.
              </div>
              <Button
                className="gap-2"
                onClick={handleStartAutomation}
                disabled={
                  !selectedBookId || !selectedUserId || !selectedTrainingId || isAutoGenerating
                }
              >
                {isAutoGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isAutoGenerating ? 'Starting…' : 'Start automated run'}
              </Button>
            </CardFooter>
          </Card>
        </div>
        )}

        {selectedBook && storybookJobs.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Recent automation runs
                </h3>
                <p className="text-sm text-foreground/55">
                  Live updates stream in as Replicate webhooks progress through each page.
                </p>
              </div>
              <p className="text-xs text-foreground/45">
                Showing up to {JOB_HISTORY_LIMIT} runs
              </p>
            </div>
            <div className="grid gap-4">
              {storybookJobs.map((job) => {
                const statusMeta = getJobStatusMeta(job.status);
                const progressValue = Math.max(0, Math.min(100, job.progress || 0));
                const recentEvents = Array.isArray(job.events) ? job.events.slice(-4).reverse() : [];
                return (
                  <Card key={job._id}>
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base text-foreground">
                          {job.title || 'Storybook run'}
                        </CardTitle>
                        <CardDescription>
                          Started {formatTimestamp(job.createdAt)} &middot; {job.pages.length} pages
                        </CardDescription>
                      </div>
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-foreground/55">
                          <span>Progress</span>
                          <span>
                            {Math.round(progressValue)}%
                            {job.estimatedSecondsRemaining
                              ? ` • ETA ${formatEta(job.estimatedSecondsRemaining)}`
                              : ''}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              job.status === 'failed'
                                ? 'bg-red-400'
                                : job.status === 'succeeded'
                                ? 'bg-emerald-400'
                                : 'bg-primary'
                            } transition-all`}
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Pages</h4>
                          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-2">
                            {Array.isArray(job.pages) && job.pages.length ? (
                              job.pages.map((page, pageIndex) => {
                                const meta = getPageStatusMeta(page.status);
                                const displayNumber = getDisplayPageNumber(
                                  page.pageType,
                                  page.order,
                                  pageIndex
                                );
                                const labelSuffix =
                                  page.pageType === 'cover'
                                    ? ' (Cover)'
                                    : page.pageType === 'dedication'
                                    ? ' (Dedication)'
                                    : '';
                                return (
                                  <div
                                    key={`${job._id}-${page.pageId || page.order}`}
                                    className="flex items-center justify-between rounded border border-border/50 bg-card/40 px-3 py-2"
                                  >
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        Page {displayNumber}
                                        {labelSuffix}
                                      </p>
                                      <p className="text-xs text-foreground/55">
                                        {page.prompt?.slice(0, 80) || 'No prompt'}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xs font-semibold ${meta.tone}`}>
                                        {meta.label}
                                      </p>
                                      <p className="text-xs text-foreground/50">
                                        {Math.round(page.progress || 0)}%
                                      </p>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="rounded border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                                No page activity yet
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Recent activity</h4>
                          <div className="mt-2 space-y-2">
                            {recentEvents.length ? (
                              recentEvents.map((event, idx) => (
                                <div
                                  key={`${job._id}-event-${idx}`}
                                  className="rounded border border-border/50 bg-card/40 px-3 py-2 text-sm text-foreground/70"
                                >
                                  <p className="font-medium text-foreground">
                                    {event.message || event.type}
                                  </p>
                                  <p className="text-xs text-foreground/55">
                                    {formatTimestamp(event.timestamp)}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="rounded border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                                Waiting for webhook updates
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {job.status === 'failed' && job.error && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{job.error}</span>
                        </div>
                      )}
                      {job.status === 'succeeded' && job.pdfAsset && (
                        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                          Completed • {job.pdfAsset.pageCount} pages • Added to storybook library
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
  
        {loadingBook && (
          <div className="flex min-h-[30vh] items-center justify-center text-foreground/55">
            Loading book details...
          </div>
        )}
  
        {!loadingBook && selectedBook && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl text-foreground">
                    {selectedBook.name}
                  </CardTitle>
                  <CardDescription>
                    {selectedBook.description || 'No description provided.'}
                  </CardDescription>
                </div>
                <div className="flex gap-2 text-xs text-foreground/55">
                  <span>{totalPages} pages</span>
                  <span>{totalStorybooks} storybooks</span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {selectedBook.coverImage?.url ? (
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                    <img
                      src={selectedBook.coverImage.url}
                      alt="Cover"
                      className="h-56 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-foreground/40">
                    <ImageOff className="h-8 w-8" />
                  </div>
                )}
                <div className="space-y-3 text-sm text-foreground/60">
                  <p>
                    Fine-tune the narration, set background art, and export a polished PDF ready for sharing.
                  </p>
                  <p>
                    Page backgrounds come from the book setup, so you only need to supply the character art for each reader.
                  </p>
                </div>
              </CardContent>
            </Card>
  
            <Card>
              <CardHeader>
                <CardTitle>Configure pages</CardTitle>
                <CardDescription>
                  Update narration and provide character art overlays for each page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {pages.map((page, index) => (
                  <div
                    key={page.id || index}
                    className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-subtle"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground/80">
                          Page {page.order}
                        </p>
                        <p className="text-xs text-foreground/50">
                          Character {page.useCharacter ? 'enabled' : 'disabled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-foreground/60">
                          <input
                            type="checkbox"
                            checked={page.useCharacter}
                            onChange={(event) =>
                              updatePage(index, { useCharacter: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-border bg-background text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                          />
                          Show character art
                        </label>
                        <Select
                          value={page.characterPosition}
                          onValueChange={(value) => updatePage(index, { characterPosition: value })}
                        >
                          <SelectTrigger className="h-9 w-[160px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHARACTER_POSITION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
  
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wide text-foreground/60">
                          Page text
                        </Label>
                        <Textarea
                          value={page.text}
                          onChange={(event) => updatePage(index, { text: event.target.value })}
                          rows={6}
                          className="resize-none"
                        />
                        {selectedReader?.name && (containsNamePlaceholder(page.text) || (page.text && page.text.includes('{gender}'))) ? (
                          <p className="text-xs text-foreground/50">
                            Preview with {selectedReader.name}:{' '}
                            {replacePlaceholders(page.text, selectedReader.name, selectedReader.gender)}
                          </p>
                        ) : null}
                      </div>
  
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-foreground/60">
                          <p className="font-medium uppercase tracking-wide text-foreground/55">
                            Background (from book)
                          </p>
                          {page.backgroundImageUrl ? (
                            <img
                              src={page.backgroundImageUrl}
                              alt={`Background for page ${page.order}`}
                              className="mt-3 h-40 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="mt-3 flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/60 text-foreground/45">
                              <ImageOff className="h-6 w-6" />
                              <span className="text-xs">No background stored for this page.</span>
                            </div>
                          )}
                          <p className="mt-3 text-[11px] text-foreground/50">
                            Backgrounds are fixed per book. Update them in the Books section if needed.
                          </p>
                        </div>
  
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <div className="mb-3 flex items-center justify-between text-xs text-foreground/60">
                            <span className="font-medium uppercase tracking-wide">
                              Character overlay
                            </span>
                            <div className="flex items-center gap-2">
                              {page.characterPreview || page.characterUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-foreground/60"
                                  onClick={() => clearCharacterSelection(index)}
                                >
                                  Clear
                                </Button>
                              ) : null}
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-accent">
                                <Upload className="h-3.5 w-3.5" />
                                Upload
                                <Input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(event) => handleCharacterFileChange(index, event)}
                                />
                              </label>
                            </div>
                          </div>
                          {page.prompt ? (
                            <div className="mb-3 rounded-lg border border-border/50 bg-background/60 p-3 text-left">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                                Saved prompt
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/65">
                                {page.prompt}
                              </p>
                            </div>
                          ) : null}
                          {page.characterPreview || page.characterUrl ? (
                            <img
                              src={page.characterPreview || page.characterUrl}
                              alt={`Character overlay for page ${page.order}`}
                              className="h-32 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/60 text-foreground/45">
                              <ImageIcon className="h-6 w-6" />
                              <span className="text-xs">No character image selected</span>
                            </div>
                          )}
                          <div className="mt-3 space-y-2">
                            <Label className="text-xs uppercase tracking-wide text-foreground/55">
                              Or use image URL
                            </Label>
                            <Input
                              placeholder="https://..."
                              value={page.characterUrl}
                              onChange={(event) => handleCharacterUrlChange(index, event.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="flex items-center justify-end border-t border-border/60 bg-card/60 py-4">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !pages.length}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      Generate storybook
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
  
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Generated storybooks</CardTitle>
                  <CardDescription>
                    Download finished PDFs or confirm them once you are happy with the layout.
                  </CardDescription>
                </div>
                <Badge variant="outline">{totalStorybooks} ready</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {standardAssets.length ? (
                  standardAssets.map((asset) => {
                    const assetIdentifier = resolveAssetId(asset);
                    const matchingSplit =
                      splitLookup.get(assetIdentifier) || (asset.key ? splitLookup.get(asset.key) : null);
                    const isConfirming = confirmingAssetId === assetIdentifier;
                    const confirmedDate = matchingSplit
                      ? new Date(
                          matchingSplit.confirmedAt ||
                            matchingSplit.updatedAt ||
                            matchingSplit.createdAt ||
                            Date.now()
                        )
                      : null;
                    return (
                      <div
                        key={asset._id || asset.key}
                        className="rounded-xl border border-border/70 bg-card/70 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-foreground/85">
                              {asset.title || 'Storybook'}
                            </p>
                            <p className="text-xs text-foreground/50">
                              {asset.pageCount || pages.length} pages ·{' '}
                              {asset.size
                                ? `${(asset.size / 1024 / 1024).toFixed(2)} MB`
                                : 'Size unknown'}
                            </p>
                            <p className="text-xs text-foreground/45">
                              Generated{' '}
                              {asset.createdAt
                                ? new Date(asset.createdAt).toLocaleString()
                                : 'recently'}
                            </p>
                            {matchingSplit ? (
                              <p className="text-xs text-emerald-500">
                                Confirmed{' '}
                                {confirmedDate ? confirmedDate.toLocaleString() : 'recently'}
                              </p>
                            ) : (
                              <p className="text-xs text-foreground/50">
                                Awaiting confirmation
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="gap-1"
                              disabled={isConfirming}
                              onClick={() => handleConfirmStorybook(asset)}
                            >
                              {isConfirming ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  {matchingSplit ? 'Regenerating…' : 'Confirming…'}
                                </>
                              ) : matchingSplit ? (
                                <>
                                  <RefreshCw className="h-4 w-4" />
                                  Regenerate split
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4" />
                                  Confirm
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => handleOpenAssetViewer(asset)}
                            >
                              <Eye className="h-4 w-4" />
                              View pages
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="gap-1"
                              onClick={() => window.open(asset.url, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                              Download PDF
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-foreground/55">
                    No storybooks yet. Configure your pages above and generate a PDF to see it here.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Confirmed storybooks</CardTitle>
                  <CardDescription>
                    Split PDFs are stored and ready whenever you need them.
                  </CardDescription>
                </div>
                <Badge variant="outline">{totalConfirmedStorybooks} confirmed</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {splitAssets.length ? (
                  splitAssets.map((asset) => (
                    <div
                      key={asset._id || asset.key}
                      className="rounded-xl border border-border/70 bg-card/70 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-foreground/85">
                            {asset.title || 'Confirmed storybook'}
                          </p>
                          <p className="text-xs text-foreground/50">
                            {asset.pageCount || pages.length} pages ·{' '}
                            {asset.size
                              ? `${(asset.size / 1024 / 1024).toFixed(2)} MB`
                              : 'Size unknown'}
                          </p>
                          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>
                              Confirmed{' '}
                              {asset.confirmedAt
                                ? new Date(asset.confirmedAt).toLocaleString()
                                : new Date(asset.updatedAt || asset.createdAt || Date.now()).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1"
                          onClick={() => window.open(asset.url, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                          Download PDF
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-foreground/55">
                    Confirm a storybook to generate a split PDF and keep it ready here.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

export default Storybooks;
