# 03 · 로컬 저장소 & 데몬 구조

> SQLite 스키마 · 파일 레이아웃 · 데몬 수명주기. 에이전트/워커가 바라볼 유일한 신뢰 출처.

---

## 1. 디렉토리 레이아웃 (`~/.think-prompt/`)

```
~/.think-prompt/
├── config.json                # 유저 설정 (JSON)
├── prompts.db                 # SQLite (WAL 모드) — 메인 DB
├── prompts.db-wal             # SQLite WAL 자동 생성
├── prompts.db-shm             # SQLite shared memory
├── queue.jsonl                # 워커 작업 큐 (append-only)
├── queue.offset               # 워커가 처리한 마지막 line offset
├── agent.pid                  # 에이전트 데몬 PID
├── agent.log                  # pino JSON 로그
├── agent.log.1..7             # 로테이션본
├── worker.pid                 # 워커 데몬 PID
├── worker.log
└── rules-cache.json           # 룰 버전/해시 캐시
```

**소유권:** 유저 홈 디렉토리. 다른 유저/프로세스는 접근 불가(mode 700).

---

## 2. SQLite 스키마 v0

모든 테이블은 `created_at` `DATETIME DEFAULT CURRENT_TIMESTAMP`.
ID는 **ULID** 문자열(시간순 정렬 + 분산 고유).

### 2.1 `sessions`
Claude Code 세션 하나에 1행.
```sql
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,         -- Claude Code session_id
  cwd             TEXT NOT NULL,
  model           TEXT,
  source          TEXT,                     -- startup/resume/clear/compact
  started_at      DATETIME NOT NULL,
  ended_at        DATETIME,
  transcript_path TEXT,                     -- 세션 트랜스크립트 파일 경로
  stop_count      INTEGER DEFAULT 0         -- Stop 훅 발생 횟수
);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
```

### 2.2 `prompt_usages`
유저가 친 **한 번의 프롬프트 입력** = 1행. 시간축의 이벤트.
```sql
CREATE TABLE prompt_usages (
  id            TEXT PRIMARY KEY,            -- ULID
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  prompt_text   TEXT NOT NULL,               -- 원문 (로컬만)
  prompt_hash   TEXT NOT NULL,               -- sha256, 동기화/통계용
  pii_masked    TEXT NOT NULL,               -- PII 치환된 사본 (서버 동기화 대상)
  char_len      INTEGER NOT NULL,
  word_count    INTEGER NOT NULL,
  created_at    DATETIME NOT NULL,
  turn_index    INTEGER NOT NULL,            -- 세션 내 N번째 유저 턴
  coach_context TEXT                         -- 코치 모드 ON일 때 주입한 additionalContext
);
CREATE INDEX idx_pu_session ON prompt_usages(session_id, turn_index);
CREATE INDEX idx_pu_hash ON prompt_usages(prompt_hash);
CREATE INDEX idx_pu_created ON prompt_usages(created_at DESC);
```

### 2.3 `prompts` (템플릿, 버전 관리 대상)
반복 재사용되는 시스템/템플릿 프롬프트(Claude Code의 agent/skill system prompt 등).
MVP에선 **수집만** 하고 편집 UI는 이후.
```sql
CREATE TABLE prompts (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,               -- system/agent/skill/template
  name          TEXT NOT NULL,
  current_ver   INTEGER NOT NULL DEFAULT 1,
  first_seen    DATETIME NOT NULL,
  last_seen     DATETIME NOT NULL
);
CREATE TABLE prompt_versions (
  prompt_id     TEXT NOT NULL REFERENCES prompts(id),
  version       INTEGER NOT NULL,
  body          TEXT NOT NULL,
  body_hash     TEXT NOT NULL,
  created_at    DATETIME NOT NULL,
  PRIMARY KEY (prompt_id, version)
);
CREATE INDEX idx_pv_hash ON prompt_versions(body_hash);
```

### 2.4 `subagent_invocations`
`SubagentStart/Stop`로 잡힌 서브에이전트 호출.
```sql
CREATE TABLE subagent_invocations (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id),
  parent_usage_id    TEXT REFERENCES prompt_usages(id),
  agent_type         TEXT NOT NULL,
  agent_id           TEXT NOT NULL,
  started_at         DATETIME NOT NULL,
  ended_at           DATETIME,
  transcript_path    TEXT,
  prompt_text        TEXT,                    -- 트랜스크립트 파싱으로 채워짐
  prompt_hash        TEXT,
  response_text      TEXT,                    -- 최종 응답
  tool_use_count     INTEGER DEFAULT 0,
  status             TEXT                     -- running/completed/failed
);
CREATE INDEX idx_sai_session ON subagent_invocations(session_id);
```

### 2.5 `tool_uses`
`PreToolUse/PostToolUse` 집계. 개별 호출 단위 저장은 비용 크므로 **세션·도구별 rollup** 행.
```sql
CREATE TABLE tool_use_rollups (
  session_id     TEXT NOT NULL REFERENCES sessions(id),
  tool_name      TEXT NOT NULL,
  call_count     INTEGER DEFAULT 0,
  fail_count     INTEGER DEFAULT 0,
  total_ms       INTEGER DEFAULT 0,
  total_in_bytes INTEGER DEFAULT 0,
  total_out_bytes INTEGER DEFAULT 0,
  PRIMARY KEY (session_id, tool_name)
);
```

### 2.6 `rule_hits`
룰 엔진이 한 prompt_usage에 대해 감지한 각 룰 히트.
```sql
CREATE TABLE rule_hits (
  usage_id   TEXT NOT NULL REFERENCES prompt_usages(id),
  rule_id    TEXT NOT NULL,                   -- R001, R002, ...
  severity   INTEGER NOT NULL,                -- 1..5
  message    TEXT NOT NULL,
  evidence   TEXT,                            -- 매칭된 스니펫 등
  PRIMARY KEY (usage_id, rule_id)
);
CREATE INDEX idx_rh_rule ON rule_hits(rule_id);
```

### 2.7 `quality_scores`
`prompt_usages`당 최종 스코어 1행. 공식은 `05-quality-engine.md` §3.
```sql
CREATE TABLE quality_scores (
  usage_id      TEXT PRIMARY KEY REFERENCES prompt_usages(id),
  rule_score    INTEGER NOT NULL,             -- 0..100
  usage_score   INTEGER,                      -- 0..100 (데이터 없으면 NULL)
  judge_score   INTEGER,                      -- 0..100 (LLM 심판 → 없으면 NULL)
  final_score   INTEGER NOT NULL,
  tier          TEXT NOT NULL,                -- good/ok/weak/bad
  computed_at   DATETIME NOT NULL,
  rules_version INTEGER NOT NULL
);
CREATE INDEX idx_qs_final ON quality_scores(final_score);
```

### 2.8 `rewrites`
리라이터가 제안한 개선안.
```sql
CREATE TABLE rewrites (
  id              TEXT PRIMARY KEY,
  usage_id        TEXT NOT NULL REFERENCES prompt_usages(id),
  before_text     TEXT NOT NULL,
  after_text      TEXT NOT NULL,
  diff            TEXT,                        -- unified diff
  reason          TEXT,
  model           TEXT NOT NULL,
  status          TEXT NOT NULL,               -- proposed/accepted/rejected
  created_at      DATETIME NOT NULL
);
```

### 2.9 `audit`
설치/업그레이드/설정 변경 이력.
```sql
CREATE TABLE audit (
  id         TEXT PRIMARY KEY,
  ts         DATETIME NOT NULL,
  action     TEXT NOT NULL,                    -- install/uninstall/config_change/db_migrate
  actor      TEXT NOT NULL,                    -- cli/agent/worker
  detail     TEXT                              -- JSON
);
```

### 2.10 메타
```sql
CREATE TABLE _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- schema_version, rules_version, installed_at, last_migrate_at 등
```

---

## 3. 마이그레이션 전략
- `packages/core/migrations/NNN_description.sql` 순차 적용.
- `_meta.schema_version` 읽어 미적용 건 순차 실행.
- 실패 시 트랜잭션 롤백. 원본 DB는 `prompts.db.bak-<timestamp>`로 백업 후 시도.
- 마이그레이션은 에이전트 기동 시 자동 수행.

---

## 4. 큐 포맷 (`queue.jsonl`)
Append-only JSONL. 각 라인은 하나의 작업.

```json
{"id":"01HZ...","ts":"2026-04-20T11:02:03.000Z","kind":"parse_transcript","payload":{"session_id":"abc","transcript_path":"/.../transcript.jsonl"},"attempts":0}
{"id":"01HZ...","ts":"...","kind":"parse_subagent_transcript","payload":{"invocation_id":"...","agent_transcript_path":"..."},"attempts":0}
{"id":"01HZ...","ts":"...","kind":"score","payload":{"usage_id":"..."},"attempts":0}
{"id":"01HZ...","ts":"...","kind":"judge","payload":{"usage_id":"..."},"attempts":0}
{"id":"01HZ...","ts":"...","kind":"rewrite","payload":{"usage_id":"..."},"attempts":0}
```

- **소비:** 워커가 `queue.offset` 이후의 라인을 순서대로 읽고 처리.
- **재시도:** 실패 시 `attempts++`로 재append, max 5회.
- **압축:** 1주일 이상 된 처리분은 `queue.jsonl.gz-YYYY-MM-DD`로 아카이브.

---

## 5. 데몬 수명주기

### 5.1 두 데몬
- **Agent** (`@think-prompt/agent`): 훅 HTTP 수신 · 즉석 룰 검사 · 큐에 작업 push.
- **Worker** (`@think-prompt/worker`): 큐 소비 · 트랜스크립트 파싱 · LLM 호출 · 스코어 계산.

### 5.2 기동
- `think-prompt start` → 두 프로세스 모두 `detached: true, stdio: 'ignore'`로 spawn. pidfile 기록.
- `think-prompt install` 시 자동 호출.

### 5.3 감시(Self-healing)
- CLI가 기동 시 pidfile의 PID를 `process.kill(pid, 0)`으로 검사. 죽어 있으면 재기동.
- 에이전트는 워커 pid를 헬스체크하고 죽으면 재기동.
- 워커는 에이전트 pid를 동일하게 감시.

### 5.4 종료
- SIGTERM 수신 시: 에이전트는 큐 flush 후 종료. 워커는 현재 작업 완료 후 종료.
- `think-prompt stop` 이 SIGTERM 전송.

### 5.5 자동 부팅(옵션)
- MVP에선 수동. M8에서 `--autostart` 옵션으로 macOS(launchd)/Linux(systemd-user) 등록 지원.

---

## 6. 설정 파일 (`config.json`)

```json
{
  "version": 1,
  "agent": {
    "port": 47823,
    "max_prompt_bytes": 262144,
    "coach_mode": false,
    "fail_open": true
  },
  "dashboard": {
    "port": 47824,
    "open_on_start": false
  },
  "privacy": {
    "store_original": true,
    "pii_mask": true,
    "retention_days": 90,
    "sync_to_server": false
  },
  "llm": {
    "enabled": false,
    "provider": "anthropic",
    "model": "claude-haiku-4-5",
    "api_key_env": "ANTHROPIC_API_KEY",
    "judge_threshold_score": 60,
    "max_monthly_tokens": 500000
  },
  "rules": {
    "enabled_set": "default",
    "custom_disabled": []
  }
}
```

유저가 직접 편집 가능. `think-prompt config set <key> <value>` CLI도 제공.

---

## 7. 보존 · 삭제

- **보존 기간:** `privacy.retention_days` (기본 90일). 워커가 매일 자정 이후 오래된 `prompt_usages` 원문을 NULL 처리하고 메타만 유지.
- **완전 삭제:** `think-prompt wipe` → `~/.think-prompt/` 제거 + Claude `settings.json`의 훅 블록 제거.
- **개별 삭제:** 대시보드/CLI에서 `usage_id` 지정 삭제.
