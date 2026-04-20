// Shared keyword sets. Korean + English mixed.

export const FORMAT_KEYWORDS: RegExp[] = [
  /\bjson\b/i,
  /\byaml\b/i,
  /\bcsv\b/i,
  /\bxml\b/i,
  /\btable\b/i,
  /\bmarkdown\b/i,
  /\bbullet(s)?\b/i,
  /\blist\b/i,
  /\bdiff\b/i,
  /\bformat\b/i,
  /표\s*(로|형식)/u,
  /리스트\s*로/u,
  /bullet\s*로/u,
  /목록\s*으로/u,
  /단계별/u,
  /요약/u,
  /\d+\s*(단어|문장|문단|줄)/u,
  /(ten|five|three|\d+)\s+(words|sentences|lines|bullets|items)/i,
];

export const CONTEXT_KEYWORDS: RegExp[] = [
  /\bthis\s+(project|codebase|repo|file|function|class|module)\b/i,
  /\busers?\s+are\b/i,
  /\bdomain\b/i,
  /\bcontext\b/i,
  // Korean: match the noun anywhere (often preceded by "이 <lang> 프로젝트" etc.)
  /(프로젝트|코드베이스|레포지토리|레포|파일|함수|클래스|모듈|컴포넌트|엔드포인트|테이블|스키마)/u,
  /사용자[는은가]/u,
  /도메인[은는]/u,
  /맥락/u,
  // Common tech domain mentions that give enough context signal
  /\b(typescript|javascript|python|react|node|rust|go|postgres|sqlite|redis|kafka|docker|k8s|kubernetes)\b/i,
];

export const IMPERATIVE_KEYWORDS: RegExp[] = [
  /\b(write|create|make|build|refactor|fix|debug|implement|explain|review|analyze|summarize|translate|convert|generate|design|deploy|test|run|list|find|show|add|remove|delete|update|optimize)\b/i,
  /해줘|해주세요|해주길|작성해|만들어|구현해|수정해|리팩터|설명해|분석해|리뷰해|요약해|번역해|변환해|제안해|고쳐|바꿔|추가해|삭제해|제거해|테스트해/u,
];

export const OUTPUT_CONSTRAINT_KEYWORDS: RegExp[] = [
  /\b(within|under|less than|at most|no more than|exactly)\s+\d+/i,
  /\bmax(imum)?\s+\d+/i,
  /\d+\s*(lines|words|sentences|tokens|chars)/i,
  /\d+\s*(줄|단어|문장|문단|토큰|자)\s*(이내|이하|로|까지)/u,
  /한글로|영어로|한국어로|korean\s*로|english\s*로|in\s+(english|korean)/i,
];

export const SUCCESS_CRITERIA_KEYWORDS: RegExp[] = [
  /success\s+criteria/i,
  /done\s+when/i,
  /acceptance\s+criteria/i,
  /성공\s*기준/u,
  /완료\s*기준/u,
  /기준[:은는]/u,
];

export const EXAMPLE_KEYWORDS: RegExp[] = [
  /\bexample(s)?\b[:=]/i,
  /\bex\.?\s*:/i,
  /\be\.g\.\b/i,
  /\bfor\s+example\b/i,
  /예[:)]/u,
  /예시[:)]/u,
];

export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?previous/i,
  /system\s*:\s*/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /you\s+are\s+now\s+a\s+different/i,
  /이전\s+(명령|지시|프롬프트)\s*(무시|잊어)/u,
];

export const QUESTION_MARKERS: RegExp[] = [
  /^\s*(what|why|when|where|who|how|is|are|does|do|can|should)\b.*\?/i,
  /\?\s*$/,
];

export const AMBIGUOUS_PRONOUN_STARTS: RegExp[] = [
  /^\s*(이거|그거|저거|저것|이것|that|this|it)\b/i,
  /^\s*(위\s*내용|above|the\s+above)\b/i,
];

export function anyMatch(text: string, patterns: RegExp[]): RegExp | null {
  for (const re of patterns) {
    if (re.test(text)) return re;
  }
  return null;
}
