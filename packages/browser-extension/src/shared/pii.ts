/**
 * On-device PII masker.
 *
 * Kept identical in behaviour to @think-prompt/core/src/pii.ts but duplicated
 * here because the browser extension service worker cannot directly import
 * the node-targeted core package (better-sqlite3 binding, pino, etc.).
 *
 * TODO: extract core/pii into a zero-dep @think-prompt/pii package and bundle
 * it in both places.
 */

export interface PiiMaskResult {
  masked: string;
  hits: Record<string, number>;
}

const PATTERNS: Array<{ kind: string; re: RegExp; token: string }> = [
  { kind: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, token: '<ANTHROPIC_KEY>' },
  { kind: 'openai_key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, token: '<OPENAI_KEY>' },
  { kind: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, token: '<EMAIL>' },
  { kind: 'rrn', re: /\b\d{6}-?[1-4]\d{6}\b/g, token: '<RRN>' },
  { kind: 'credit_card', re: /\b(?:\d[ -]?){13,19}\b/g, token: '<CARD>' },
  { kind: 'phone_kr', re: /\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b/g, token: '<PHONE>' },
  { kind: 'aws_akid', re: /\bAKIA[0-9A-Z]{16}\b/g, token: '<AWS_KEY>' },
  { kind: 'aws_asia', re: /\bASIA[0-9A-Z]{16}\b/g, token: '<AWS_KEY>' },
  { kind: 'github_token', re: /\bghp_[A-Za-z0-9]{36}\b/g, token: '<GITHUB_TOKEN>' },
  { kind: 'github_token_fine', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, token: '<GITHUB_TOKEN>' },
  {
    kind: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    token: '<JWT>',
  },
  {
    kind: 'ipv4',
    re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
    token: '<IP>',
  },
];

export function maskPii(input: string): PiiMaskResult {
  let out = input;
  const hits: Record<string, number> = {};
  for (const { kind, re, token } of PATTERNS) {
    re.lastIndex = 0;
    const matches = out.match(re);
    if (matches && matches.length > 0) {
      hits[kind] = (hits[kind] ?? 0) + matches.length;
      out = out.replace(re, token);
    }
  }
  return { masked: out, hits };
}
