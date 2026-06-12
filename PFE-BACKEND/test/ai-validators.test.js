import { validateClassificationResponse, validateMalwareBehaviorResponse, validateSuspiciousSharingResponse, validateAccessAnomalyResponse } from '../utils/ai-validators.js';

describe('AI Validators', () => {
  test('classification valid JSON', () => {
    const raw = JSON.stringify({ classification: 'CONFIDENTIAL', confidence: 90, detected_pii: ['EMAIL'], pii_risk: 'HIGH', reasoning: 'ok' });
    const res = validateClassificationResponse(raw);
    expect(res.valid).toBe(true);
    expect(res.data.classification).toBe('CONFIDENTIAL');
    expect(res.data.confidence).toBe(90);
  });

  test('malware behavior valid JSON', () => {
    const raw = JSON.stringify({ is_malware: true, threat_level: 'HIGH', behavior_score: 80, detected_behaviors: ['injection'], recommendation: 'QUARANTINE' });
    const res = validateMalwareBehaviorResponse(raw);
    expect(res.valid).toBe(true);
    expect(res.data.is_malware).toBe(true);
    expect(res.data.recommendation).toBe('QUARANTINE');
  });

  test('suspicious sharing valid JSON', () => {
    const raw = JSON.stringify({ is_suspicious: true, risk_score: 85, concerns: ['mass'], action: 'REQUIRE_APPROVAL' });
    const res = validateSuspiciousSharingResponse(raw);
    expect(res.valid).toBe(true);
    expect(res.data.risk_score).toBe(85);
  });

  test('access anomaly valid JSON', () => {
    const raw = JSON.stringify({ anomalies_detected: true, confidence: 75, issues: ['impossible travel'], recommendation: 'require_2fa' });
    const res = validateAccessAnomalyResponse(raw);
    expect(res.valid).toBe(true);
    expect(res.data.recommendation).toBe('REQUIRE_2FA');
  });
});
