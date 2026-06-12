import mongoose from 'mongoose';

/**
 * AI response validators - keep conservative defaults on failure
 */

const getClassificationDefaults = () => ({
  classification: 'UNKNOWN',
  confidence: 0,
  detected_pii: [],
  pii_risk: 'LOW',
  reasoning: 'AI analysis failed - using conservative defaults'
});

const getMalwareBehaviorDefaults = () => ({
  is_malware: false,
  threat_level: 'SAFE',
  behavior_score: 0,
  detected_behaviors: [],
  recommendation: 'ALLOW'
});

const getSuspiciousSharingDefaults = () => ({
  is_suspicious: false,
  risk_score: 0,
  concerns: [],
  action: 'ALLOW'
});

const getAccessAnomalyDefaults = () => ({
  anomalies_detected: false,
  confidence: 0,
  issues: [],
  recommendation: 'ALLOW'
});

export const validateClassificationResponse = (rawResponse) => {
  try {
    const jsonMatch = typeof rawResponse === 'string' && rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valid: false, data: getClassificationDefaults() };

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.classification || typeof parsed.classification !== 'string') {
      throw new Error('Missing or invalid classification field');
    }

    const validClassifications = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'TOP_SECRET', 'UNKNOWN'];
    let classification = parsed.classification.toUpperCase();
    if (!validClassifications.includes(classification)) classification = 'UNKNOWN';

    let confidence = Number(parsed.confidence) || 0;
    if (confidence < 0 || confidence > 100) confidence = 0;

    const detectedPii = Array.isArray(parsed.detected_pii) ? parsed.detected_pii : [];
    const validRisks = ['LOW', 'MEDIUM', 'HIGH'];
    const piiRisk = (parsed.pii_risk || 'LOW').toUpperCase();
    const finalPiiRisk = validRisks.includes(piiRisk) ? piiRisk : 'LOW';

    return {
      valid: true,
      data: {
        classification,
        confidence,
        detected_pii: detectedPii.slice(0, 10),
        pii_risk: finalPiiRisk,
        reasoning: (parsed.reasoning || '').substring(0, 500),
        raw_response: rawResponse
      }
    };
  } catch (error) {
    console.error('[AI Validator] Classification validation failed:', error.message);
    return { valid: false, data: getClassificationDefaults(), error: error.message };
  }
};

export const validateMalwareBehaviorResponse = (rawResponse) => {
  try {
    const jsonMatch = typeof rawResponse === 'string' && rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valid: false, data: getMalwareBehaviorDefaults() };

    const parsed = JSON.parse(jsonMatch[0]);

    const isMalware = parsed.is_malware === true;
    const validLevels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'SAFE'];
    const threatLevel = (parsed.threat_level || 'SAFE').toUpperCase();
    const finalThreat = validLevels.includes(threatLevel) ? threatLevel : 'SAFE';

    const behaviorScore = Math.max(0, Math.min(100, Number(parsed.behavior_score) || 0));
    const validActions = ['BLOCK', 'QUARANTINE', 'ALLOW', 'ANALYZE'];
    const recommendation = (parsed.recommendation || 'ALLOW').toUpperCase();
    const finalRec = validActions.includes(recommendation) ? recommendation : 'ALLOW';

    return {
      valid: true,
      data: {
        is_malware: isMalware,
        threat_level: finalThreat,
        behavior_score: behaviorScore,
        detected_behaviors: (Array.isArray(parsed.detected_behaviors) ? parsed.detected_behaviors : []).slice(0, 10),
        recommendation: finalRec,
        raw_response: rawResponse
      }
    };
  } catch (error) {
    console.error('[AI Validator] Malware behavior validation failed:', error.message);
    return { valid: false, data: getMalwareBehaviorDefaults(), error: error.message };
  }
};

export const validateSuspiciousSharingResponse = (rawResponse) => {
  try {
    const jsonMatch = typeof rawResponse === 'string' && rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valid: false, data: getSuspiciousSharingDefaults() };

    const parsed = JSON.parse(jsonMatch[0]);

    const isSuspicious = parsed.is_suspicious === true;
    const riskScore = Math.max(0, Math.min(100, Number(parsed.risk_score) || 0));
    const validActions = ['ALLOW', 'WARN', 'BLOCK', 'REQUIRE_APPROVAL'];
    const action = (parsed.action || 'ALLOW').toUpperCase();
    const finalAction = validActions.includes(action) ? action : 'ALLOW';

    return {
      valid: true,
      data: {
        is_suspicious: isSuspicious,
        risk_score: riskScore,
        concerns: (Array.isArray(parsed.concerns) ? parsed.concerns : []).slice(0, 10),
        action: finalAction,
        raw_response: rawResponse
      }
    };
  } catch (error) {
    console.error('[AI Validator] Suspicious sharing validation failed:', error.message);
    return { valid: false, data: getSuspiciousSharingDefaults(), error: error.message };
  }
};

export const validateAccessAnomalyResponse = (rawResponse) => {
  try {
    const jsonMatch = typeof rawResponse === 'string' && rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { valid: false, data: getAccessAnomalyDefaults() };

    const parsed = JSON.parse(jsonMatch[0]);

    const anomaliesDetected = parsed.anomalies_detected === true;
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 0));
    const validRecommendations = ['ALLOW', 'REQUIRE_2FA', 'BLOCK', 'INVESTIGATE'];
    const recommendation = (parsed.recommendation || 'ALLOW').toUpperCase();
    const finalRecommendation = validRecommendations.includes(recommendation) ? recommendation : 'ALLOW';

    return {
      valid: true,
      data: {
        anomalies_detected: anomaliesDetected,
        confidence,
        issues: (Array.isArray(parsed.issues) ? parsed.issues : []).slice(0, 10),
        recommendation: finalRecommendation,
        raw_response: rawResponse
      }
    };
  } catch (error) {
    console.error('[AI Validator] Access anomaly validation failed:', error.message);
    return { valid: false, data: getAccessAnomalyDefaults(), error: error.message };
  }
};

export {
  getClassificationDefaults,
  getMalwareBehaviorDefaults,
  getSuspiciousSharingDefaults,
  getAccessAnomalyDefaults
};
