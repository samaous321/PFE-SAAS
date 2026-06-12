import axios from 'axios';
import * as aiService from '../services/ai-ollama.service.js';

jest.mock('axios');

describe('AI Ollama Service', () => {
  beforeEach(() => jest.clearAllMocks());

  test('classifyDocumentSensitivity returns validated response', async () => {
    axios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ classification: 'PUBLIC', confidence: 50 }) } });
    const result = await aiService.classifyDocumentSensitivity({ filename: 'f' }, 'sample');
    expect(result.validation.valid).toBe(true);
    expect(result.validation.data.classification).toBe('PUBLIC');
  });

  test('detectAccessAnomalies returns validated response', async () => {
    axios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ anomalies_detected: false, confidence: 10 }) } });
    const result = await aiService.detectAccessAnomalies('uid', []);
    expect(result.validation.valid).toBe(true);
    expect(result.validation.data.anomalies_detected).toBe(false);
  });

  test('analyzeMalwareBehavior returns validated response', async () => {
    axios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ is_malware: false, threat_level: 'LOW', behavior_score: 10 }) } });
    const result = await aiService.analyzeMalwareBehavior({ filename: 'f' }, {});
    expect(result.validation.valid).toBe(true);
    expect(result.validation.data.threat_level).toBe('LOW');
  });

  test('detectSuspiciousSharing returns validated response', async () => {
    axios.post.mockResolvedValueOnce({ data: { response: JSON.stringify({ is_suspicious: false, risk_score: 5 }) } });
    const result = await aiService.detectSuspiciousSharing('uid', {});
    expect(result.validation.valid).toBe(true);
    expect(result.validation.data.risk_score).toBe(5);
  });
});
