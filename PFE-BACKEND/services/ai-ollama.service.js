/**
 * 🤖 AI SECURITY SERVICE - OLLAMA LOCAL INTEGRATION
 * 
 * Uses Ollama (running on VM) for:
 * - Anomaly Detection (Access patterns)
 * - Document Sensitivity Classification
 * - Malware Behavioral Analysis
 * - Suspicious Sharing Detection
 * 
 * Runs completely LOCAL - 100% data privacy ✅
 */

import axios from 'axios';
import circuitBreaker from '../utils/ai-circuit-breaker.js';
import { logAIAnalysis } from '../utils/ai-logging.js';
import {
  validateClassificationResponse,
  validateMalwareBehaviorResponse,
  validateSuspiciousSharingResponse,
  validateAccessAnomalyResponse
} from '../utils/ai-validators.js';

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://192.168.61.25:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:latest';
const AI_ENABLED = process.env.AI_ENABLED !== 'false';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000');

console.log(`[AI] Ollama Service initialized`);
console.log(`[AI] Endpoint: ${OLLAMA_HOST}`);
console.log(`[AI] Model: ${OLLAMA_MODEL}`);
console.log(`[AI] Timeout: ${OLLAMA_TIMEOUT_MS}ms`);
console.log(`[AI] Status: ${AI_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}`);

/**
 * Check if Ollama is healthy
 */
export const isOllamaHealthy = async () => {
  if (!AI_ENABLED) return false;
  
  try {
    const response = await axios.get(`${OLLAMA_HOST}/api/tags`, {
      timeout: 5000
    });
    return response.status === 200 && response.data?.models?.length > 0;
  } catch (error) {
    console.warn(`[AI] Ollama health check failed: ${error.message}`);
    return false;
  }
};

/**
 * 1️⃣ DETECT ACCESS ANOMALIES
 * Analyze user access patterns to detect suspicious behavior
 */
export const detectAccessAnomalies = async (userId, accessHistory, context = {}) => {
  if (!AI_ENABLED) {
    return { anomalies_detected: false, confidence: 0, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping access anomaly detection');
    return { anomalies_detected: false, confidence: 0, warning: 'circuit_breaker_open' };
  }

  try {
    const historyText = accessHistory
      .slice(0, 5)
      .map(log => `${log.timestamp} from ${log.ip} (${log.userAgent?.substring(0, 30)}...)`)
      .join('\n');

    if (!historyText) {
      const defaults = { anomalies_detected: false, confidence: 0, issues: [], recommendation: 'ALLOW', warning: 'insufficient_history' };
      void logAIAnalysis({
        userId,
        tenantId: context.tenantId,
        module: 'login',
        operation: 'detectAccessAnomalies',
        model: OLLAMA_MODEL,
        result: defaults,
        rawResponse: '',
        success: true,
        duration: 0
      }).catch(() => {});

      return { ...defaults, _alreadyLogged: true };
    }

    const prompt = `Analyze this user access history for suspicious patterns:

User: ${userId}
Recent Access (last 10):
${historyText}

Return ONLY valid JSON (no markdown):
{
  "anomalies_detected": true/false,
  "confidence": 0-100,
  "issues": ["list of detected issues"],
  "recommendation": "action to take"
}

Look for:
- Access at unusual hours (3am, etc.)
- Impossible geographic jumps (France to USA in 5 min)
- Too many rapid accesses
- Unusual devices/browsers
- Pattern changes`;

    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.1,
        options: {
          num_predict: 120
        }
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    const validation = validateAccessAnomalyResponse(responseText);

    if (validation.valid) circuitBreaker.recordSuccess(); else circuitBreaker.recordFailure();

    const aiLog = {
      userId,
      module: 'login',
      operation: 'detectAccessAnomalies',
      model: OLLAMA_MODEL,
      result: validation.data,
      rawResponse: responseText,
      success: validation.valid,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});

    if (validation.data.anomalies_detected && validation.data.confidence > (Number(process.env.AI_ANOMALY_CONFIDENCE_THRESHOLD) || 70)) {
      console.warn(`[AI] 🚨 Anomaly detected for user ${userId}:`, validation.data.issues);
    }

    return { response: responseText, validation };
  } catch (error) {
    console.error(`[AI] Access anomaly detection failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      userId,
      module: 'login',
      operation: 'detectAccessAnomalies',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { anomalies_detected: false, confidence: 0, error: error.message };
  }
};

/**
 * 2️⃣ CLASSIFY DOCUMENT SENSITIVITY
 * Automatically determine if document contains sensitive data
 */
export const classifyDocumentSensitivity = async (fileMetadata, sampleText) => {
  if (!AI_ENABLED) {
    return { classification: 'UNKNOWN', confidence: 0, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping document classification');
    return { classification: 'UNKNOWN', confidence: 0, warning: 'circuit_breaker_open', response: null };
  }

  try {
    const text = sampleText ? sampleText.substring(0, 256) : 'N/A';

    const prompt = `Classify this document sensitivity.
Return only JSON with keys: classification, confidence, detected_pii, pii_risk, reasoning.
Allowed classification: PUBLIC, INTERNAL, CONFIDENTIAL, TOP_SECRET.

File: ${fileMetadata.filename}
Type: ${fileMetadata.mimetype}
Size: ${fileMetadata.size} bytes
Sample: ${text}`;

    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.1,
        options: {
          num_predict: 80
        }
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    const validation = validateClassificationResponse(responseText);

    if (validation.valid) circuitBreaker.recordSuccess(); else circuitBreaker.recordFailure();

    const aiLog = {
      fileMetadata,
      module: 'upload',
      operation: 'classifyDocumentSensitivity',
      model: OLLAMA_MODEL,
      result: validation.data,
      rawResponse: responseText,
      success: validation.valid,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});

    return { response: responseText, validation };
  } catch (error) {
    console.error(`[AI] Document classification failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      fileMetadata,
      module: 'upload',
      operation: 'classifyDocumentSensitivity',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { classification: 'UNKNOWN', confidence: 0, error: error.message };
  }
};

/**
 * 3️⃣ ANALYZE MALWARE BEHAVIOR
 * Behavioral analysis of suspicious files
 */
export const analyzeMalwareBehavior = async (fileMetadata, virustotalResult) => {
  if (!AI_ENABLED) {
    return { is_malware: false, threat_level: 'SAFE', confidence: 0, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping malware behavior analysis');
    return { is_malware: false, threat_level: 'SAFE', confidence: 0, warning: 'circuit_breaker_open', response: null };
  }

  try {
    const detections = virustotalResult.detections || [];

    const prompt = `Analyze this file for behavioral malware risks:

Filename: ${fileMetadata.filename}
Size: ${fileMetadata.size} bytes
MIME Type: ${fileMetadata.mimetype}

VirusTotal Results:
- Detection count: ${detections.length}
- Detected engines: ${detections.slice(0, 5).join(', ')}

Return ONLY valid JSON (no markdown):
{
  "is_malware": true/false,
  "threat_level": "CRITICAL|HIGH|MEDIUM|LOW|SAFE",
  "behavior_score": 0-100,
  "detected_behaviors": ["list of behavioral indicators"],
  "recommendation": "BLOCK|QUARANTINE|ALLOW|ANALYZE"
}

Look for:
- Compression/obfuscation patterns
- Code injection signatures
- Ransomware characteristics
- Exploit kit markers
- Suspicious API calls`;

    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.1
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    const validation = validateMalwareBehaviorResponse(responseText);

    if (validation.valid) circuitBreaker.recordSuccess(); else circuitBreaker.recordFailure();

    const aiLog = {
      fileMetadata,
      module: 'upload',
      operation: 'analyzeMalwareBehavior',
      model: OLLAMA_MODEL,
      result: validation.data,
      rawResponse: responseText,
      success: validation.valid,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});

    if (validation.data.recommendation === 'BLOCK' || validation.data.threat_level === 'CRITICAL') {
      console.error(`[AI] 🚫 Malware blocked: ${fileMetadata.filename}`);
    }

    return { response: responseText, validation };
  } catch (error) {
    console.error(`[AI] Malware behavior analysis failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      fileMetadata,
      module: 'upload',
      operation: 'analyzeMalwareBehavior',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { is_malware: false, threat_level: 'SAFE', error: error.message };
  }
};

/**
 * 4️⃣ DETECT SUSPICIOUS SHARING
 * Identify abnormal file sharing patterns
 */
export const detectSuspiciousSharing = async (userId, shareActivity) => {
  if (!AI_ENABLED) {
    return { is_suspicious: false, confidence: 0, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping suspicious sharing detection');
    return { is_suspicious: false, risk_score: 0, warning: 'circuit_breaker_open' };
  }

  try {
    const recentSharesText = (shareActivity.recentShares || [])
      .slice(0, 5)
      .map(s => `File: ${s.filename} → ${s.recipient} (${s.classification})`)
      .join('\n');

    const prompt = `Analyze this sharing activity for suspicious patterns:

User: ${userId}
Last 24 hours:
- Total shares: ${shareActivity.totalShares}
- Unique files: ${shareActivity.uniqueFiles}
- External recipients: ${shareActivity.externalRecipients}
- Current hour: ${new Date().getHours()}h UTC

Recent shares:
${recentSharesText}

Return ONLY valid JSON (no markdown):
{
  "is_suspicious": true/false,
  "risk_score": 0-100,
  "concerns": ["list of concerns"],
  "action": "ALLOW|WARN|BLOCK|REQUIRE_APPROVAL"
}

Look for patterns:
- Sudden mass sharing
- Confidential → external recipients
- Unusual hours (3am, weekends)
- Abnormal combinations
- External sharing of internal docs`;

    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.25
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    const validation = validateSuspiciousSharingResponse(responseText);

    if (validation.valid) circuitBreaker.recordSuccess(); else circuitBreaker.recordFailure();

    const aiLog = {
      userId,
      module: 'sharing',
      operation: 'detectSuspiciousSharing',
      model: OLLAMA_MODEL,
      result: validation.data,
      rawResponse: responseText,
      success: validation.valid,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});

    if (validation.data.is_suspicious && (validation.data.risk_score || 0) > (Number(process.env.AI_SUSPICIOUS_SHARING_THRESHOLD) || 75)) {
      console.warn(`[AI] ⚠️ Suspicious sharing detected for user ${userId}`);
    }

    return { response: responseText, validation };
  } catch (error) {
    console.error(`[AI] Suspicious sharing detection failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      userId,
      module: 'sharing',
      operation: 'detectSuspiciousSharing',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { is_suspicious: false, confidence: 0, error: error.message };
  }
};

/**
 * 5️⃣ GENERATE SECURITY RECOMMENDATIONS
 * AI-powered security recommendations per user
 */
export const generateSecurityRecommendations = async (userId, userProfile) => {
  if (!AI_ENABLED) {
    return { recommendations: [], security_score: 0, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping security recommendations');
    return { recommendations: [], security_score: 0, warning: 'circuit_breaker_open' };
  }

  try {
    const incidentsText = (userProfile.incidents || [])
      .map(i => `- ${i.type}: ${i.description}`)
      .join('\n');

    const prompt = `Generate personalized security recommendations for this user:

User Profile:
- Role: ${userProfile.role}
- Days active: ${userProfile.daysActive}
- Activity level: ${userProfile.activityLevel}
- Department: ${userProfile.department}

Incidents:
${incidentsText || 'None'}

Data accessed:
- Files: ${userProfile.filesAccessed}
- Shares: ${userProfile.sharesCreated}
- Max sensitivity: ${userProfile.maxSensitivity}

Return ONLY valid JSON (no markdown):
{
  "recommendations": [
    {
      "title": "short title",
      "description": "detail",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "implementation": "how to implement"
    }
  ],
  "security_score": 0-100,
  "summary": "overall assessment"
}

Provide 3-5 recommendations based on role and activity.`;

    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.1,
        options: {
          num_predict: 120
        }
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch?.[0] || '{}');

    circuitBreaker.recordSuccess();
    const aiLog = {
      userId,
      module: 'login',
      operation: 'generateSecurityRecommendations',
      model: OLLAMA_MODEL,
      result,
      rawResponse: responseText,
      success: true,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});

    return { response: responseText, ...result };
  } catch (error) {
    console.error(`[AI] Security recommendations failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      userId,
      module: 'login',
      operation: 'generateSecurityRecommendations',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { recommendations: [], security_score: 0, error: error.message };
  }
};

/**
 * Generic prompt execution (for custom AI tasks)
 */
export const executePrompt = async (prompt, temperature = 0.3) => {
  if (!AI_ENABLED) {
    return { response: null, warning: 'AI disabled' };
  }

  if (!circuitBreaker.canExecute()) {
    console.warn('[AI] Circuit breaker OPEN - skipping prompt execution');
    return { response: null, warning: 'circuit_breaker_open' };
  }

  try {
    const response = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: temperature
      },
      { timeout: OLLAMA_TIMEOUT_MS }
    );
    const responseText = response.data?.response || '';
    circuitBreaker.recordSuccess();
    const aiLog = {
      module: 'generic',
      operation: 'executePrompt',
      model: OLLAMA_MODEL,
      rawResponse: responseText,
      success: true,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { response: responseText };
  } catch (error) {
    console.error(`[AI] Prompt execution failed: ${error.message}`);
    circuitBreaker.recordFailure();
    const aiLog = {
      module: 'generic',
      operation: 'executePrompt',
      model: OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
    return { response: null, error: error.message };
  }
};

export default {
  isOllamaHealthy,
  detectAccessAnomalies,
  classifyDocumentSensitivity,
  analyzeMalwareBehavior,
  detectSuspiciousSharing,
  generateSecurityRecommendations,
  executePrompt
};
