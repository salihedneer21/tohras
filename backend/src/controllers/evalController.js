const fetch = require('node-fetch');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const EVALUATION_GUIDE = `
You are a senior dataset curator preparing photos for fine-tuning personalised children's-story illustrations.

Use these rules when judging each image:
- A strong dataset has 10-15 high-resolution photos of the child.
- Face must be clearly visible; no sunglasses, hats, major obstructions.
- Torso-up, front-facing framing preferred (head and shoulders, relaxed posture).
- Only the child should be present. If another person appears (even partially), the image MUST be rejected.
- Include varied expressions (smile, neutral, etc.).
- Capture multiple lighting conditions and backgrounds.
- Good examples: school portraits, well-lit casual phone photos with unobstructed faces.
- Avoid blurred, cropped, dark, obstructed, group, or heavily stylised images.

Return STRICT JSON using this schema:
{
  "overallAcceptance": {
    "acceptedCount": number,
    "rejectedCount": number,
    "verdict": "accept" | "needs_more" | "reject",
    "confidencePercent": integer 0-100,
    "summary": "short paragraph"
  },
  "images": [
    {
      "name": "filename or Image X",
      "overallScorePercent": integer 0-100,
      "acceptable": boolean,
      "verdict": "accept" | "needs_more" | "reject",
      "confidencePercent": integer 0-100,
      "criteria": {
        "clarity": { "scorePercent": integer 0-100, "verdict": "yes" | "no", "notes": "concise note" },
        "framing": { "scorePercent": integer 0-100, "verdict": "yes" | "no", "notes": "..." },
        "expression": { "scorePercent": integer 0-100, "verdict": "yes" | "no", "notes": "..." },
        "lighting": { "scorePercent": integer 0-100, "verdict": "yes" | "no", "notes": "..." },
        "safety": { "scorePercent": integer 0-100, "verdict": "yes" | "no", "notes": "..." }
      },
      "recommendations": ["actionable recommendation", "..."]
    }
  ],
  "acceptedImages": ["names"],
  "rejectedImages": ["names"]
}

Rules:
- All numeric scores are integers between 0 and 100.
- Verdict fields must match the allowed strings exactly.
- Provide at least one recommendation if acceptable is false or verdict is "needs_more"/"reject".
- Ensure JSON is valid even if arrays are empty.
- Treat an image as acceptable only if its overall score is at least 45 AND the face is clearly visible AND there is only one child present.
- If the face is not clearly visible or multiple people/faces are detected, mark the image as unacceptable with an explicit reason.
`;

/**
 * Evaluate images for fine-tuning suitability using OpenRouter vision model
 * @route POST /api/evals
 */
exports.evaluateImages = async (req, res) => {
  try {
    const { image, images } = req.body || {};
    let targetImage = null;

    if (image && image.base64) {
      targetImage = image;
    } else if (Array.isArray(images) && images.length > 0) {
      if (images.length === 1 && images[0]?.base64) {
        targetImage = images[0];
      } else {
        return res.status(400).json({
          success: false,
          message: 'Only a single image may be evaluated at a time',
        });
      }
    }

    if (!targetImage || !targetImage.base64) {
      return res.status(400).json({
        success: false,
        message: 'Please provide one image to evaluate',
      });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Missing OpenRouter API key configuration',
      });
    }

    const label = targetImage.name || 'Uploaded Image';

    const userContent = [
      {
        type: 'text',
        text: `File name: ${label}. Evaluate this single image for fine-tuning readiness and respond with the mandated JSON schema.`,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${targetImage.mimeType || 'image/png'};base64,${targetImage.base64}`,
        },
      },
    ];

    const payload = {
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: EVALUATION_GUIDE,
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    };

    const openRouterResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Book Story - Dataset Evaluator',
      },
      body: JSON.stringify(payload),
    });

    const completion = await openRouterResponse.json();

    if (!openRouterResponse.ok) {
      return res.status(openRouterResponse.status).json({
        success: false,
        message: 'Failed to evaluate images',
        error: completion?.error || completion,
      });
    }

    const messageContent = completion?.choices?.[0]?.message?.content;
    if (!messageContent) {
      return res.status(502).json({
        success: false,
        message: 'Invalid response from evaluator model',
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(messageContent);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Evaluator returned non-JSON output',
        raw: messageContent,
      });
    }

    const normalised = normaliseEvaluation(parsed);

    return res.status(200).json({
      success: true,
      data: normalised,
    });
  } catch (error) {
    console.error('❌ Error evaluating images:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to evaluate images',
      error: error.message,
    });
  }
};

function clampPercent(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

function normaliseEvaluation(payload) {
  const data = payload && typeof payload === 'object' ? { ...payload } : {};

  const images = Array.isArray(data.images) ? data.images.map((img) => ({ ...img })) : [];
  let acceptedCount = 0;
  let rejectedCount = 0;

  images.forEach((img, index) => {
    const score = clampPercent(img.overallScorePercent);
    let acceptable = score >= 45;
    let verdict = acceptable ? 'accept' : 'reject';
    let forcedRejectReason = null;
    const confidence = clampPercent(img.confidencePercent, acceptable ? 70 : 50);

    img.name = img.name || `Image ${index + 1}`;
    img.overallScorePercent = score;
    img.confidencePercent = confidence;

    if (!img.criteria || typeof img.criteria !== 'object') {
      img.criteria = {};
    }

    ['clarity', 'framing', 'expression', 'lighting', 'safety'].forEach((key) => {
      const detail = img.criteria[key] && typeof img.criteria[key] === 'object' ? { ...img.criteria[key] } : {};
      detail.scorePercent = clampPercent(detail.scorePercent);
      detail.verdict = detail.verdict === 'yes' ? 'yes' : 'no';
      if (detail.verdict === 'yes' && !detail.notes) {
        detail.notes = 'Looks suitable.';
      }
      const notesText = (detail.notes || '').toLowerCase();
      if (key === 'clarity' && detail.verdict !== 'yes') {
        acceptable = false;
        forcedRejectReason = forcedRejectReason || 'The face is not clearly visible.';
      }
      if (key === 'safety' && detail.verdict !== 'yes') {
        acceptable = false;
        forcedRejectReason = forcedRejectReason || 'Multiple people or unsafe content detected.';
      }
      if (!forcedRejectReason && (notesText.includes('multiple face') || notesText.includes('two people') || notesText.includes('another person'))) {
        acceptable = false;
        forcedRejectReason = 'Multiple people detected in the frame.';
      }
      img.criteria[key] = detail;
    });

    if (!Array.isArray(img.recommendations)) {
      img.recommendations = [];
    }

    if (forcedRejectReason && !img.recommendations.includes(forcedRejectReason)) {
      img.recommendations.unshift(forcedRejectReason);
    }

    if (acceptable) {
      acceptedCount += 1;
    } else {
      rejectedCount += 1;
      if (img.recommendations.length === 0) {
        img.recommendations.push('Provide a clearer photo that follows the image guidelines.');
      }
      verdict = 'reject';
    }

    img.acceptable = acceptable;
    img.verdict = verdict;
  });

  data.images = images;
  data.acceptedImages = images.filter((img) => img.acceptable).map((img) => img.name);
  data.rejectedImages = images.filter((img) => !img.acceptable).map((img) => img.name);

  const overall = data.overallAcceptance && typeof data.overallAcceptance === 'object' ? { ...data.overallAcceptance } : {};
  overall.acceptedCount = acceptedCount;
  overall.rejectedCount = rejectedCount;

  const total = images.length;
  if (total === 0) {
    overall.verdict = 'needs_more';
    overall.confidencePercent = clampPercent(overall.confidencePercent, 50);
    overall.summary = overall.summary || 'No image was evaluated.';
  } else if (acceptedCount === total) {
    overall.verdict = 'accept';
    overall.confidencePercent = clampPercent(overall.confidencePercent, 80);
    overall.summary =
      overall.summary ||
      'The image meets the fine-tuning requirements. You can include it in the training set.';
  } else if (acceptedCount === 0) {
    overall.verdict = 'reject';
    overall.confidencePercent = clampPercent(overall.confidencePercent, 70);
    overall.summary =
      overall.summary ||
      'The image does not meet the quality requirements. Capture a new photo following the guidelines.';
  } else {
    overall.verdict = 'needs_more';
    overall.confidencePercent = clampPercent(overall.confidencePercent, 65);
    overall.summary =
      overall.summary ||
      'Some aspects of the photo need improvement. Consider retaking the image under better conditions.';
  }

  data.overallAcceptance = overall;
  return data;
}
