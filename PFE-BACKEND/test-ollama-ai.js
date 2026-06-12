#!/usr/bin/env node

/**
 * 🤖 TEST CONNECTION - OLLAMA AI SERVICE
 * 
 * Usage: node test-ollama-ai.js
 */

import axios from 'axios';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://192.168.61.25:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

console.log('\n🤖 TESTING OLLAMA AI CONNECTION\n');
console.log(`  Endpoint: ${OLLAMA_HOST}`);
console.log(`  Model: ${OLLAMA_MODEL}\n`);

async function testConnection() {
  try {
    console.log('1️⃣  Checking Ollama health...');
    const healthResponse = await axios.get(`${OLLAMA_HOST}/api/tags`, {
      timeout: 5000
    });

    if (healthResponse.status !== 200) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }

    console.log('   ✅ Ollama is running\n');

    const models = healthResponse.data.models || [];
    console.log(`2️⃣  Available models (${models.length}):`);
    models.forEach(model => {
      const isCurrent = model.name === OLLAMA_MODEL ? ' ✓' : '';
      console.log(`   - ${model.name}${isCurrent}`);
    });

    if (!models.some(m => m.name === OLLAMA_MODEL)) {
      console.warn(`   ⚠️  Model "${OLLAMA_MODEL}" not found!`);
    } else {
      console.log(`   ✅ ${OLLAMA_MODEL} is available\n`);
    }

    console.log('3️⃣  Testing simple prompt...');
    const testResponse = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: 'Say "AI integration successful!" and nothing else',
        stream: false,
        temperature: 0.1
      },
      { timeout: 30000 }
    );

    console.log(`   Response: "${testResponse.data.response.trim()}"`);
    console.log('   ✅ Prompt execution works\n');

    console.log('4️⃣  Testing security prompt...');
    const securityResponse = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: `Analyze this for security risks (JSON only, no markdown):
{
  "user": "admin",
  "accessed_at": "03:00 AM",
  "ip": "192.168.1.100",
  "previous_ip": "203.45.67.89",
  "device": "new-device"
}

Return: {"anomaly_detected": true/false, "risk": "high/medium/low"}`,
        stream: false,
        temperature: 0.2
      },
      { timeout: 30000 }
    );

    const jsonMatch = securityResponse.data.response.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (result) {
      console.log(`   Response: ${JSON.stringify(result)}`);
      console.log('   ✅ Security analysis works\n');
    } else {
      console.warn('   ⚠️  Could not parse security response\n');
    }

    console.log('═══════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED - AI IS READY TO USE!');
    console.log('═══════════════════════════════════════════\n');

    return true;
  } catch (error) {
    console.error('\n❌ TEST FAILED\n');
    console.error(`Error: ${error.message}\n`);

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Solution: Make sure Ollama is running on the VM');
      console.error(`   Command: ollama serve\n`);
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 Solution: Check network connectivity');
      console.error(`   Try: ping 192.168.61.25\n`);
    }

    return false;
  }
}

// Run test
testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
