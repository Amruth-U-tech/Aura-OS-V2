const ChallengeSubmission = require('../../models/ChallengeSubmission');
const Challenge = require('../../models/Challenge');
const trustService = require('../domains/trustDomainService');
const playerProfileService = require('../domains/playerProfileDomainService');
const auraEvents = require('../../events/eventBus');
const { EVENTS } = require('../../events/eventConstants');

// ======================================================
// AI VALIDATION ORCHESTRATOR — Phase 2.4.2
// Triggers Gemini AI to validate challenge submission proofs
// Refinements: image URL in prompts, immediate trust update,
//              enhanced prompt quality, edge case handling
// Handles: API calls, timeouts, quota errors, retries
// Must NOT: determine winners or distribute XP
// ======================================================

const GEMMA_API_KEY = () => process.env.GEMMA_API_KEY;
const GEMMA_API_URL = () => process.env.GEMMA_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMMA_MODEL = () => process.env.GEMMA_MODEL || 'gemini-2.0-flash';

// ── Validate a submission via Gemini AI ──────────────
// Phase 2.4.2: Validation happens IMMEDIATELY after upload
// Trust is updated immediately after validation
const validateSubmission = async (submissionId) => {
  const submission = await ChallengeSubmission.findById(submissionId);
  if (!submission) throw Object.assign(new Error('Submission not found'), { statusCode: 404 });

  const challenge = await Challenge.findById(submission.challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  // Mark as validating
  submission.status = 'VALIDATING';
  submission.lastAttemptAt = new Date();
  await submission.save();

  const apiKey = GEMMA_API_KEY();
  if (!apiKey) {
    // No API key — use mock validation
    const result = await mockValidation(submission);
    await updateTrustAfterValidation(submission.userId, result.validScore);
    // Phase 3.1.5: Emit for realtime propagation (mock path)
    auraEvents.emitEvent(EVENTS.CHALLENGE_VALIDATED, {
      userId: submission.userId.toString(),
      challengeId: challenge._id.toString(),
      auraChallengeId: challenge.auraChallengeId,
      submissionId: submission._id.toString(),
      validationScore: result.validScore,
      validationStatus: submission.status,
    });
    return result;
  }

  try {
    const prompt = buildValidationPrompt(challenge, submission);
    const url = `${GEMMA_API_URL()}/models/${GEMMA_MODEL()}:generateContent?key=${apiKey}`;

    // Build request body — include image URLs if available
    const parts = [{ text: prompt }];

    // If proof images exist, reference them in the prompt
    // Gemini can analyze image URLs passed as inline_data or referenced
    const hasImages = (submission.proofImageUrls || []).length > 0;
    if (hasImages) {
      // Add image context to text prompt (Gemini flash text mode)
      parts[0].text += `\n\nPROOF IMAGES PROVIDED: ${submission.proofImageUrls.length} image(s)`;
      parts[0].text += `\nImage URLs: ${submission.proofImageUrls.join(', ')}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      }),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      if (response.status === 429) {
        // Quota exceeded — use mock validation as fallback
        console.warn('[AIValidation] Quota exceeded, using mock validation');
        const result = await mockValidation(submission);
        await updateTrustAfterValidation(submission.userId, result.validScore);
        // Phase 3.1.5: Emit for realtime propagation (quota fallback)
        auraEvents.emitEvent(EVENTS.CHALLENGE_VALIDATED, {
          userId: submission.userId.toString(),
          challengeId: challenge._id.toString(),
          auraChallengeId: challenge.auraChallengeId,
          submissionId: submission._id.toString(),
          validationScore: result.validScore,
          validationStatus: submission.status,
        });
        return result;
      }
      throw new Error(errBody.error?.message || `Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse the AI response
    const result = parseAiResponse(textResponse);

    // Update submission with validation result
    submission.validationScore = result.validScore;
    submission.validationProvider = 'GEMINI_AI';
    submission.aiExplanation = result.reason;
    submission.aiRawResponse = data;
    submission.validatedAt = new Date();
    submission.status = result.validScore >= 50 ? 'VERIFIED' : 'REJECTED';
    await submission.save();

    // ── IMMEDIATE trust update after validation ──────
    await updateTrustAfterValidation(submission.userId, result.validScore);

    // Phase 3.1.5: Emit domain event for realtime propagation
    auraEvents.emitEvent(EVENTS.CHALLENGE_VALIDATED, {
      userId: submission.userId.toString(),
      challengeId: challenge._id.toString(),
      auraChallengeId: challenge.auraChallengeId,
      submissionId: submission._id.toString(),
      validationScore: result.validScore,
      validationStatus: submission.status,
    });

    return {
      validScore: result.validScore,
      confidence: result.confidence,
      reason: result.reason,
      status: submission.status,
      trustDelta: trustService.calculateTrustDelta(50, result.validScore)
    };
  } catch (err) {
    console.error('[AIValidation] Error:', err.message);

    // Handle specific error cases
    if (err.name === 'AbortError' || err.message.includes('timeout')) {
      console.warn('[AIValidation] Request timed out, using mock');
    }

    // Fallback to mock on any error
    const result = await mockValidation(submission);
    await updateTrustAfterValidation(submission.userId, result.validScore);
    // Phase 3.1.5: Emit for realtime propagation (error fallback)
    auraEvents.emitEvent(EVENTS.CHALLENGE_VALIDATED, {
      userId: submission.userId.toString(),
      challengeId: challenge._id.toString(),
      auraChallengeId: challenge.auraChallengeId,
      submissionId: submission._id.toString(),
      validationScore: result.validScore,
      validationStatus: submission.status,
    });
    return result;
  }
};

// ── Update trust IMMEDIATELY after validation ────────
const updateTrustAfterValidation = async (userId, validationScore) => {
  try {
    await trustService.recordValidation(userId, validationScore, 'CHALLENGE_SUBMISSION');

    // Also update the denormalized trust score on player profile
    const trustProfile = await trustService.getOrCreate(userId);
    await playerProfileService.updateProgression(userId, {
      trustScore: trustProfile.trustScore
    });
  } catch (err) {
    console.error('[AIValidation] Trust update failed:', err.message);
    // Non-fatal — don't block the validation response
  }
};

// ── Build validation prompt ──────────────────────────
// Phase 2.4.2: Enhanced with strong behavioral validation
const buildValidationPrompt = (challenge, submission) => {
  const hasImages = (submission.proofImageUrls || []).length > 0;
  const hasText = (submission.proofText || '').length > 10;

  return `You are an AI validator for Aura OS, a competitive behavioral challenge platform.
Your job is to evaluate whether a player's submitted proof genuinely demonstrates completion of a challenge objective.

═══════════════════════════════════════
CHALLENGE DETAILS:
═══════════════════════════════════════
- Title: "${challenge.title}"
- Description: "${challenge.description || 'No description provided'}"
- Type: ${challenge.type} (${challenge.type === 'FRIEND_1V1' ? '1v1 competitive challenge' : 'Hub community challenge'})

═══════════════════════════════════════
SUBMISSION EVIDENCE:
═══════════════════════════════════════
- Proof text: "${submission.proofText || 'No text provided'}"
- Proof images: ${hasImages ? `${submission.proofImageUrls.length} image(s) uploaded` : 'No images provided'}
- Attempt number: ${submission.attemptNumber} of ${submission.maxAttempts}
- Evidence quality: ${hasText && hasImages ? 'Text + Images' : hasText ? 'Text Only' : hasImages ? 'Images Only' : 'Minimal Evidence'}

═══════════════════════════════════════
EVALUATION CRITERIA:
═══════════════════════════════════════
1. RELEVANCE: Does the submission directly relate to the challenge objective?
2. COMPLETENESS: Does it demonstrate full completion, not partial effort?
3. CLARITY: Is the evidence clear and unambiguous?
4. AUTHENTICITY: Does it appear genuine (not copy-pasted or fabricated)?

═══════════════════════════════════════
REJECTION CRITERIA:
═══════════════════════════════════════
- Vague or generic text with no specific evidence
- Completely irrelevant submissions
- Obvious copy-paste or placeholder content
- Empty or near-empty submissions
- Submissions that only claim completion without proof

═══════════════════════════════════════
SCORING GUIDE:
═══════════════════════════════════════
90-100: Exceptional proof — clearly and convincingly demonstrates full completion
70-89:  Strong proof — aligns well with the challenge objective with clear evidence
50-69:  Acceptable but weak — shows effort but evidence is somewhat unclear
30-49:  Insufficient — doesn't clearly demonstrate completion
0-29:   Invalid — irrelevant, empty, or clearly fabricated

Respond in EXACTLY this JSON format (no markdown, no code blocks, no extra text):
{"validScore": <0-100>, "confidence": <0-100>, "reason": "<1-2 sentence explanation>"}`;
};

// ── Parse AI response (extract JSON) ─────────────────
const parseAiResponse = (text) => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        validScore: Math.min(100, Math.max(0, parsed.validScore || 0)),
        confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
        reason: parsed.reason || 'No explanation provided'
      };
    }
  } catch { /* fallback below */ }

  return { validScore: 50, confidence: 30, reason: 'Could not parse AI response' };
};

// ── Mock validation (fallback) ───────────────────────
// Enhanced heuristics for when Gemini AI quota is exceeded
// Phase 2.4.3: Improved scoring + clear provider labeling
const mockValidation = async (submission) => {
  const textLen = (submission.proofText || '').length;
  const hasImages = (submission.proofImageUrls || []).length > 0;
  const imageCount = (submission.proofImageUrls || []).length;

  // Scoring heuristic — more generous base for effort
  let score = 40; // Base score (shows effort)
  if (textLen > 150) score += 25;
  else if (textLen > 80) score += 20;
  else if (textLen > 40) score += 12;
  else if (textLen > 15) score += 6;

  if (imageCount >= 2) score += 20;
  else if (hasImages) score += 15;

  // Bonus for both text + images (higher evidence quality)
  if (hasImages && textLen > 30) score += 5;

  // Cap at 82 for mock (real AI can go higher)
  score = Math.min(82, Math.max(20, score));

  // Generate descriptive reason
  let reason;
  if (score >= 65) reason = `Proof accepted — evidence quality appears adequate. Text: ${textLen} chars, Images: ${imageCount}. (Gemini AI quota exceeded — heuristic scoring applied)`;
  else if (score >= 50) reason = `Proof accepted with reservations — consider adding more detail. Text: ${textLen} chars, Images: ${imageCount}. (Gemini AI quota exceeded — heuristic scoring applied)`;
  else if (score >= 35) reason = `Proof insufficient — evidence is too minimal for validation. Text: ${textLen} chars, Images: ${imageCount}. (Gemini AI quota exceeded — heuristic scoring applied)`;
  else reason = `Proof rejected — provide meaningful text and/or image evidence. (Gemini AI quota exceeded — heuristic scoring applied)`;

  submission.validationScore = score;
  submission.validationProvider = 'HEURISTIC_FALLBACK';
  submission.aiExplanation = reason;
  submission.validatedAt = new Date();
  submission.status = score >= 50 ? 'VERIFIED' : 'REJECTED';
  await submission.save();

  return {
    validScore: score,
    confidence: 35,
    reason,
    status: submission.status,
    provider: 'HEURISTIC_FALLBACK'
  };
};

module.exports = { validateSubmission, buildValidationPrompt, parseAiResponse };
