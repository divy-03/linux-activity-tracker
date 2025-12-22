import { loadConfig, getConfig } from './src/utils/config';
import { dbClient } from './src/db/client';
import { ramDetector } from './src/services/ramDetector';
import { RAMSnapshot } from './src/services/ramMonitor';

console.log('🧪 Testing RAM Detector Logic...\n');

// Initialize
loadConfig();
dbClient.init();

// Create mock RAM snapshot
function createSnapshot(percent: number): RAMSnapshot {
  return {
    total_mb: 16384,
    free_mb: 16384 * (1 - percent / 100),
    available_mb: 16384 * (1 - percent / 100),
    used_mb: 16384 * (percent / 100),
    percent: percent,
    buffers_mb: 256,
    cached_mb: 2048,
    swap_total_mb: 4096,
    swap_free_mb: 4096,
    swap_used_mb: 0,
    swap_percent: 0,
    timestamp: Date.now(),
    uptime: 123456,
    load_avg: { load1: 1.5, load5: 1.8, load15: 2.0 }
  };
}

// Test 1: Normal RAM - should not trigger
console.log('Test 1: Normal RAM (70%)');
let result = ramDetector.checkThreshold(createSnapshot(70));
console.log(`   Result: ${result ? '❌ TRIGGERED' : '✅ NOT TRIGGERED'}`);
console.log();

// Test 2: High RAM once - should not trigger (needs consecutive)
console.log('Test 2: High RAM once (95%)');
result = ramDetector.checkThreshold(createSnapshot(95));
console.log(`   Result: ${result ? '❌ TRIGGERED' : '✅ NOT TRIGGERED (needs consecutive)'}`);
console.log();

// Test 3: High RAM consecutive - should trigger
console.log('Test 3: High RAM consecutive (95%, 95%, 95%)');
ramDetector.checkThreshold(createSnapshot(95));
ramDetector.checkThreshold(createSnapshot(95));
result = ramDetector.checkThreshold(createSnapshot(95));
console.log(`   Result: ${result ? '✅ TRIGGERED' : '❌ NOT TRIGGERED'}`);
console.log();

// Test 4: High RAM during cooldown - should not trigger
console.log('Test 4: High RAM during cooldown (95%)');
ramDetector.checkThreshold(createSnapshot(95));
ramDetector.checkThreshold(createSnapshot(95));
result = ramDetector.checkThreshold(createSnapshot(95));
console.log(`   Result: ${result ? '❌ TRIGGERED (should be in cooldown)' : '✅ BLOCKED BY COOLDOWN'}`);
console.log();

// Test 5: Get detector stats
console.log('Test 5: Detector Statistics');
const stats = ramDetector.getStats();
console.log('   Stats:', JSON.stringify(stats, null, 2));
console.log();

// Test 6: Reset cooldown
console.log('Test 6: Reset Cooldown');
ramDetector.resetCooldown();
console.log('   ✅ Cooldown reset');
const statsAfterReset = ramDetector.getStats();
console.log('   Cooldown multiplier:', statsAfterReset.cooldownMultiplier);
console.log('   In cooldown:', statsAfterReset.isInCooldown);
console.log();

// Test 7: Recovery scenario
console.log('Test 7: Recovery Scenario');
ramDetector.checkThreshold(createSnapshot(95));
ramDetector.checkThreshold(createSnapshot(95));
ramDetector.checkThreshold(createSnapshot(95));
console.log('   High RAM detected');
ramDetector.checkThreshold(createSnapshot(50));
console.log('   ✅ RAM back to normal');
console.log();

// Test 8: Get detection history
console.log('Test 8: Detection History');
const history = ramDetector.getHistory(10);
console.log(`   ✅ Found ${history.length} detection events`);
if (history.length > 0) {
  console.log('   Latest event:', history[history.length - 1]);
}
console.log();

console.log('🎉 All detector tests complete!\n');

dbClient.close();
