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

const pass = getVar('ADMIN_PASSWORD');
const key = getVar('ADMIN_SECRET_KEY') || pass;
const sess = getVar('ADMIN_SESSION_SECRET') || key;

if (pass) {
  execSync('npx wrangler secret put ADMIN_PASSWORD --name cinephile --config wrangler.production.toml', {
    input: pass,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log('✅ ADMIN_PASSWORD bound securely to cinephile worker');
}

if (key) {
  execSync('npx wrangler secret put ADMIN_SECRET_KEY --name cinephile --config wrangler.production.toml', {
    input: key,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log('✅ ADMIN_SECRET_KEY bound securely to cinephile worker');
}

if (sess) {
  execSync('npx wrangler secret put ADMIN_SESSION_SECRET --name cinephile --config wrangler.production.toml', {
    input: sess,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log('✅ ADMIN_SESSION_SECRET bound securely to cinephile worker');
}
