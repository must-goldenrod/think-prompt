import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { getPaths } from './paths.js';

export const ConfigSchema = z.object({
  version: z.number().default(1),
  agent: z
    .object({
      port: z.number().default(47823),
      max_prompt_bytes: z.number().default(262144),
      coach_mode: z.boolean().default(false),
      fail_open: z.boolean().default(true),
    })
    .default({}),
  dashboard: z
    .object({
      port: z.number().default(47824),
      open_on_start: z.boolean().default(false),
    })
    .default({}),
  privacy: z
    .object({
      store_original: z.boolean().default(true),
      pii_mask: z.boolean().default(true),
      retention_days: z.number().default(90),
      sync_to_server: z.boolean().default(false),
    })
    .default({}),
  llm: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(['anthropic']).default('anthropic'),
      model: z.string().default('claude-haiku-4-5'),
      api_key_env: z.string().default('ANTHROPIC_API_KEY'),
      judge_threshold_score: z.number().default(60),
      max_monthly_tokens: z.number().default(500000),
    })
    .default({}),
  rules: z
    .object({
      enabled_set: z.string().default('default'),
      custom_disabled: z.array(z.string()).default([]),
    })
    .default({}),
  i18n: z.enum(['ko', 'en']).default('ko'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

export function loadConfig(rootOverride?: string): Config {
  const paths = getPaths(rootOverride);
  if (!existsSync(paths.configFile)) {
    const cfg = defaultConfig();
    saveConfig(cfg, rootOverride);
    return cfg;
  }
  const raw = JSON.parse(readFileSync(paths.configFile, 'utf8'));
  return ConfigSchema.parse(raw);
}

export function saveConfig(cfg: Config, rootOverride?: string): void {
  const paths = getPaths(rootOverride);
  mkdirSync(dirname(paths.configFile), { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/**
 * Apply a deep key path update to a config (in-memory). Accepts e.g. "agent.coach_mode", true.
 * Returns the validated new config.
 */
export function setConfigValue(cfg: Config, key: string, value: unknown): Config {
  const parts = key.split('.');
  const obj: any = structuredClone(cfg);
  let node: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (node[p] == null || typeof node[p] !== 'object') node[p] = {};
    node = node[p];
  }
  node[parts.at(-1)!] = value;
  return ConfigSchema.parse(obj);
}
