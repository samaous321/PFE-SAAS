import http from 'http';

(async () => {
  // Configure mock server and environment before importing the AI service
  process.env.OLLAMA_HOST = 'http://localhost:17777';
  process.env.OLLAMA_MODEL = 'mock-model:0.1';
  process.env.AI_ENABLED = 'true';
  process.env.OLLAMA_TIMEOUT_MS = '5000';

  // Start mock Ollama server
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/generate') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) { /* ignore */ }

    const prompt = String(payload.prompt || '');

    let responseObj = {};
    if (prompt.includes('Classify this document sensitivity') || /Classify this document sensitivity/i.test(prompt)) {
      responseObj = {
        classification: 'CONFIDENTIAL',
        confidence: 87,
        detected_pii: ['EMAIL', 'PHONE_NUMBER'],
        pii_risk: 'HIGH',
        reasoning: 'Found multiple email patterns and phone-like numbers.'
      };
    } else if (prompt.includes('Analyze this user access history') || /Analyze this user access history/i.test(prompt)) {
      responseObj = {
        anomalies_detected: true,
        confidence: 82,
        issues: ['Impossible travel: EU -> US in 3 minutes'],
        recommendation: 'require_2fa'
      };
    } else if (prompt.includes('Analyze this file for behavioral malware risks') || /behavioral malware/i.test(prompt)) {
      responseObj = {
        is_malware: true,
        threat_level: 'HIGH',
        behavior_score: 92,
        detected_behaviors: ['suspicious persistence', 'process injection'],
        recommendation: 'QUARANTINE'
      };
    } else if (prompt.includes('Analyze this sharing activity') || /sharing activity/i.test(prompt)) {
      responseObj = {
        is_suspicious: true,
        risk_score: 88,
        concerns: ['Mass external sharing', 'Confidential docs to public links'],
        action: 'REQUIRE_APPROVAL'
      };
    } else {
      // Fallback: return malformed text sometimes to test validator robustness
      const fallback = Math.random() > 0.5 ? JSON.stringify({ ok: true }) : 'garbage response not json';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: fallback }));
      return;
    }

    // Always wrap JSON as text in `response` field (matching Ollama-like output)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ response: JSON.stringify(responseObj) }));
  });

  server.listen(17777, '127.0.0.1', async () => {
    console.log('[AI-HARNESS] Mock Ollama listening on http://127.0.0.1:17777');

    // Import the service after env is configured
    const ai = await import('../services/ai-ollama.service.js');

    try {
      console.log('\n[AI-HARNESS] Running classifyDocumentSensitivity test...');
      const classify = await ai.classifyDocumentSensitivity({ filename: 'test.txt', mimetype: 'text/plain', size: 123 }, 'this is a sample text');
      console.log('classifyDocumentSensitivity ->', classify);

      console.log('\n[AI-HARNESS] Running detectAccessAnomalies test...');
      const anomalies = await ai.detectAccessAnomalies('user-123', [
        { timestamp: new Date().toISOString(), ip: '1.2.3.4', userAgent: 'UA' },
      ]);
      console.log('detectAccessAnomalies ->', anomalies);

      console.log('\n[AI-HARNESS] Running analyzeMalwareBehavior test...');
      const malware = await ai.analyzeMalwareBehavior({ filename: 'evil.exe', mimetype: 'application/octet-stream', size: 2048 }, { detections: ['engine1', 'engine2'] });
      console.log('analyzeMalwareBehavior ->', malware);

      console.log('\n[AI-HARNESS] Running detectSuspiciousSharing test...');
      const sharing = await ai.detectSuspiciousSharing('user-123', { totalShares: 5, uniqueFiles: 3, externalRecipients: 2, recentShares: [{ filename: 'secret.pdf', recipient: 'public', classification: 'CONFIDENTIAL' }] });
      console.log('detectSuspiciousSharing ->', sharing);

    } catch (err) {
      console.error('[AI-HARNESS] Error during tests:', err.message);
    } finally {
      server.close(() => {
        console.log('[AI-HARNESS] Mock server stopped');
        process.exit(0);
      });
    }
  });

})();
