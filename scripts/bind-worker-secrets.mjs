import fs from 'fs';
import { execSync } from 'child_process';

const envPath = '.env.local';
if (!fs.existsSync(envPath)) {
  console.error('.env.local not found');
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');

function getVar(k) {
  const m = content.match(new RegExp(`^${k}\\s*=\\s*([^\\r\\n]+)`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function bindSecret(name, value) {
  if (!value) return;
  try {
    execSync(`npx wrangler secret put ${name} --name cinephile --config wrangler.production.toml`, {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.log(`✅ ${name} bound securely to cinephile worker`);
  } catch (e) {
    console.warn(`ℹ️ ${name} could not be bound (may already exist in vars): ${e.message}`);
  }
}

const supabaseServiceKey = getVar('SUPABASE_SERVICE_ROLE_KEY');
if (supabaseServiceKey) bindSecret('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceKey);

const pass = getVar('ADMIN_PASSWORD');
if (pass) bindSecret('ADMIN_PASSWORD', pass);

const key = getVar('ADMIN_SECRET_KEY') || pass;
if (key) bindSecret('ADMIN_SECRET_KEY', key);

const sess = getVar('ADMIN_SESSION_SECRET') || key;
if (sess) bindSecret('ADMIN_SESSION_SECRET', sess);
