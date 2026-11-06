import fs from 'fs';
import path from 'path';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function logPass(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function logFail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function logWarn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function logInfo(msg) { console.log(`  ${CYAN}ℹ${RESET} ${msg}`); }

console.log(`\n${BOLD}================================================================${RESET}`);
console.log(`${BOLD}             CINEPHILE ECOSYSTEM HEALTH DOCTOR                ${RESET}`);
console.log(`${BOLD}================================================================${RESET}\n`);

const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  logFail('.env.local file is MISSING!');
  process.exit(1);
}

const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
});

let errors = 0;
let warnings = 0;

// 1. ENVIRONMENT VARIABLES INTEGRITY
console.log(`${BOLD}[1/5] Environment Configuration Integrity${RESET}`);
const requiredVars = [
  'NEXT_PUBLIC_SITE_URL',
  'ADMIN_SECRET_KEY',
  'ADMIN_PASSWORD',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'TMDB_API_KEY',
  'TELEGRAM_BOT_TOKEN'
];

requiredVars.forEach(v => {
  if (!env[v] || env[v].includes('REPLACE')) {
    logFail(`Missing or placeholder key: ${v}`);
    errors++;
  } else {
    logPass(`Key present & set: ${v}`);
  }
});

// 2. UPSTASH REDIS CONNECTIVITY & DATA
console.log(`\n${BOLD}[2/5] Upstash Redis Cache Layer${RESET}`);
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const t0 = Date.now();
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    const pong = await res.json();
    const ms = Date.now() - t0;
    if (pong?.result === 'PONG') {
      logPass(`Redis ping succeeded (${ms}ms)`);
      const hlenRes = await fetch(`${env.UPSTASH_REDIS_REST_URL}/hlen/cinefuel:curated_links`, {
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
      });
      const hlen = await hlenRes.json();
      logPass(`Curated links in Redis hash: ${hlen.result} titles`);
    } else {
      logFail(`Redis response unexpected: ${JSON.stringify(pong)}`);
      errors++;
    }
  } catch (err) {
    logFail(`Redis connection failed: ${err.message}`);
    errors++;
  }
}

// 3. SUPABASE POSTGRESQL CONNECTIVITY & SCHEMAS
console.log(`\n${BOLD}[3/5] Supabase PostgreSQL Database Layer${RESET}`);
if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const t0 = Date.now();
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/links?select=id,movie_id,title&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    const ms = Date.now() - t0;
    if (res.ok) {
      logPass(`Supabase service_role connection succeeded (${ms}ms)`);
      logPass(`Table 'links' is online and readable`);
    } else {
      logFail(`Supabase returned HTTP ${res.status}: ${res.statusText}`);
      errors++;
    }
  } catch (err) {
    logFail(`Supabase connection failed: ${err.message}`);
    errors++;
  }
}

// 4. TELEGRAM BOT API AUTHENTICATION
console.log(`\n${BOLD}[4/5] Telegram Bot Ecosystem${RESET}`);
if (env.TELEGRAM_BOT_TOKEN) {
  try {
    const t0 = Date.now();
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await res.json();
    const ms = Date.now() - t0;
    if (data?.ok) {
      logPass(`Telegram bot verified as @${data.result.username} (${ms}ms)`);
    } else {
      logFail(`Telegram bot authentication failed: ${data?.description}`);
      errors++;
    }
  } catch (err) {
    logWarn(`Telegram connection check skipped (network/ISP): ${err.message}`);
    warnings++;
  }
}

// 5. LOCAL CACHE & CLOUDFLARE CONFIG SYNC
console.log(`\n${BOLD}[5/5] Cloudflare Edge & Local Storage Sync${RESET}`);
const serverLinksPath = path.resolve(process.cwd(), 'src/data/serverLinks.json');
if (fs.existsSync(serverLinksPath)) {
  try {
    const json = JSON.parse(fs.readFileSync(serverLinksPath, 'utf8'));
    const count = Object.keys(json).length;
    if (count > 0) {
      logPass(`Local serverLinks.json backup is valid (${count} titles cached)`);
    } else {
      logWarn(`Local serverLinks.json is empty`);
      warnings++;
    }
  } catch {
    logFail(`Local serverLinks.json is malformed JSON`);
    errors++;
  }
}

// Check Wrangler configs
['wrangler.toml', 'wrangler.production.toml', 'wrangler.staging.toml'].forEach(cfg => {
  const p = path.resolve(process.cwd(), cfg);
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    if (content.includes(env.NEXT_PUBLIC_SUPABASE_URL)) {
      logPass(`${cfg} is synchronized with active Supabase URL`);
    } else {
      logFail(`${cfg} Supabase URL mismatch!`);
      errors++;
    }
  }
});

console.log(`\n${BOLD}================================================================${RESET}`);
if (errors === 0) {
  console.log(`${GREEN}${BOLD}✓ ECOSYSTEM HEALTHY: Zero critical errors detected!${RESET}`);
  if (warnings > 0) {
    console.log(`${YELLOW}  ${warnings} non-critical warning(s) noted above.${RESET}`);
  }
} else {
  console.log(`${RED}${BOLD}✗ ECOSYSTEM UNHEALTHY: ${errors} error(s) must be resolved.${RESET}`);
}
console.log(`${BOLD}================================================================${RESET}\n`);

process.exit(errors > 0 ? 1 : 0);
