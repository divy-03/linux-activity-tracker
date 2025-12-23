import { processScanner } from './src/system/processScanner';
import { processKiller } from './src/system/processKiller';
import { processManager } from './src/services/processManager';
import { loadConfig } from './src/utils/config';
import { dbClient } from './src/db/client';

console.log('🧪 Testing Process Killer (DRY RUN)...\n');

loadConfig();
dbClient.init();

// Get killable processes
console.log('1. Getting killable processes...');
const killable = processScanner.getKillableProcesses();
console.log(`✅ Found ${killable.length} killable processes\n`);

if (killable.length > 0) {
  // Dry run
  console.log('2. Dry run (what would be killed)...');
  const dryRun = processManager.getDryRun(3);
  console.log(`✅ Would kill ${dryRun.targets.length} processes:`);
  dryRun.targets.forEach(p => {
    console.log(`   - ${p.command} (PID ${p.pid}): ${p.memory_mb}MB`);
  });
  console.log(`   Estimated memory freed: ${dryRun.estimated_memory_mb}MB\n`);
}

// Stats
console.log('3. Getting killed process stats...');
const stats = processManager.getKilledProcessStats();
console.log('✅ Kill Statistics:', stats);
console.log();

console.log('🎉 Test complete! No processes were harmed.\n');
console.log('⚠️  To enable auto-kill, set "enableAutoKill": true in config.json\n');

dbClient.close();
