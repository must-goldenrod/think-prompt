import {
  AMBIGUOUS_PRONOUN_STARTS,
  CONTEXT_KEYWORDS,
  EXAMPLE_KEYWORDS,
  FORMAT_KEYWORDS,
  IMPERATIVE_KEYWORDS,
  INJECTION_PATTERNS,
  OUTPUT_CONSTRAINT_KEYWORDS,
  QUESTION_MARKERS,
  SUCCESS_CRITERIA_KEYWORDS,
  anyMatch,
} from './keywords.js';
import type { Rule } from './types.js';

// R001 — too short
export const r001: Rule = {
  id: 'R001',
  name: 'too_short',
  category: 'structure',
  description: 'Word count is extremely small, making intent hard to infer.',
  severity: 2,
  detect: ({ meta }) => {
    if (meta.wordCount >= 4) return null;
    return {
      severity: 2,
      message: '프롬프트가 너무 짧습니다. 목적·대상·기대 결과를 한 줄 더 추가해 보세요.',
      fixHint: 'expand_intent',
    };
  },
};

// R002 — no output format
export const r002: Rule = {
  id: 'R002',
  name: 'no_output_format',
  category: 'output',
  description: 'No hint about desired output format (JSON/table/bullets/etc).',
  severity: 3,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount < 4) return null; // covered by R001
    if (anyMatch(promptText, FORMAT_KEYWORDS)) return null;
    return {
      severity: 3,
      message: '출력 형식이 지정되지 않았습니다. JSON/bullet/길이 등을 명시하면 결과가 일관됩니다.',
      fixHint: 'add_output_format',
    };
  },
};

// R003 — no context
export const r003: Rule = {
  id: 'R003',
  name: 'no_context',
  category: 'context',
  description: 'No domain/project context and prompt is short.',
  severity: 3,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount >= 30) return null;
    if (anyMatch(promptText, CONTEXT_KEYWORDS)) return null;
    return {
      severity: 3,
      message: '대상 도메인·프로젝트 맥락이 빠졌습니다.',
      fixHint: 'add_context',
    };
  },
};

// R004 — multiple tasks
export const r004: Rule = {
  id: 'R004',
  name: 'multiple_tasks',
  category: 'structure',
  description: 'Multiple tasks joined with "and/그리고".',
  severity: 3,
  detect: ({ promptText }) => {
    const lower = promptText.toLowerCase();
    // Count "and"/"그리고"/"또한" joining verbs. Heuristic: 3+ occurrences = mixed.
    let count = 0;
    const res = [/\band\b/gi, /그리고/gu, /또한/gu, /,\s*또/gu, /\bplus\b/gi];
    for (const re of res) {
      const m = lower.match(re);
      if (m) count += m.length;
    }
    if (count < 3) return null;
    return {
      severity: 3,
      message: '여러 태스크가 섞여 있습니다. 하나씩 나누면 결과 품질이 올라갑니다.',
      evidence: `and/그리고 등 접속 ${count}회`,
      fixHint: 'split_tasks',
    };
  },
};

// R005 — injection attempt
export const r005: Rule = {
  id: 'R005',
  name: 'injection_attempt',
  category: 'safety',
  description: 'Prompt injection pattern detected.',
  severity: 5,
  detect: ({ promptText }) => {
    const m = anyMatch(promptText, INJECTION_PATTERNS);
    if (!m) return null;
    return {
      severity: 5,
      message: '프롬프트 인젝션 패턴이 감지됐습니다.',
      evidence: m.source,
      fixHint: 'remove_injection',
    };
  },
};

// R006 — no success criteria
export const r006: Rule = {
  id: 'R006',
  name: 'no_success_criteria',
  category: 'output',
  description: 'No explicit success/acceptance criteria.',
  severity: 2,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount < 20) return null; // skip for short prompts
    if (anyMatch(promptText, SUCCESS_CRITERIA_KEYWORDS)) return null;
    return {
      severity: 2,
      message: "무엇이 '좋은 결과'인지 기준이 없습니다. '성공 기준' 한 줄을 추가하세요.",
      fixHint: 'add_success_criteria',
    };
  },
};

// R007 — ambiguous pronoun
export const r007: Rule = {
  id: 'R007',
  name: 'ambiguous_pronoun',
  category: 'structure',
  description: 'Starts with a demonstrative/pronoun with no prior anchor.',
  severity: 2,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount >= 15) return null;
    const m = anyMatch(promptText, AMBIGUOUS_PRONOUN_STARTS);
    if (!m) return null;
    return {
      severity: 2,
      message: '대명사 지칭이 모호합니다. 무엇을 가리키는지 명시하세요.',
      evidence: m.source,
      fixHint: 'clarify_referent',
    };
  },
};

// R008 — no examples when complex
export const r008: Rule = {
  id: 'R008',
  name: 'no_examples_when_complex',
  category: 'style',
  description: 'Long prompt lacks concrete example.',
  severity: 1,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount <= 80) return null;
    if (anyMatch(promptText, EXAMPLE_KEYWORDS)) return null;
    return {
      severity: 1,
      message: '복잡한 요청이면 예시를 1개 포함하는 편이 좋습니다.',
      fixHint: 'add_example',
    };
  },
};

// R009 — imperative verb missing
export const r009: Rule = {
  id: 'R009',
  name: 'imperative_missing',
  category: 'structure',
  description: 'No clear imperative verb / request marker.',
  severity: 2,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount < 4) return null;
    if (anyMatch(promptText, IMPERATIVE_KEYWORDS)) return null;
    if (anyMatch(promptText, QUESTION_MARKERS)) return null; // a question is fine
    return {
      severity: 2,
      message: '무엇을 해달라는지 명확한 동사가 없습니다.',
      fixHint: 'add_imperative',
    };
  },
};

// R010 — no output constraint
export const r010: Rule = {
  id: 'R010',
  name: 'no_constraint',
  category: 'output',
  description: 'No output constraint (length/language/scope).',
  severity: 2,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount < 15) return null;
    if (anyMatch(promptText, OUTPUT_CONSTRAINT_KEYWORDS)) return null;
    return {
      severity: 2,
      message: '출력 제약(길이/언어/범위)이 없습니다.',
      fixHint: 'add_output_constraint',
    };
  },
};

// R011 — question without context
export const r011: Rule = {
  id: 'R011',
  name: 'question_without_context',
  category: 'context',
  description: 'Short standalone question with no background.',
  severity: 2,
  detect: ({ promptText, meta }) => {
    if (meta.wordCount >= 15) return null;
    if (!anyMatch(promptText, QUESTION_MARKERS)) return null;
    if (anyMatch(promptText, CONTEXT_KEYWORDS)) return null;
    return {
      severity: 2,
      message: '배경 없이 단문 질문입니다. 이전에 무엇을 했는지 1줄 덧붙이면 좋습니다.',
      fixHint: 'add_background_to_question',
    };
  },
};

// R012 — code dump without instruction
export const r012: Rule = {
  id: 'R012',
  name: 'code_dump_no_instruction',
  category: 'structure',
  description: 'Prompt is mostly code with no instruction.',
  severity: 3,
  detect: ({ promptText }) => {
    const codeBlocks = promptText.match(/```[\s\S]*?```/g) ?? [];
    if (codeBlocks.length === 0) return null;
    const codeLen = codeBlocks.reduce((acc, b) => acc + b.length, 0);
    if (codeLen / promptText.length < 0.8) return null;
    if (anyMatch(promptText, IMPERATIVE_KEYWORDS)) return null;
    return {
      severity: 3,
      message: '코드만 붙여넣으셨습니다. 원하는 동작(디버그/리뷰/설명)을 지시어로 추가하세요.',
      fixHint: 'add_code_action',
    };
  },
};

export const ALL_RULES: Rule[] = [
  r001,
  r002,
  r003,
  r004,
  r005,
  r006,
  r007,
  r008,
  r009,
  r010,
  r011,
  r012,
];
