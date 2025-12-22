import { processScanner } from './src/system/processScanner';
import { loadConfig } from './src/utils/config';

console.log('🧪 Testing Process Scanner...\n');

loadConfig();

// Test 1: Get all user processes
console.log('Test 1: Getting all user processes...');
const allProcesses = processScanner.getUserProcesses();
console.log(`✅ Found ${allProcesses.length} processes`);
console.log('\nTop 5 by memory:');
allProcesses.slice(0, 5).forEach(p => {
  console.log(`   PID ${p.pid}: ${p.command} - ${p.memory_mb}MB (${p.memory_percent}%)`);
});
console.log();

// Test 2: Get killable processes
console.log('Test 2: Getting killable processes...');
const killable = processScanner.getKillableProcesses();
console.log(`✅ Found ${killable.length} killable processes`);
console.log(`   Protected: ${allProcesses.length - killable.length} processes`);
console.log('\nTop 5 killable by memory:');
killable.slice(0, 5).forEach(p => {
  console.log(`   PID ${p.pid}: ${p.command} - ${p.memory_mb}MB (${p.memory_percent}%)`);
});
console.log();

// Test 3: Get top memory consumers
console.log('Test 3: Getting top 3 memory consumers...');
const top = processScanner.getTopMemoryConsumers(3);
console.log(`✅ Found ${top.length} top consumers`);
top.forEach((p, i) => {
  console.log(`   ${i + 1}. ${p.command} (PID ${p.pid}): ${p.memory_mb}MB`);
});
console.log();

// Test 4: Get process statistics
console.log('Test 4: Getting process statistics...');
const stats = processScanner.getStats();
console.log('✅ Process Stats:');
console.log(`   Total processes: ${stats.total_processes}`);
console.log(`   Killable: ${stats.killable_processes}`);
console.log(`   Protected: ${stats.protected_processes}`);
console.log(`   Total memory: ${stats.total_memory_mb}MB`);
console.log(`   Killable memory: ${stats.killable_memory_mb}MB`);
console.log(`   User: ${stats.user}`);
console.log();

// Test 5: Validate a process
if (killable.length > 0) {
  console.log('Test 5: Validating a killable process...');
  const testPid = killable[0].pid;
  const validation = processScanner.validateProcess(testPid);
  console.log(`✅ PID ${testPid} validation:`, validation);
  console.log();
}

// Test 6: Try to validate current process (should fail)
console.log('Test 6: Validating current process (should fail)...');
const currentValidation = processScanner.validateProcess(process.pid);
console.log(`✅ Current PID ${process.pid} validation:`, currentValidation);
console.log();

console.log('🎉 All process scanner tests complete!\n');
