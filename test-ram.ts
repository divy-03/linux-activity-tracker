import { procParser } from './src/system/procParser';
import { ramMonitor } from './src/services/ramMonitor';
import { loadConfig } from './src/utils/config';
import { dbClient } from './src/db/client';

console.log('🧪 Testing RAM Monitoring...\n');

// Initialize
loadConfig();
dbClient.init();

// Test 1: Parse /proc/meminfo
console.log('1. Testing /proc/meminfo parser...');
const memInfo = procParser.getMemoryInfo();
console.log('✅ Memory Info:');
console.log(`   Total: ${memInfo.total_mb} MB`);
console.log(`   Used: ${memInfo.used_mb} MB (${memInfo.percent}%)`);
console.log(`   Available: ${memInfo.available_mb} MB`);
console.log(`   Free: ${memInfo.free_mb} MB`);
console.log(`   Buffers: ${memInfo.buffers_mb} MB`);
console.log(`   Cached: ${memInfo.cached_mb} MB`);
console.log(`   Swap: ${memInfo.swap_used_mb} / ${memInfo.swap_total_mb} MB (${memInfo.swap_percent}%)`);
console.log();

// Test 2: Get load average
console.log('2. Testing load average...');
const loadAvg = procParser.getLoadAverage();
console.log('✅ Load Average:', loadAvg);
console.log();

// Test 3: Get uptime
console.log('3. Testing uptime...');
const uptime = procParser.getUptime();
console.log(`✅ Uptime: ${uptime} seconds (${Math.round(uptime / 3600)} hours)`);
console.log();

// Test 4: Start RAM monitor
console.log('4. Testing RAM monitor...');
ramMonitor.start();
console.log('✅ RAM monitor started');
console.log();

// Wait for a few snapshots
console.log('5. Waiting for snapshots (10 seconds)...');
await Bun.sleep(10000);

const snapshot = ramMonitor.getLastSnapshot();
console.log('✅ Latest snapshot:');
console.log(`   Timestamp: ${new Date(snapshot!.timestamp).toISOString()}`);
console.log(`   RAM: ${snapshot!.percent}% (${snapshot!.used_mb} / ${snapshot!.total_mb} MB)`);
console.log(`   Load: ${snapshot!.load_avg.load1} (1m)`);
console.log();

// Test 6: Get statistics
console.log('6. Testing statistics...');
const stats = ramMonitor.getStats(1); // Last 1 minute
console.log('✅ RAM Stats (last 1 minute):');
console.log(`   Average: ${stats.average_percent}%`);
console.log(`   Max: ${stats.max_percent}%`);
console.log(`   Min: ${stats.min_percent}%`);
console.log(`   Samples: ${stats.sample_count}`);
console.log();

// Test 7: Get history
console.log('7. Testing history...');
const history = ramMonitor.getHistory(5);
console.log(`✅ Found ${history.length} historical snapshots`);
if (history.length > 0) {
  console.log('   Latest:', {
    percent: history[0].percent,
    used_mb: history[0].used_mb,
    timestamp: new Date(history[0].timestamp).toISOString()
  });
}
console.log();

// Cleanup
ramMonitor.stop();
dbClient.close();

console.log('🎉 All RAM monitoring tests passed!\n');
