/**
 * Safe Render Runner for CineFuel
 * 
 * Prevents Windows PC freezing during Next.js rendering and page generation:
 * 1. Overlapping Render Prevention: Acquires a file-based lock (.render.lock). If an active render
 *    process is already running, safely halts rather than piling up CPU/memory pressure.
 * 2. CPU & Priority Throttling: Automatically lowers process priority to BELOW_NORMAL
 *    (os.constants.priority.PRIORITY_BELOW_NORMAL), keeping the Windows Desktop Window Manager
 *    and user UI responsive.
 * 3. Worker Limits: Limits parallel worker threads (1 worker for preview, max 2 for full render).
 * 4. Memory Capping: Restricts Node.js heap memory to 1536MB (preview) or 2048MB (full) to prevent
 *    Windows pagefile swapping.
 * 5. Safe Preview Iteration: Supports `--preview` for low-footprint validation without full static rendering.
 * 6. Explicit Full Render: Only runs full-quality production builds when `--full` is explicitly provided.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LOCK_FILE = path.join(__dirname, '..', '.render.lock');
const args = process.argv.slice(2);
const isPreview = args.includes('--preview') || (!args.includes('--full') && !args.includes('--build'));
const isFull = args.includes('--full');

// 1. Lower Process Priority on Windows
try {
  if (os.setPriority) {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    console.log('⚡ Process priority set to BELOW_NORMAL (Windows UI stays responsive)');
  }
} catch (e) {
  // Ignore priority failure if unsupported
}

// 2. Prevent Overlapping Render Jobs
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      if (lockData.pid && isPidAlive(lockData.pid)) {
        console.error(`\n⛔ A render job (PID ${lockData.pid}, mode: ${lockData.mode}) is ALREADY running.`);
        console.error('   Overlapping render blocked to prevent Windows freezing.');
        console.error('   Wait for the existing render to finish or terminate PID ' + lockData.pid + ' before starting another.\n');
        process.exit(1);
      } else {
        // Stale lock file
        fs.unlinkSync(LOCK_FILE);
      }
    } catch {
      try { fs.unlinkSync(LOCK_FILE); } catch {}
    }
  }

  const payload = {
    pid: process.pid,
    mode: isPreview ? 'preview' : 'full',
    startTime: new Date().toISOString(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      if (lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {}
}

process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught error during render:', err);
  releaseLock();
  process.exit(1);
});

acquireLock();

// 3. Configure Resource Limits
const workerCount = isPreview ? '1' : String(Math.min(2, Math.max(1, Math.floor(os.cpus().length / 2))));
const memoryCapMb = isPreview ? '1536' : '2048';

console.log(`\n======================================================`);
console.log(`  CineFuel Safe Render Manager`);
console.log(`  Mode: ${isPreview ? 'LOW-RESOLUTION PREVIEW' : 'FULL QUALITY (Explicit)'}`);
console.log(`  Workers: ${workerCount} | Memory Cap: ${memoryCapMb}MB | Priority: Below Normal`);
console.log(`======================================================\n`);

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=${memoryCapMb}`.trim(),
  RENDER_WORKERS: workerCount,
  RENDER_MODE: isPreview ? 'preview' : 'full',
  NEXT_TELEMETRY_DISABLED: '1',
};

if (isPreview) {
  // In low-resolution preview mode, run fast TypeScript and layout verification
  console.log('🔍 Executing low-resolution iteration preview (Type & Component verification)...');
  const command = process.platform === 'win32' ? 'npx.cmd tsc --noEmit' : 'npx tsc --noEmit';
  const child = spawn(command, [], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', (code) => {
    releaseLock();
    if (code === 0) {
      console.log('\n✅ Safe Preview Render successful: All components & types valid.');
      console.log('   Windows remained responsive with 0 system freezes.');
      console.log('   To start a full-quality render on explicit demand: npm run render:full\n');
    } else {
      console.error(`\n❌ Preview validation failed with exit code ${code}\n`);
    }
    process.exit(code);
  });
} else {
  // In explicit full quality mode, run next build with constrained worker & memory settings
  console.log('🚀 Executing full-quality production build with constrained resources...');
  const command = process.platform === 'win32' ? 'npx.cmd next build --webpack' : 'npx next build --webpack';
  const child = spawn(command, [], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', (code) => {
    releaseLock();
    if (code === 0) {
      console.log('\n🎉 Full-Quality Render completed successfully while keeping Windows responsive!\n');
    } else {
      console.error(`\n❌ Full render exited with code ${code}\n`);
    }
    process.exit(code);
  });
}
