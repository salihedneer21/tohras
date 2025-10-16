const fetch = require('node-fetch');
const { validationResult } = require('express-validator');

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini-2024-07-18';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_APP_URL = process.env.OPENROUTER_APP_URL || 'https://example.com';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'AI Book Story';

const SYSTEM_INSTRUCTION = `
You are an expert visual prompt engineer. Given a single reference image of a child, produce a clean, photorealistic prompt that can regenerate the same child for fine-tuning.

Output requirements:
- Compose the response as 2–3 sentences that each begin with a strong action verb such as "Generate", "Create", or "Capture", followed by a final sentence that begins with "Do not include".
- The descriptive sentences must cover only what is visibly present (pose, facing direction, expression, detailed wardrobe with colours and textures, held items, lighting, framing, camera angle, setting cues). Combine related details naturally rather than repeating rigid prefixes.
- If the child is interacting with notable props (holding an item, sitting on or riding something, leaning against an object), describe that interaction accurately in the same sentence as the relevant pose details.
- If the image clearly conveys cultural or regional cues tied to Israel, Jerusalem, or related traditions (buildings, attire, ceremonial items, landscapes), weave those into the description naturally.
- One descriptive sentence must clearly state that the background is completely absent (transparent alpha channel or featureless neutral void) so the subject can be composited elsewhere.
- If the reference image shows a kippah (skullcap), explicitly mention it.
- If the reference image shows notable garments, uniforms, accessories, jewellery, fabric patterns, or modern/casual dress cues, describe them precisely, including the exact garment type (e.g. t-shirt, button-up shirt, kurta, dress), colours, textures, and whether the look is formal, casual, sporty, traditional, etc.
- If the child is interacting with notable props (holding an item, sitting on or riding something, leaning against an object), describe that interaction accurately in the same sentence as the relevant pose details, naming the object clearly.
- Never mention or speculate about hair colour, eye colour, skin tone, ethnicity, or age. Do not fabricate traits that aren’t visible in the reference.
- Do not reference other people, animals, props, or scenery unless they genuinely appear in the image.
- The final "Do not include" sentence must list all exclusions in a natural way (e.g. “Do not include any background elements, additional people, animals, props, harsh shadows, painterly styles, or blur beyond the neutral void.”).
- Return strictly valid JSON with a single key "prompt" whose value is the multi-sentence text described above. All wording must be generated fresh from the visual cues—avoid stock phrasing.
`;

const parseApiResponse = (content) => {
  if (!content) {
    throw new Error('LLM returned an empty response');
  }

  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
      ? content
          .map((segment) =>
            typeof segment === 'string' ? segment : segment?.text || ''
          )
          .join('\n')
      : '';

  if (!raw.trim()) {
    throw new Error('LLM returned an empty response');
  }

  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonString = jsonMatch ? jsonMatch[1] : raw;

  try {
    const payload = JSON.parse(jsonString);
    if (!payload.prompt) {
      throw new Error('Missing "prompt" key in LLM response');
    }
    return {
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt || '',
    };
  } catch (error) {
    throw new Error(`Failed to parse LLM response: ${error.message}`);
  }
};

exports.generatePrompts = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      success: false,
      message:
        'OPENROUTER_API_KEY is not configured. Add it to the environment before generating prompts.',
    });
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    return res.status(400).json({
      success: false,
      message: 'Upload at least one image to generate prompts.',
    });
  }

  try {
    const additionalContext =
      typeof req.body.additionalContext === 'string'
        ? req.body.additionalContext
        : '';
    const results = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mime = file.mimetype || 'image/jpeg';
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const userContent = [];

      if (additionalContext?.trim()) {
        userContent.push({ type: 'text', text: additionalContext.trim() });
      }

      userContent.push({
        type: 'text',
        text: 'Use the following reference image to extract visual details. Do not fabricate traits that are not visible.',
      });

      userContent.push({
        type: 'image_url',
        image_url: {
          url: dataUrl,
        },
      });

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': OPENROUTER_APP_URL,
          'X-Title': OPENROUTER_APP_NAME,
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            {
              role: 'system',
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.text();
        throw new Error(
          `OpenRouter request failed (${response.status}): ${errorPayload}`
        );
      }

      const payload = await response.json();
      const choice = payload?.choices?.[0]?.message;
      const parsed = parseApiResponse(choice?.content);
      const trimmedPrompt = parsed.prompt?.trim?.() || '';
      const trimmedNegative = parsed.negative_prompt?.trim?.();
      const mergedPrompt =
        trimmedNegative && trimmedNegative.length > 0
          ? `${trimmedPrompt}${trimmedPrompt.endsWith('.') ? '' : '.'}\nDo not: ${trimmedNegative}`
          : trimmedPrompt;

      results.push({
        fileName: file.originalname,
        position: index,
        prompt: mergedPrompt,
      });
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('Error generating prompts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate prompts',
      error: error.message,
    });
  }
};
