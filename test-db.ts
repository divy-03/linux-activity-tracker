import { dbClient } from './src/db/client';
import { loadConfig } from './src/utils/config';
import { logger } from './src/utils/logger';

// Load config and initialize DB
loadConfig();
dbClient.init();

console.log('🧪 Testing Database Operations...\n');

// Test 1: Insert command
console.log('1. Inserting test command...');
const cmdId = dbClient.insertCommand({
  cmd: 'ls -la',
  cwd: '/home/user',
  user: process.env.USER || 'test',
  exit_code: 0,
  duration_ms: 150
});
console.log(`✅ Command inserted with ID: ${cmdId}\n`);

// Test 2: Insert system stat
console.log('2. Inserting test system stat...');
const statId = dbClient.insertSystemStat({
  ram_total_mb: 16384,
  ram_used_mb: 8192,
  ram_available_mb: 8192,
  ram_percent: 50.0,
  swap_total_mb: 4096,
  swap_used_mb: 0
});
console.log(`✅ System stat inserted with ID: ${statId}\n`);

// Test 3: Insert killed process
console.log('3. Inserting test killed process...');
const procId = dbClient.insertKilledProcess({
  pid: 12345,
  name: 'chrome',
  memory_mb: 1024.5,
  signal: 'SIGTERM',
  reason: 'High RAM usage > 90%',
  success: 1
});
console.log(`✅ Killed process inserted with ID: ${procId}\n`);

// Test 4: Insert event
console.log('4. Inserting test event...');
const eventId = dbClient.insertEvent({
  type: 'ram_monitor',
  severity: 'warning',
  message: 'RAM usage exceeded threshold',
  metadata: JSON.stringify({ threshold: 90, current: 92 })
});
console.log(`✅ Event inserted with ID: ${eventId}\n`);

// Test 5: Query recent commands
console.log('5. Querying recent commands...');
const commands = dbClient.getRecentCommands(5);
console.log(`✅ Found ${commands.length} commands`);
console.log(commands);
console.log();

// Test 6: Query latest stats
console.log('6. Querying latest system stats...');
const stats = dbClient.getLatestSystemStats(5);
console.log(`✅ Found ${stats.length} stats`);
console.log(stats);
console.log();

// Test 7: Query events
console.log('7. Querying events...');
const events = dbClient.getEvents();
console.log(`✅ Found ${events.length} events`);
console.log(events);
console.log();

console.log('🎉 All database tests passed!\n');

dbClient.close();
