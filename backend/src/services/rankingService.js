const fetch = require('node-fetch');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RANKING_SYSTEM_PROMPT = `You are an art director for a children's storytelling studio. Given a user prompt, the child's reference details (name, gender, age), and four candidate images of the same child, rank the images best to worst.

Evaluate each image on these equally weighted criteria:
1. Facial likeness — the child's face must be clear, realistic, and consistent with the profile.
2. Body anatomy & proportions — limbs, posture, and scale should be natural and child-appropriate.
3. Wardrobe suitability — clothing should fit the prompt context, be neat, and appropriate for a child.
4. Composition & framing — the child should be centered or artfully framed, with minimal clipping.
5. Identity fidelity — the child must align with the provided gender and approximate age. Penalize any mismatched gender presentation or age-inappropriate depiction (e.g., toddler vs teenager).
6. Technical quality — lighting, background coherence, and absence of AI artifacts or hallucinated elements.

Return strict JSON with this schema:
{
  "summary": "short paragraph",
  "promptReflection": "one sentence about prompt alignment",
  "ranked": [
    {
      "imageIndex": <1-4>,
      "rank": <1-4>,
      "score": <0-100 integer>,
      "verdict": "excellent" | "good" | "fair" | "poor",
      "notes": "<=160 characters describing strengths/weaknesses"
    }
  ],
  "winners": [<imageIndex of best image>]
}

Rules:
- Ranks must be unique integers: 1 is best.
- Scores must correlate with rank (higher rank => higher score, no ties).
- Always provide notes for each image referencing at least one criterion.
- Call out any mismatches with the child's profile (gender, age) explicitly in the notes and lower the score accordingly.
- If you detect fatal issues (severe distortions, wrong subject, multiple people) lower the score drastically and explain why.
- You must base every judgment strictly on the actual visual evidence. Avoid assumptions or invented details not present in the image.
- Use the provided image indices (1..4) exactly.
`;

const clampScore = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
};

const normaliseChildProfile = (childProfile) => {
  if (!childProfile) return null;
  const { name, gender, age } = childProfile;
  return {
    name: name || '',
    gender: gender || '',
    age: typeof age === 'number' ? age : age ? Number(age) : null,
  };
};

const buildUserContent = ({ prompt, assets, childDescriptor }) => {
  const content = [
    {
      type: 'text',
      text: `${childDescriptor}`,
    },
    {
      type: 'text',
      text: `User prompt: "${prompt}". Evaluate and rank the following ${assets.length} images with emphasis on matching the child profile.`,
    },
  ];

  assets.forEach((asset, index) => {
    const label = `Image ${index + 1}`;
    content.push({ type: 'text', text: label });
    content.push({
      type: 'image_url',
      image_url: {
        url: asset.signedUrl || asset.url,
      },
    });
  });

  return content;
};

const inferChildDescriptor = (profile) => {
  if (!profile) {
    return 'Child profile not provided; prefer images that present a child consistent with the prompt.';
  }

  const parts = [];
  if (profile.name) parts.push(`Name: ${profile.name}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  if (Number.isFinite(profile.age)) parts.push(`Age: ${profile.age}`);

  return parts.length
    ? `Child profile — ${parts.join(', ')}. Images must match this profile.`
    : 'Child profile not provided; prefer images that present a child consistent with the prompt.';
};

async function rankGeneratedImages({ prompt, assets, childProfile }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured for ranking');
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('No assets provided for ranking');
  }

  const profile = normaliseChildProfile(childProfile);
  const childDescriptor = inferChildDescriptor(profile);

  const userContent = buildUserContent({ prompt, assets, childDescriptor });

  const payload = {
    model:
      process.env.OPENROUTER_RANK_MODEL ||
      process.env.OPENROUTER_MODEL ||
      'openai/gpt-4o-mini-2024-07-18',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: RANKING_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'AI Book Story - Ranked Generator',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errMessage = data?.error?.message || data?.error || JSON.stringify(data);
    throw new Error(`Ranking model error: ${errMessage}`);
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error('Ranking model returned empty content');
  }

  let parsed;
  try {
    parsed = JSON.parse(messageContent);
  } catch (error) {
    throw new Error('Ranking model returned invalid JSON');
  }

  const ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
  if (!ranked.length) {
    throw new Error('Ranking model did not return any results');
  }

  const cleanedRanked = ranked.map((entry, idx) => {
    const imageIndexRaw = entry.imageIndex ?? entry.index ?? idx + 1;
    const imageIndex = clampScore(imageIndexRaw, idx + 1);
    const rankRaw = entry.rank ?? idx + 1;
    const rank = clampScore(rankRaw, idx + 1);
    const scoreRaw = entry.score ?? entry.scorePercent ?? 70 - idx * 5;
    const score = clampScore(scoreRaw, 70 - idx * 5);
    const verdictRaw = (entry.verdict || '').toString().toLowerCase();
    const verdict = ['excellent', 'good', 'fair', 'poor'].includes(verdictRaw)
      ? verdictRaw
      : score >= 85
      ? 'excellent'
      : score >= 70
      ? 'good'
      : score >= 55
      ? 'fair'
      : 'poor';
    const notes = (entry.notes || '').toString().slice(0, 200);

    return {
      imageIndex,
      rank,
      score,
      verdict,
      notes,
    };
  });

  const sorted = cleanedRanked.slice().sort((a, b) => a.rank - b.rank);
  sorted.forEach((entry, idx) => {
    entry.rank = idx + 1;
    if (!Number.isInteger(entry.imageIndex) || entry.imageIndex < 1 || entry.imageIndex > assets.length) {
      entry.imageIndex = idx + 1;
    }
  });

  const winners = Array.isArray(parsed?.winners) && parsed.winners.length
    ? parsed.winners
        .map((item) => clampScore(item, 1))
        .filter((item) => item >= 1 && item <= assets.length)
    : [sorted[0].imageIndex];

  return {
    summary: parsed.summary || '',
    promptReflection: parsed.promptReflection || parsed.prompt_reflection || '',
    ranked: sorted,
    winners,
    raw: parsed,
    childProfile: profile,
  };
}

module.exports = {
  rankGeneratedImages,
};
