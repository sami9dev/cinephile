import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Safely resolves an environment variable or secret.
 * 1. Checks process.env first (Node.js / Vercel / local development) for immediate O(1) resolution without exception overhead.
 * 2. If running inside Cloudflare Workers (via OpenNext), resolves bound secrets from getCloudflareContext().env.
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  const nodeVal = process.env[key];
  if (nodeVal !== undefined && nodeVal !== null && nodeVal !== '') {
    return String(nodeVal).trim();
  }

  try {
    const cf = getCloudflareContext();
    if (cf && cf.env && (cf.env as any)[key] !== undefined && (cf.env as any)[key] !== '') {
      return String((cf.env as any)[key]).trim();
    }
  } catch {
    // Expected outside Cloudflare request context (Vercel, local Node, etc.)
  }

  return nodeVal !== undefined && nodeVal !== null ? String(nodeVal).trim() : defaultValue;
}
