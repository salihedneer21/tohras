import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import planeBackground from '@/assets/background.jpg';
import childCharacter from '@/assets/character.png';

const CANVAS_WIDTH = 842;
const CANVAS_HEIGHT = 421;

const DEFAULT_TEXT = `Pack your bags, it's time to go, to Israel, where stories flow. Where prophets walked and kings once prayed, and history's treasures never fade.`;

const DEFAULT_CONFIG = Object.freeze({
  storyText: DEFAULT_TEXT,
  characterSide: 'right',
  characterWidthRatio: 0.4,
  characterHeightRatio: 0.8,
  characterOffsetX: 0,
  characterOffsetY: 0,
  textFontSize: 18,
  textLineHeight: 1.4,
  textColor: '#ffffff',
  textMargin: 40,
  textBlockWidthRatio: 0.35,
  textBlockWidthMin: 300,
  textOffsetX: 0,
  textOffsetY: 0,
  textBaselineRatio: 0.7,
  textBaselineOffset: 18,
  overlayPaddingLeft: 90,
  overlayPaddingRight: 60,
  overlayPaddingVertical: 40,
  overlayBlur: 15,
  overlayMaskWidthFactor: 2.2,
  overlayMaskHeightFactor: 2,
  overlayMaskHardness: 0.82,
  overlayFallbackColor: '#0c204e',
  overlayFallbackOpacity: 0.85,
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hexToRgba = (hex, alpha = 1) => {
  const sanitized = hex.trim().replace(/^#/, '');
  if (![3, 6].includes(sanitized.length)) {
    return `rgba(12, 32, 78, ${alpha})`;
  }

  const expanded =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => char + char)
          .join('')
      : sanitized;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const wrapTextToLines = (text, maxWidth, fontSize) => {
  if (!text) return [];

  const paragraphs = text.split(/\n/);
  const lines = [];
  const avgCharWidth = fontSize * 0.45;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / Math.max(avgCharWidth, 1)));

  paragraphs.forEach((paragraph, index) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      if (index !== paragraphs.length - 1) {
        lines.push('');
      }
      return;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';

    words.forEach((word) => {
      const tentative = currentLine ? `${currentLine} ${word}` : word;
      const estimatedWidth = tentative.length * avgCharWidth;

      if (estimatedWidth <= maxWidth && tentative.length <= maxCharsPerLine) {
        currentLine = tentative;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        if (word.length * avgCharWidth > maxWidth) {
          lines.push(word);
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (index !== paragraphs.length - 1) {
      lines.push('');
    }
  });

  return lines;
};

const buildPreviewData = (config, backgroundSrc, characterSrc) => {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;

  const characterWidth = characterSrc ? width * config.characterWidthRatio : 0;
  const characterHeight = characterSrc ? height * config.characterHeightRatio : 0;
  const characterBaseX = config.characterSide === 'right' ? width - characterWidth : 0;
  const characterX = characterBaseX + config.characterOffsetX;
  const characterY = height - characterHeight + config.characterOffsetY;

  const textBlockWidth = Math.min(
    Math.max(width * config.textBlockWidthRatio, config.textBlockWidthMin),
    width - config.textMargin * 2
  );
  const fontSize = config.textFontSize;
  const lineHeight = fontSize * config.textLineHeight;
  const textLines = wrapTextToLines(config.storyText, textBlockWidth, fontSize);
  const textHeight = textLines.length * lineHeight;
  const textBaseX = config.characterSide === 'right'
    ? config.textMargin
    : width - textBlockWidth - config.textMargin;
  const textX = textBaseX + config.textOffsetX;
  const textBaseline = height * config.textBaselineRatio + config.textOffsetY;

  const rawBgX = textX - config.overlayPaddingLeft;
  const rawBgY = textBaseline - textHeight - config.overlayPaddingVertical;
  const rawBgWidth = textBlockWidth + config.overlayPaddingLeft + config.overlayPaddingRight;
  const rawBgHeight = textHeight + config.overlayPaddingVertical * 2;

  const bgX = clamp(rawBgX, 0, width - 1);
  const bgY = clamp(rawBgY, 0, height - 1);
  const xOffset = bgX - rawBgX;
  const yOffset = bgY - rawBgY;
  const bgWidth = Math.min(Math.max(1, rawBgWidth - xOffset), width - bgX);
  const bgHeight = Math.min(Math.max(1, rawBgHeight - yOffset), height - bgY);
  const bgSvgY = height - (bgY + bgHeight);

  const maskRx = bgWidth / Math.max(config.overlayMaskWidthFactor, 0.1);
  const maskRy = bgHeight / Math.max(config.overlayMaskHeightFactor, 0.1);
  const maskHardness = clamp(config.overlayMaskHardness, 0.01, 0.99);

  return {
    backgroundSrc,
    character: characterSrc
      ? {
          src: characterSrc,
          frame: {
            x: characterX,
            y: characterY,
            width: characterWidth,
            height: characterHeight,
            preserveAspectRatio:
              config.characterSide === 'right' ? 'xMaxYMax meet' : 'xMinYMax meet',
          },
        }
      : null,
    text: textLines.length
      ? {
          lines: textLines,
          x: textX,
          baseline: textBaseline,
          fontSize,
          lineHeight,
          baselineOffset: config.textBaselineOffset,
          color: config.textColor,
          overlay: {
            x: bgX,
            y: bgSvgY,
            width: bgWidth,
            height: bgHeight,
            blur: Math.max(0, config.overlayBlur),
            maskRx,
            maskRy,
            maskHardness,
            fallbackFill: hexToRgba(config.overlayFallbackColor, config.overlayFallbackOpacity),
          },
        }
      : null,
  };
};

const ConfigurableStoryPageSvg = ({ data }) => {
  const filterId = useId();
  const blurId = `${filterId}-blur`;
  const maskId = `${filterId}-mask`;

  if (!data) return null;

  const { backgroundSrc, character, text } = data;
  const hasOverlay = Boolean(text?.overlay);
  const maskHardStop = text ? clamp(text.overlay.maskHardness, 0.01, 0.99) : 0.82;

  const toSvgY = (pdfY) => CANVAS_HEIGHT - pdfY;

  return (
    <svg
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      className="h-full w-full"
      role="img"
      aria-label="Configurable storybook page preview"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {hasOverlay ? (
          <>
            <filter id={blurId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={text.overlay.blur} edgeMode="duplicate" />
            </filter>
            <radialGradient id={`${maskId}-gradient`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop
                offset={`${(maskHardStop * 100).toFixed(2)}%`}
                stopColor="white"
                stopOpacity="1"
              />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id={maskId}>
              <ellipse
                cx={text.overlay.x + text.overlay.width / 2}
                cy={text.overlay.y + text.overlay.height / 2}
                rx={Math.max(1, text.overlay.maskRx)}
                ry={Math.max(1, text.overlay.maskRy)}
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
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          preserveAspectRatio="none"
        />
      ) : (
        <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#10131a" />
      )}

      {character ? (
        <image
          href={character.src}
          x={character.frame.x}
          y={character.frame.y}
          width={character.frame.width}
          height={character.frame.height}
          preserveAspectRatio={character.frame.preserveAspectRatio}
        />
      ) : null}

      {hasOverlay ? (
        <>
          <g mask={`url(#${maskId})`}>
            {backgroundSrc ? (
              <image
                href={backgroundSrc}
                x="0"
                y="0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                preserveAspectRatio="none"
                filter={`url(#${blurId})`}
              />
            ) : (
              <rect
                x={text.overlay.x}
                y={text.overlay.y}
                width={text.overlay.width}
                height={text.overlay.height}
                fill={text.overlay.fallbackFill}
              />
            )}
          </g>
          {text.lines.map((line, index) => {
            const baseline = text.baseline - index * text.lineHeight - text.baselineOffset;
            const svgY = toSvgY(baseline);
            return (
              <text
                key={`line-${index}`}
                x={text.x}
                y={svgY}
                fontSize={text.fontSize}
                fontFamily="Helvetica, Arial, sans-serif"
                fill={text.color}
                dominantBaseline="alphabetic"
              >
                {line}
              </text>
            );
          })}
        </>
      ) : null}

    </svg>
  );
};

const Settings = () => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [backgroundSrc, setBackgroundSrc] = useState(planeBackground);
  const [characterSrc, setCharacterSrc] = useState(childCharacter);
  const backgroundObjectUrl = useRef(null);
  const characterObjectUrl = useRef(null);

  useEffect(() => {
    return () => {
      if (backgroundObjectUrl.current) {
        URL.revokeObjectURL(backgroundObjectUrl.current);
      }
      if (characterObjectUrl.current) {
        URL.revokeObjectURL(characterObjectUrl.current);
      }
    };
  }, []);

  const updateConfig = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleFileChange = (type, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);

    if (type === 'background') {
      if (backgroundObjectUrl.current) {
        URL.revokeObjectURL(backgroundObjectUrl.current);
      }
      backgroundObjectUrl.current = objectUrl;
      setBackgroundSrc(objectUrl);
    } else {
      if (characterObjectUrl.current) {
        URL.revokeObjectURL(characterObjectUrl.current);
      }
      characterObjectUrl.current = objectUrl;
      setCharacterSrc(objectUrl);
    }
  };

  const resetAssets = () => {
    if (backgroundObjectUrl.current) {
      URL.revokeObjectURL(backgroundObjectUrl.current);
      backgroundObjectUrl.current = null;
    }
    if (characterObjectUrl.current) {
      URL.revokeObjectURL(characterObjectUrl.current);
      characterObjectUrl.current = null;
    }
    setBackgroundSrc(planeBackground);
    setCharacterSrc(childCharacter);
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
  };

  const previewData = useMemo(
    () => buildPreviewData(config, backgroundSrc, characterSrc),
    [config, backgroundSrc, characterSrc]
  );

  return (
    <div className="space-y-8 px-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Fine-tune the story page layout and see changes instantly. Use this sandbox to explore
            different combinations before applying them to storybooks.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={resetAssets}>
            Reset Images
          </Button>
          <Button variant="outline" onClick={resetConfig}>
            Reset Layout
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="order-2 overflow-hidden xl:order-1">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>
              Preview updates with each change. The canvas matches the PDF aspect ratio used across
              storybooks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/40 shadow-inner"
              style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
            >
              <ConfigurableStoryPageSvg data={previewData} />
            </div>
          </CardContent>
        </Card>

        <div className="order-1 flex flex-col gap-6 xl:order-2">
          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <CardDescription>Swap the background or character image to test different looks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="background-upload">Background image</Label>
                <Input
                  id="background-upload"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleFileChange('background', event)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="character-upload">Character image</Label>
                <Input
                  id="character-upload"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleFileChange('character', event)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Layout</CardTitle>
              <CardDescription>Adjust how the background, character, and text stack on the page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Character side</Label>
                <Select
                  value={config.characterSide}
                  onValueChange={(value) => updateConfig('characterSide', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Character width ratio</Label>
                  <span className="text-muted-foreground">
                    {(config.characterWidthRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[config.characterWidthRatio]}
                  min={0.2}
                  max={0.6}
                  step={0.01}
                  onValueChange={(value) => updateConfig('characterWidthRatio', value[0])}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Character height ratio</Label>
                  <span className="text-muted-foreground">
                    {(config.characterHeightRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[config.characterHeightRatio]}
                  min={0.4}
                  max={1}
                  step={0.02}
                  onValueChange={(value) => updateConfig('characterHeightRatio', value[0])}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="font-medium">Character offset X</Label>
                    <span className="text-muted-foreground">{config.characterOffsetX}px</span>
                  </div>
                  <Slider
                    value={[config.characterOffsetX]}
                    min={-150}
                    max={150}
                    step={1}
                    onValueChange={(value) => updateConfig('characterOffsetX', value[0])}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="font-medium">Character offset Y</Label>
                    <span className="text-muted-foreground">{config.characterOffsetY}px</span>
                  </div>
                  <Slider
                    value={[config.characterOffsetY]}
                    min={-150}
                    max={150}
                    step={1}
                    onValueChange={(value) => updateConfig('characterOffsetY', value[0])}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Text margin</Label>
                  <span className="text-muted-foreground">{config.textMargin}px</span>
                </div>
                <Slider
                  value={[config.textMargin]}
                  min={20}
                  max={120}
                  step={1}
                  onValueChange={(value) => updateConfig('textMargin', value[0])}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Text width ratio</Label>
                  <span className="text-muted-foreground">
                    {(config.textBlockWidthRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[config.textBlockWidthRatio]}
                  min={0.25}
                  max={0.55}
                  step={0.01}
                  onValueChange={(value) => updateConfig('textBlockWidthRatio', value[0])}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="font-medium">Text offset X</Label>
                    <span className="text-muted-foreground">{config.textOffsetX}px</span>
                  </div>
                  <Slider
                    value={[config.textOffsetX]}
                    min={-120}
                    max={120}
                    step={1}
                    onValueChange={(value) => updateConfig('textOffsetX', value[0])}
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="font-medium">Text offset Y</Label>
                    <span className="text-muted-foreground">{config.textOffsetY}px</span>
                  </div>
                  <Slider
                    value={[config.textOffsetY]}
                    min={-120}
                    max={120}
                    step={1}
                    onValueChange={(value) => updateConfig('textOffsetY', value[0])}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Baseline ratio</Label>
                  <span className="text-muted-foreground">
                    {(config.textBaselineRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[config.textBaselineRatio]}
                  min={0.5}
                  max={0.85}
                  step={0.01}
                  onValueChange={(value) => updateConfig('textBaselineRatio', value[0])}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <Label className="font-medium">Baseline offset</Label>
                  <span className="text-muted-foreground">{config.textBaselineOffset}px</span>
                </div>
                <Slider
                  value={[config.textBaselineOffset]}
                  min={-40}
                  max={60}
                  step={1}
                  onValueChange={(value) => updateConfig('textBaselineOffset', value[0])}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Text</CardTitle>
              <CardDescription>Control the story paragraph, typeface size, and color palette.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="story-text">Story text</Label>
                <Textarea
                  id="story-text"
                  rows={6}
                  value={config.storyText}
                  onChange={(event) => updateConfig('storyText', event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="font-size">Font size</Label>
                  <Input
                    id="font-size"
                    type="number"
                    min={10}
                    max={32}
                    value={config.textFontSize}
                    onChange={(event) =>
                      updateConfig('textFontSize', Number(event.target.value) || 16)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="line-height">Line height</Label>
                  <Input
                    id="line-height"
                    type="number"
                    min={1.1}
                    max={2}
                    step={0.05}
                    value={config.textLineHeight}
                    onChange={(event) =>
                      updateConfig('textLineHeight', Number(event.target.value) || 1.4)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-color">Text color</Label>
                <Input
                  id="text-color"
                  type="color"
                  value={config.textColor}
                  onChange={(event) => updateConfig('textColor', event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overlay</CardTitle>
              <CardDescription>Shape the blurred capsule that makes the paragraph readable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="padding-left">Padding left</Label>
                  <Input
                    id="padding-left"
                    type="number"
                    min={0}
                    max={180}
                    value={config.overlayPaddingLeft}
                    onChange={(event) =>
                      updateConfig('overlayPaddingLeft', Number(event.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="padding-right">Padding right</Label>
                  <Input
                    id="padding-right"
                    type="number"
                    min={0}
                    max={180}
                    value={config.overlayPaddingRight}
                    onChange={(event) =>
                      updateConfig('overlayPaddingRight', Number(event.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="padding-vertical">Padding vertical</Label>
                  <Input
                    id="padding-vertical"
                    type="number"
                    min={0}
                    max={180}
                    value={config.overlayPaddingVertical}
                    onChange={(event) =>
                      updateConfig('overlayPaddingVertical', Number(event.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overlay-blur">Blur strength</Label>
                  <Input
                    id="overlay-blur"
                    type="number"
                    min={0}
                    max={40}
                    value={config.overlayBlur}
                    onChange={(event) =>
                      updateConfig('overlayBlur', Number(event.target.value) || 0)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mask-width">Mask width factor</Label>
                  <Input
                    id="mask-width"
                    type="number"
                    min={1}
                    max={4}
                    step={0.1}
                    value={config.overlayMaskWidthFactor}
                    onChange={(event) =>
                      updateConfig('overlayMaskWidthFactor', Number(event.target.value) || 1)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mask-height">Mask height factor</Label>
                  <Input
                    id="mask-height"
                    type="number"
                    min={1}
                    max={4}
                    step={0.1}
                    value={config.overlayMaskHeightFactor}
                    onChange={(event) =>
                      updateConfig('overlayMaskHeightFactor', Number(event.target.value) || 1)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mask-hardness">Mask hardness</Label>
                <Slider
                  id="mask-hardness"
                  value={[config.overlayMaskHardness]}
                  min={0.3}
                  max={0.95}
                  step={0.01}
                  onValueChange={(value) => updateConfig('overlayMaskHardness', value[0])}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="overlay-color">Fallback color</Label>
                  <Input
                    id="overlay-color"
                    type="color"
                    value={config.overlayFallbackColor}
                    onChange={(event) =>
                      updateConfig('overlayFallbackColor', event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overlay-opacity">Fallback opacity</Label>
                  <Input
                    id="overlay-opacity"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.overlayFallbackOpacity}
                    onChange={(event) =>
                      updateConfig('overlayFallbackOpacity', Number(event.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default Settings;