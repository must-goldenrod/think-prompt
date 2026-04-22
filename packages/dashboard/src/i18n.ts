/**
 * Minimal i18n for the dashboard chrome (nav, headings, labels, empty states).
 *
 * Scope — what IS translated:
 *   - UI structure: navigation, section titles, table headers, empty states,
 *     button captions, tier badge labels.
 *
 * Scope — what is NOT translated:
 *   - User input: prompt text, session IDs, rule IDs (R001 ...), timestamps.
 *   - Rule names/descriptions that live in the rules registry — those stay
 *     in their canonical language for now; a future pass can localize them.
 *
 * Locale resolution order (highest priority first):
 *   1. `?lang=xx` query string (explicit override; also persisted per click)
 *   2. `Accept-Language` HTTP header (first supported tag wins)
 *   3. `config.i18n` (user's saved preference)
 *   4. `'en'` fallback
 */

export type Locale = 'en' | 'ko' | 'zh' | 'es' | 'ja';

export const LOCALES: readonly Locale[] = ['en', 'ko', 'zh', 'es', 'ja'] as const;

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
  zh: '中文',
  es: 'Español',
  ja: '日本語',
};

export interface Dictionary {
  /* common / chrome */
  'nav.overview': string;
  'nav.prompts': string;
  'nav.rules': string;
  'nav.settings': string;
  'nav.doctor': string;
  'footer.local_only': string;
  'common.total': string;
  'common.back': string;
  'common.no_data': string;
  'common.none': string;
  'common.language': string;

  /* overview */
  'overview.title': string;
  'overview.total_prompts': string;
  'overview.last_n_days': string;
  'overview.tier_breakdown': string;
  'overview.daily_additions': string;
  'overview.lowest_scoring': string;
  'overview.no_scored_yet': string;
  'overview.recent': string;

  /* prompts list */
  'prompts.title': string;
  'prompts.all_tiers': string;
  'prompts.all_sources': string;
  'prompts.rule_placeholder': string;
  'prompts.filter': string;
  'prompts.clear': string;
  'prompts.col.score': string;
  'prompts.col.tier': string;
  'prompts.col.source': string;
  'prompts.col.hits': string;
  'prompts.col.prompt': string;
  'prompts.col.created': string;

  /* prompt detail */
  'detail.title': string;
  'detail.session': string;
  'detail.chars': string;
  'detail.words': string;
  'detail.turn': string;
  'detail.feedback': string;
  'detail.reprocess_hint': string;
  'detail.original': string;
  'detail.score': string;
  'detail.rule_hits': string;
  'detail.no_hits': string;
  'detail.suggested_rewrites': string;
  'detail.rewrite_none': string;

  /* session */
  'session.title': string;
  'session.turns': string;
  'session.subagents': string;
  'session.none': string;
  'session.tool_rollup': string;
  'session.col.tool': string;
  'session.col.calls': string;
  'session.col.fails': string;
  'session.col.ms': string;
  'session.prompt': string;

  /* rules */
  'rules.title': string;
  'rules.col.id': string;
  'rules.col.name': string;
  'rules.col.category': string;
  'rules.col.sev': string;
  'rules.col.hits': string;
  'rules.col.description': string;

  /* settings */
  'settings.title': string;
  'settings.edit_hint': string;
  'settings.config_readonly': string;

  /* doctor */
  'doctor.title': string;
  'doctor.counts': string;
  'doctor.installed': string;

  /* tier display labels (the className / data key stays english) */
  'tier.good': string;
  'tier.ok': string;
  'tier.weak': string;
  'tier.bad': string;
  'tier.na': string;
}

const EN: Dictionary = {
  'nav.overview': 'Overview',
  'nav.prompts': 'Prompts',
  'nav.rules': 'Rules',
  'nav.settings': 'Settings',
  'nav.doctor': 'Doctor',
  'footer.local_only': 'local-only',
  'common.total': 'total',
  'common.back': '← back',
  'common.no_data': 'no data',
  'common.none': '(none)',
  'common.language': 'Language',

  'overview.title': 'Overview',
  'overview.total_prompts': 'Total prompts',
  'overview.last_n_days': 'last {n} days',
  'overview.tier_breakdown': 'Tier breakdown',
  'overview.daily_additions': 'Daily additions (last {n} days)',
  'overview.lowest_scoring': 'Lowest scoring',
  'overview.no_scored_yet': 'no scored prompts yet',
  'overview.recent': 'Recent',

  'prompts.title': 'Prompts',
  'prompts.all_tiers': 'All tiers',
  'prompts.all_sources': 'All sources',
  'prompts.rule_placeholder': 'rule id e.g. R003',
  'prompts.filter': 'Filter',
  'prompts.clear': 'Clear',
  'prompts.col.score': 'Score',
  'prompts.col.tier': 'Tier',
  'prompts.col.source': 'Source',
  'prompts.col.hits': 'Hits',
  'prompts.col.prompt': 'Prompt',
  'prompts.col.created': 'Created',

  'detail.title': 'Prompt',
  'detail.session': 'session',
  'detail.chars': 'chars',
  'detail.words': 'words',
  'detail.turn': 'turn',
  'detail.feedback': 'Feedback:',
  'detail.reprocess_hint': '(reprocess after session end to update usage_score)',
  'detail.original': 'Original',
  'detail.score': 'Score',
  'detail.rule_hits': 'Rule hits',
  'detail.no_hits': '(no hits)',
  'detail.suggested_rewrites': 'Suggested rewrites',
  'detail.rewrite_none': '(none) — try: ',

  'session.title': 'Session',
  'session.turns': 'Turns',
  'session.subagents': 'Subagents',
  'session.none': 'none',
  'session.tool_rollup': 'Tool use rollup',
  'session.col.tool': 'Tool',
  'session.col.calls': 'Calls',
  'session.col.fails': 'Fails',
  'session.col.ms': 'Total ms',
  'session.prompt': 'prompt:',

  'rules.title': 'Rule catalog',
  'rules.col.id': 'ID',
  'rules.col.name': 'Name',
  'rules.col.category': 'Category',
  'rules.col.sev': 'Sev',
  'rules.col.hits': 'Hits',
  'rules.col.description': 'Description',

  'settings.title': 'Settings',
  'settings.edit_hint': 'Edit ~/.think-prompt/config.json or use the CLI:',
  'settings.config_readonly': 'Current config (read-only)',

  'doctor.title': 'Doctor',
  'doctor.counts': 'Counts',
  'doctor.installed': 'Installed',

  'tier.good': 'good',
  'tier.ok': 'ok',
  'tier.weak': 'weak',
  'tier.bad': 'bad',
  'tier.na': 'n/a',
};

const KO: Dictionary = {
  'nav.overview': '개요',
  'nav.prompts': '프롬프트',
  'nav.rules': '규칙',
  'nav.settings': '설정',
  'nav.doctor': '진단',
  'footer.local_only': '로컬 전용',
  'common.total': '합계',
  'common.back': '← 뒤로',
  'common.no_data': '데이터 없음',
  'common.none': '(없음)',
  'common.language': '언어',

  'overview.title': '개요',
  'overview.total_prompts': '전체 프롬프트',
  'overview.last_n_days': '최근 {n}일',
  'overview.tier_breakdown': '등급 분포',
  'overview.daily_additions': '일별 추가 (최근 {n}일)',
  'overview.lowest_scoring': '최저 점수',
  'overview.no_scored_yet': '아직 채점된 프롬프트가 없습니다',
  'overview.recent': '최근 항목',

  'prompts.title': '프롬프트',
  'prompts.all_tiers': '모든 등급',
  'prompts.all_sources': '모든 출처',
  'prompts.rule_placeholder': '룰 ID (예: R003)',
  'prompts.filter': '필터',
  'prompts.clear': '초기화',
  'prompts.col.score': '점수',
  'prompts.col.tier': '등급',
  'prompts.col.source': '출처',
  'prompts.col.hits': '히트',
  'prompts.col.prompt': '프롬프트',
  'prompts.col.created': '생성',

  'detail.title': '프롬프트',
  'detail.session': '세션',
  'detail.chars': '자',
  'detail.words': '단어',
  'detail.turn': '턴',
  'detail.feedback': '피드백:',
  'detail.reprocess_hint': '(세션 종료 후 재처리해야 usage_score 반영)',
  'detail.original': '원문',
  'detail.score': '점수',
  'detail.rule_hits': '룰 히트',
  'detail.no_hits': '(히트 없음)',
  'detail.suggested_rewrites': '개선 제안',
  'detail.rewrite_none': '(없음) — 다음을 실행: ',

  'session.title': '세션',
  'session.turns': '턴',
  'session.subagents': '서브에이전트',
  'session.none': '없음',
  'session.tool_rollup': '도구 사용 집계',
  'session.col.tool': '도구',
  'session.col.calls': '호출',
  'session.col.fails': '실패',
  'session.col.ms': '총 ms',
  'session.prompt': '프롬프트:',

  'rules.title': '룰 카탈로그',
  'rules.col.id': 'ID',
  'rules.col.name': '이름',
  'rules.col.category': '카테고리',
  'rules.col.sev': '심각도',
  'rules.col.hits': '히트',
  'rules.col.description': '설명',

  'settings.title': '설정',
  'settings.edit_hint': '~/.think-prompt/config.json 을 수정하거나 CLI 사용:',
  'settings.config_readonly': '현재 설정 (읽기 전용)',

  'doctor.title': '진단',
  'doctor.counts': '카운트',
  'doctor.installed': '설치됨',

  'tier.good': '양호',
  'tier.ok': '보통',
  'tier.weak': '주의',
  'tier.bad': '불량',
  'tier.na': '미채점',
};

const ZH: Dictionary = {
  'nav.overview': '概览',
  'nav.prompts': '提示',
  'nav.rules': '规则',
  'nav.settings': '设置',
  'nav.doctor': '诊断',
  'footer.local_only': '仅本地',
  'common.total': '总计',
  'common.back': '← 返回',
  'common.no_data': '暂无数据',
  'common.none': '(无)',
  'common.language': '语言',

  'overview.title': '概览',
  'overview.total_prompts': '提示总数',
  'overview.last_n_days': '最近 {n} 天',
  'overview.tier_breakdown': '等级分布',
  'overview.daily_additions': '每日新增(最近 {n} 天)',
  'overview.lowest_scoring': '最低得分',
  'overview.no_scored_yet': '尚无已评分的提示',
  'overview.recent': '最近',

  'prompts.title': '提示',
  'prompts.all_tiers': '所有等级',
  'prompts.all_sources': '所有来源',
  'prompts.rule_placeholder': '规则 ID (例如 R003)',
  'prompts.filter': '筛选',
  'prompts.clear': '清除',
  'prompts.col.score': '得分',
  'prompts.col.tier': '等级',
  'prompts.col.source': '来源',
  'prompts.col.hits': '命中',
  'prompts.col.prompt': '提示',
  'prompts.col.created': '创建',

  'detail.title': '提示',
  'detail.session': '会话',
  'detail.chars': '字符',
  'detail.words': '词',
  'detail.turn': '回合',
  'detail.feedback': '反馈:',
  'detail.reprocess_hint': '(会话结束后重新处理以更新 usage_score)',
  'detail.original': '原文',
  'detail.score': '得分',
  'detail.rule_hits': '规则命中',
  'detail.no_hits': '(无命中)',
  'detail.suggested_rewrites': '改写建议',
  'detail.rewrite_none': '(无) — 请尝试: ',

  'session.title': '会话',
  'session.turns': '回合',
  'session.subagents': '子代理',
  'session.none': '无',
  'session.tool_rollup': '工具调用汇总',
  'session.col.tool': '工具',
  'session.col.calls': '调用',
  'session.col.fails': '失败',
  'session.col.ms': '总毫秒',
  'session.prompt': '提示:',

  'rules.title': '规则目录',
  'rules.col.id': 'ID',
  'rules.col.name': '名称',
  'rules.col.category': '分类',
  'rules.col.sev': '严重度',
  'rules.col.hits': '命中',
  'rules.col.description': '描述',

  'settings.title': '设置',
  'settings.edit_hint': '编辑 ~/.think-prompt/config.json 或使用 CLI:',
  'settings.config_readonly': '当前配置 (只读)',

  'doctor.title': '诊断',
  'doctor.counts': '计数',
  'doctor.installed': '已安装',

  'tier.good': '优',
  'tier.ok': '良',
  'tier.weak': '弱',
  'tier.bad': '差',
  'tier.na': '未评',
};

const ES: Dictionary = {
  'nav.overview': 'Resumen',
  'nav.prompts': 'Prompts',
  'nav.rules': 'Reglas',
  'nav.settings': 'Ajustes',
  'nav.doctor': 'Diagnóstico',
  'footer.local_only': 'sólo local',
  'common.total': 'total',
  'common.back': '← atrás',
  'common.no_data': 'sin datos',
  'common.none': '(ninguno)',
  'common.language': 'Idioma',

  'overview.title': 'Resumen',
  'overview.total_prompts': 'Total de prompts',
  'overview.last_n_days': 'últimos {n} días',
  'overview.tier_breakdown': 'Distribución por nivel',
  'overview.daily_additions': 'Añadidos por día (últimos {n} días)',
  'overview.lowest_scoring': 'Peores puntuaciones',
  'overview.no_scored_yet': 'aún no hay prompts puntuados',
  'overview.recent': 'Recientes',

  'prompts.title': 'Prompts',
  'prompts.all_tiers': 'Todos los niveles',
  'prompts.all_sources': 'Todas las fuentes',
  'prompts.rule_placeholder': 'ID de regla, p. ej. R003',
  'prompts.filter': 'Filtrar',
  'prompts.clear': 'Limpiar',
  'prompts.col.score': 'Puntuación',
  'prompts.col.tier': 'Nivel',
  'prompts.col.source': 'Fuente',
  'prompts.col.hits': 'Aciertos',
  'prompts.col.prompt': 'Prompt',
  'prompts.col.created': 'Creado',

  'detail.title': 'Prompt',
  'detail.session': 'sesión',
  'detail.chars': 'car.',
  'detail.words': 'palabras',
  'detail.turn': 'turno',
  'detail.feedback': 'Feedback:',
  'detail.reprocess_hint': '(reprocesar al finalizar la sesión para actualizar usage_score)',
  'detail.original': 'Original',
  'detail.score': 'Puntuación',
  'detail.rule_hits': 'Reglas disparadas',
  'detail.no_hits': '(sin aciertos)',
  'detail.suggested_rewrites': 'Reescrituras sugeridas',
  'detail.rewrite_none': '(ninguna) — probar: ',

  'session.title': 'Sesión',
  'session.turns': 'Turnos',
  'session.subagents': 'Subagentes',
  'session.none': 'ninguno',
  'session.tool_rollup': 'Resumen de herramientas',
  'session.col.tool': 'Herramienta',
  'session.col.calls': 'Llamadas',
  'session.col.fails': 'Fallos',
  'session.col.ms': 'Total ms',
  'session.prompt': 'prompt:',

  'rules.title': 'Catálogo de reglas',
  'rules.col.id': 'ID',
  'rules.col.name': 'Nombre',
  'rules.col.category': 'Categoría',
  'rules.col.sev': 'Sev.',
  'rules.col.hits': 'Aciertos',
  'rules.col.description': 'Descripción',

  'settings.title': 'Ajustes',
  'settings.edit_hint': 'Edita ~/.think-prompt/config.json o usa el CLI:',
  'settings.config_readonly': 'Configuración actual (sólo lectura)',

  'doctor.title': 'Diagnóstico',
  'doctor.counts': 'Conteos',
  'doctor.installed': 'Instalado',

  'tier.good': 'bueno',
  'tier.ok': 'ok',
  'tier.weak': 'débil',
  'tier.bad': 'malo',
  'tier.na': 's/p',
};

const JA: Dictionary = {
  'nav.overview': '概要',
  'nav.prompts': 'プロンプト',
  'nav.rules': 'ルール',
  'nav.settings': '設定',
  'nav.doctor': '診断',
  'footer.local_only': 'ローカル専用',
  'common.total': '合計',
  'common.back': '← 戻る',
  'common.no_data': 'データなし',
  'common.none': '(なし)',
  'common.language': '言語',

  'overview.title': '概要',
  'overview.total_prompts': 'プロンプト総数',
  'overview.last_n_days': '直近 {n} 日',
  'overview.tier_breakdown': '品質レベル分布',
  'overview.daily_additions': '日別追加 (直近 {n} 日)',
  'overview.lowest_scoring': '低スコア',
  'overview.no_scored_yet': 'まだ採点されたプロンプトがありません',
  'overview.recent': '最近',

  'prompts.title': 'プロンプト',
  'prompts.all_tiers': 'すべての品質',
  'prompts.all_sources': 'すべての出典',
  'prompts.rule_placeholder': 'ルール ID (例 R003)',
  'prompts.filter': '絞り込み',
  'prompts.clear': 'クリア',
  'prompts.col.score': 'スコア',
  'prompts.col.tier': '品質',
  'prompts.col.source': '出典',
  'prompts.col.hits': 'ヒット',
  'prompts.col.prompt': 'プロンプト',
  'prompts.col.created': '作成',

  'detail.title': 'プロンプト',
  'detail.session': 'セッション',
  'detail.chars': '文字',
  'detail.words': '単語',
  'detail.turn': 'ターン',
  'detail.feedback': 'フィードバック:',
  'detail.reprocess_hint': '(セッション終了後に再処理すると usage_score が更新されます)',
  'detail.original': '原文',
  'detail.score': 'スコア',
  'detail.rule_hits': 'ルールヒット',
  'detail.no_hits': '(ヒットなし)',
  'detail.suggested_rewrites': '改善提案',
  'detail.rewrite_none': '(なし) — 実行: ',

  'session.title': 'セッション',
  'session.turns': 'ターン',
  'session.subagents': 'サブエージェント',
  'session.none': 'なし',
  'session.tool_rollup': 'ツール使用集計',
  'session.col.tool': 'ツール',
  'session.col.calls': '呼び出し',
  'session.col.fails': '失敗',
  'session.col.ms': '合計ms',
  'session.prompt': 'プロンプト:',

  'rules.title': 'ルールカタログ',
  'rules.col.id': 'ID',
  'rules.col.name': '名前',
  'rules.col.category': 'カテゴリ',
  'rules.col.sev': '重大度',
  'rules.col.hits': 'ヒット',
  'rules.col.description': '説明',

  'settings.title': '設定',
  'settings.edit_hint': '~/.think-prompt/config.json を編集するか CLI を使用:',
  'settings.config_readonly': '現在の設定 (読み取り専用)',

  'doctor.title': '診断',
  'doctor.counts': 'カウント',
  'doctor.installed': 'インストール済み',

  'tier.good': '良',
  'tier.ok': '可',
  'tier.weak': '弱',
  'tier.bad': '不良',
  'tier.na': '未評価',
};

const DICTS: Record<Locale, Dictionary> = { en: EN, ko: KO, zh: ZH, es: ES, ja: JA };

/**
 * Translate a key into the given locale. Unknown keys fall back to English,
 * and then to the key itself — never throw, never block render.
 *
 * `params` substitutes `{name}` placeholders.
 */
export function t(
  locale: Locale,
  key: keyof Dictionary,
  params?: Record<string, string | number>
): string {
  const dict = DICTS[locale] ?? EN;
  let raw = dict[key] ?? EN[key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.replace(`{${k}}`, String(v));
    }
  }
  return raw;
}

/**
 * Resolve which locale to render in, given the request query, headers, and
 * the saved user config. Query param wins over header, header over config.
 */
export function resolveLocale(
  query: unknown,
  acceptLanguage: string | undefined,
  configLocale: string | undefined
): Locale {
  // 1. Explicit ?lang= override.
  const q = query as { lang?: unknown } | null | undefined;
  const fromQuery = typeof q?.lang === 'string' ? normalizeLocale(q.lang) : null;
  if (fromQuery) return fromQuery;

  // 2. Accept-Language header — walk tags in order.
  if (acceptLanguage) {
    for (const tag of acceptLanguage.split(',')) {
      const code = tag.trim().toLowerCase().split(';')[0]?.split('-')[0];
      const match = code ? normalizeLocale(code) : null;
      if (match) return match;
    }
  }

  // 3. Saved config.
  const fromConfig = configLocale ? normalizeLocale(configLocale) : null;
  if (fromConfig) return fromConfig;

  // 4. Fallback.
  return 'en';
}

function normalizeLocale(raw: string): Locale | null {
  const lower = raw.toLowerCase();
  if (LOCALES.includes(lower as Locale)) return lower as Locale;
  // Common aliases.
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  if (lower.startsWith('en')) return 'en';
  return null;
}
