/**
 * Minimal Anthropic client — no SDK dep, just fetch.
 * Supports message create with system prompt + cache_control.
 */

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicCreateArgs {
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
  cacheSystem?: boolean;
}

export interface AnthropicResponse {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  stop_reason?: string;
}

export async function anthropicMessage(args: AnthropicCreateArgs): Promise<AnthropicResponse> {
  const body: any = {
    model: args.model,
    max_tokens: args.maxTokens ?? 1024,
    system: args.cacheSystem
      ? [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }]
      : args.system,
    messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${msg.slice(0, 500)}`);
  }
  const data = (await res.json()) as any;
  const text =
    Array.isArray(data.content) && data.content[0] && typeof data.content[0].text === 'string'
      ? data.content.map((c: any) => c.text ?? '').join('')
      : '';
  return {
    text,
    usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
    stop_reason: data.stop_reason,
  };
}

export function parseStrictJson<T = unknown>(text: string): T | null {
  // Strip code fences if present
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    // Try to extract first {...} object
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
