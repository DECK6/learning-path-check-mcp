# 구현 지시서: learning-path-check-mcp v0.1.0

> `docs/PRD.md`("우리 아이 뭐 배우지? 체크")를 코드로 옮기는 설계·구현 지시서.
> 설계: Claude Fable 5 / 구현: Codex. 충돌 시 이 문서 우선, 판단이 어려우면 PRD를 보라.

## 0. 컨텍스트와 자산

이 저장소는 빈 상태에서 시작한다. 세 개의 형제 저장소를 **읽기 전용 참조**로 사용한다 (절대 수정 금지):

| 경로 | 용도 |
|---|---|
| `../korean-elementary-learning-map` | 초등 온톨로지 원천 데이터 |
| `../korean-secondary-learning-map` | 중·고 온톨로지 원천 데이터 |
| `../event-safety-check-mcp` | 검증된 서버·레지스트리·테스트 패턴의 포팅 원본 |

산출물: PlayMCP 제출용 Stateless Streamable HTTP MCP 서버. 도구 정확히 10개. bun 전용(npm/npx 금지).

## 1. 데이터 현실과 절대 원칙

원천 데이터의 실측:

| 자산 | 개념(topic) | 개념 선수관계 | 상위 관계 |
|---|---|---|---|
| 초등 (`data/kr/`) | 1,956 | **1,894 (hard/soft·reason·basis)** | clusters 153 |
| 중학교 (`data/kr/middle/`) | 2,160 | **2,155** | courses 24, domains 149, standards 714 |
| 고교 전체 원천 (`data/kr/high/`) | 50,749 | **50,029** | courses 759, 학술계·직업계 전체 지도 |
| 고교 P0 컴파일 범위 | 3,124 | **2,932** | courses 231, 공통·선택·교양·계열 범위 |
| 브릿지 (`data/kr/bridges/`) | — | 초→중 19 | 중→고 전이 50, 고교 과정 관계 39 |

**절대 원칙 (중등 레포 README에서 승계): 근거 없는 선수관계를 생성하지 않는다.**

1. 개념 수준 역추적(`trace_learning_path`)은 검토 완료된 초·중·고 선수관계에서 제공한다.
2. `required-prerequisite`와 `recommended-before`를 구분하고 모든 관계에 `reviewStatus`, `basisKind`, 근거와 출처를 노출한다. 과정 수준 전이는 개념 선수관계나 공식 이수 요건으로 표현하지 않는다.
3. 검토된 초등→중등 개념 관계 19건은 `prerequisite`로 제공한다. 별도의 같은 교과 연결은 `subject-continuation`이라는 과정 수준 관계로만 제공하고 선수관계라고 표현하지 않는다.
4. 성취기준 코드는 데이터에 있는 것만 출력한다. 존재하지 않는 코드 생성 0건 (테스트로 강제).
5. 고교 **직업계 전문교과(세부 토픽 47,625건, 전체 고교 토픽의 93.8%)는 P0 컴파일에서 제외**한다. 검색 시 해당 범위 질문이 오면 "P0는 공통·일반·진로·융합 선택 과목까지 지원합니다" 안내를 반환한다(PRD §14 마지막 항목의 '범위 안내').

## 2. 빌드 파이프라인: 데이터 컴파일러

`scripts/compile-data.ts` (bun 실행, 개발 시점 1회):

- 입력: 환경변수 `ELEMENTARY_DIR`(기본 `../korean-elementary-learning-map`), `SECONDARY_DIR`(기본 `../korean-secondary-learning-map`)
- 출력: `src/data/compiled/*.json` — **저장소에 커밋**한다 (독립 빌드 요건: 형제 레포 없이도 clone→bun install→build→start가 되어야 함)
- 컴파일 산출물 (총 15MB 이하 목표):
  - `concepts.json` — 통합 개념 노드. 초등 topic + 중등 topic + 고교(일반계) topic을 공통 스키마로:
    ```
    { id, schoolLevel(elementary|middle|high), subjectKo, courseId?, domainKo?,
      gradeBand, titleKo, summary(200자 절삭), standardCodes[], topicType,
      assessmentPrompt?(질문 생성용 1개), evidence[](최대 2개, 질문 생성용),
      verificationStatus, sourceRefs[] }
    ```
  - `edges.json` — 관계. 공통 스키마:
    ```
    { from, to, kind(prerequisite|course-relation|transition|subject-continuation),
      strength?, reason?, basis, reviewStatus? }
    ```
    - 초등 dependencies 1,894건 → kind=prerequisite
    - 중학교 학습관계 2,155건, P0 고교 학습관계 2,932건, 고교 과정관계 39건, 중→고 전이 50건 → 해당 kind로
    - subject-continuation: 초등 과목→중등 course. **교과군 매핑 테이블을 명시적으로 하드코딩**(수학·국어·영어·과학·사회·도덕·체육·음악·미술·실과/기술가정 등)하고 basis="repository-authored-continuation"으로 표시
  - `search-index.json` — 개념별 검색 토큰(제목·과목·영역·성취기준 코드의 정규화 문자열). 런타임 재계산 방지용
  - `meta.json` — 원천 릴리스 버전(초등 manifest.version, 중등 release.json), 컴파일 일시, 카운트, 제외 범위 명세
- 컴파일러는 참조 무결성을 검증한다: 모든 edge의 from/to가 concepts에 존재해야 하며, 위반 시 컴파일 실패.
- 절삭한 필드(assessmentPrompts 전체 배열 등)는 절대 임의 생성하지 않고 원문에서 선두 항목만 취한다.

## 3. 저장소 구조

```text
src/
  data/compiled/            # 컴파일 산출물 (커밋됨)
  domain/
    graph.ts                # 인메모리 그래프: byId, 역방향 인덱스, BFS 역추적/전방탐색, 순환 가드
    search.ts               # 검색: 토큰 매칭 + 성취기준 코드 직접 매칭, 상위 N, 모호성 판단
    judgment.ts             # 판정 규칙 (아래 §5)
    question-builder.ts     # 점검 문항 생성 (아래 §5)
    plan-builder.ts         # 복습 계획 생성: 선수관계 위상정렬 + 기간/일일시간 분배
  store/
    types.ts                # ChildProfile/LearningCheck/ConceptStatus/ReviewPlan/LearningProgress
    store.ts                # UserStore 인터페이스 + 드라이버 선택
    memory-store.ts         # 기본값
    file-store.ts           # STORE_PATH env 시 JSON 원자적 쓰기 (event-safety의 checklist-store 패턴 포팅)
    postgres-store.ts       # DATABASE_URL env 시 Bun.sql 사용. 스키마 자동 생성(CREATE TABLE IF NOT EXISTS)
  identity.ts               # 사용자 스코프 해석 (아래 §6)
  public-tools/
    manage-child-profile.ts
    search-curriculum.ts
    get-curriculum-overview.ts
    trace-learning-path.ts
    create-learning-check.ts
    assess-learning-check.ts
    build-review-plan.ts
    record-learning-progress.ts
    get-upcoming-learning-actions.ts
    get-parent-learning-report.ts
    registry.ts             # 정확히 10개 + annotations
  presenters/
    concept-markdown.ts     # 경로·개요 표시 (PRD §7 순서)
    report-markdown.ts      # 리포트·판정 표시, 금지 표현 가드
    terms.ts                # 금지 표현("모릅니다","학습부진","수준 미달") 치환기
  server/
    mcp-server.ts, http.ts, main.ts   # event-safety-check-mcp에서 포팅
  config/
    limits.ts, version.ts   # SERVICE="Learning Path Check(우리 아이 뭐 배우지? 체크)", VERSION=0.1.0
scripts/compile-data.ts
tests/
```

`../event-safety-check-mcp`에서 포팅할 파일: `src/server/http.ts`(stateless streamable, /health, 본문 제한, 413/404/에러 위생), `src/server/main.ts`, `src/public-tools/registry.ts`의 등록 패턴(extractRawShape·safeErrorResult·annotations), `tsconfig.json`, `Dockerfile`, `.dockerignore` 패턴. 포팅 시 서비스명·경로만 바꾸고 구조는 유지하라 (검증된 코드).

## 4. 도구 10개 사양

공통: PRD §6의 입출력을 따른다. 모든 결과의 `structuredContent`에 `meta: { service, version, dataVersion(초등/중등 릴리스 버전 병기), disclaimer }`. 후속 호출용 ID(childId/conceptId/checkId/questionId/planId)는 **Markdown 본문과 structuredContent 양쪽에** 반드시 포함 (PRD §9 프레젠터 요건). 특정 플랫폼 전용 문자열은 넣지 않는다. 설명은 영문 기본 + "Learning Path Check(우리 아이 뭐 배우지? 체크)" 병기.

annotations:
- 조회 5종 (`search_curriculum`, `get_curriculum_overview`, `trace_learning_path`, `get_upcoming_learning_actions`, `get_parent_learning_report`): readOnly=true, idempotent=true, destructive=false, openWorld=false
  - 단 overview/upcoming/report는 프로필을 읽으므로 readOnly=true 유지(상태 변경 없음)
- 쓰기 4종 (`create_learning_check`, `assess_learning_check`, `build_review_plan`, `record_learning_progress`): readOnly=false, idempotent=false, destructive=false, openWorld=false
- 프로필 관리 (`manage_child_profile`): readOnly=false, idempotent=false, destructive=true, openWorld=false
  - action=delete는 자녀 관련 점검·상태·계획·진행 기록을 연쇄 삭제하므로 삭제 전 확인과 `confirmDelete=true`가 필수

핵심 동작 규칙:

### `search_curriculum`
- 결과 0건 → `not_found` + 지원 범위 안내. 결과 다수·점수 근접 → `ambiguous: true` + 후보 목록(최대 5)과 "어느 것인지 알려달라" 안내. **임의 확정 금지** (PRD 품질지표).
- 직업계 전문교과 키워드(간호, 조리, 용접 등 컴파일 제외 범위) 감지 시 범위 안내.

### `trace_learning_path`
- 초등 개념: prerequisite 엣지 역방향 BFS (깊이 제한 `MAX_TRACE_DEPTH=6`, 순환 가드). 각 노드에 strength·reason·성취기준 코드.
- 후속 경로: 전방 prerequisite + subject-continuation + transition + course-relation.
- 중·고 개념: 검토된 개념 선수관계와 과정·학교급 전이를 각각의 관계 종류·근거와 함께 반환.
- 학교급 전이 구간은 `transition`으로 표시하고 reviewStatus를 병기한다.

### `create_learning_check`
- 대상 개념의 선수 체인에서 가장 기초인 항목부터 최대 `itemCount`(기본 5, 최대 8)개 개념 선택.
- 각 개념의 질문은 컴파일된 `assessmentPrompt`/`evidence`에서 **결정론적으로** 구성 (개념당 1문항, questionId = checkId + 순번). 원문에 없는 질문을 지어내지 않는다.
- 출력에 "질문 순서의 이유"(선수 깊이) 포함. checkId는 ULID.

### `assess_learning_check` — 판정 계약 (중요)
자유 텍스트 이해는 AI 클라이언트의 몫, 판정은 서버의 몫으로 분리한다:
- `responses[].outcome`: `"ok" | "partial" | "fail" | "unknown"` (필수) — AI 채팅 클라이언트가 아이의 답을 이 4단계로 매핑해 전달
- `responses[].response`: 원문 답변 요약 (선택, 기록용)
- 도구 description에 이 계약을 명시: "Map the child's answer to outcome before calling."
- 판정 규칙 (결정론):
  - ok → `understood`
  - partial 또는 fail → `review_needed`
  - unknown 또는 미응답 → `needs_more_info`
  - 개념별 판정 후, review_needed 중 **선수 깊이가 가장 깊은(가장 기초) 개념**을 "가장 먼저 복습할 지점"으로 지정
- 이전 ConceptStatus가 있으면 delta(improved/same/regressed) 계산. 권장 재점검일 = 판정일 + 7일(review_needed 존재 시) / +30일(전부 understood).

### `build_review_plan`
- reviewConceptIds를 선수관계 위상정렬(기초부터). durationWeeks×7일에 라운드로빈 분배, 하루 1개념, minutesPerDay 표기.
- 마지막 날 다음날 = 목표 개념 재도전일. `calendarEvents[]`(제목·날짜·설명)를 structuredContent에 포함 (ICS 생성은 P1, 데이터만 준비).

### `get_parent_learning_report`
- period 내 ConceptStatus/progress를 집계. PRD §7 표현 원칙 준수 — `presenters/terms.ts`의 금지 표현 가드를 모든 리포트·판정 출력에 적용하고 테스트로 강제.

## 5. 저장 계층

`UserStore` 인터페이스 (전 메서드 async):
```
getChild/ listChildren/ upsertChild/ deleteChild(cascade)
saveCheck/ getCheck/ saveConceptStatuses/ listConceptStatuses(childId, {from,to}?)
savePlan/ getPlan/ listPlans/ saveProgress/ listProgress
deleteAllForScope(scopeKey)
```
- 드라이버 선택: `DATABASE_URL` 있으면 postgres(Bun.sql, 테이블 자동 생성, JSONB 컬럼), 없고 `STORE_PATH` 있으면 file, 둘 다 없으면 memory (LRU 500 스코프).
- postgres 스키마: `lpc_children`, `lpc_checks`, `lpc_statuses`, `lpc_plans`, `lpc_progress` — PK(scope_key, id), 데이터는 JSONB. 인덱스 (scope_key, child_id).
- 모든 레코드는 scopeKey 격리. 다른 스코프의 childId 접근 → "찾을 수 없음" (존재 여부 노출 금지).

## 6. 사용자 식별 (PlayMCP 현실 대응)

사용자 상태는 PlayMCP 커스텀 헤더 인증을 capability 방식으로 처리한다:
- PlayMCP 등록에서 `Key/Token 인증` 필드명을 `x-learning-path-token`으로 설정한다.
- `identity.ts`는 단일 문자열 `x-learning-path-token`만 신뢰하며 32자 이상 256자 이하를 요구한다. `x-playmcp-user-id`, `x-user-id`, `x-forwarded-user`, 서명 검증 없는 JWT payload는 사용하지 않는다.
- 사용자는 비밀번호 관리자로 생성한 사용자별 무작위 토큰을 PlayMCP에 연결한다. 발견 시 `scopeKey = sha256(USER_SCOPE_SALT + token)`으로 격리하며 원문 토큰은 저장·반환·기록하지 않는다.
- 토큰은 해당 스코프의 인증 capability다. 분실·변경 시 기존 스코프를 복구할 수 없고 노출 시 접근권한도 넘어가므로 안전하게 보관한다.
- 토큰이 없거나 너무 짧으면 `scopeKey = "public"`이지만 교육과정 검색·공개 학습경로 같은 비저장 조회만 허용한다. 프로필·점검·계획·진행 기록의 저장과 자녀별 이력 조회는 차단한다.
- `NODE_ENV=production`에서는 `DATABASE_URL` 또는 `STORE_PATH`, 그리고 32바이트 이상의 `USER_SCOPE_SALT`가 없으면 서버가 시작하지 않는다.
- http.ts에서 요청별 헤더를 도구 핸들러에 전달해야 한다: AsyncLocalStorage(`node:async_hooks`) 기반 request context로 구현 (stateless 요청별 서버 생성 패턴과 호환).

## 7. 개인정보 (PRD §10)

- 프로필 스키마에 실명·학교명·연락처 필드를 두지 않는다. nickname 최대 20자.
- 프로필 create는 `guardianConsent=true`를 요구하고 동의 버전·시각을 저장한다.
- 모든 MCP 입력에서 이메일·전화번호·주민번호·카드번호로 보이는 값을 차단하고 원문을 오류에 되돌려 주지 않는다.
- `manage_child_profile` action=read 출력에 저장된 전체 필드 표시(투명성), action=delete는 cascade 삭제 후 삭제된 레코드 수 보고.
- 원문 대화 저장 금지: assess의 response 필드는 200자 절삭 저장.

## 8. 서버 (PRD §9)

- event-safety-check-mcp의 http.ts 포팅: `/mcp` POST(stateless streamable), `/health` GET → `{status:"ok",service:"learning-path-check-mcp",version:"0.1.0",tools:10,dataVersion:{elementary,middle,high,bridges}}`, 413(256KB), 404, 에러 위생(스택·경로 노출 금지), 0.0.0.0, PORT env.
- 그래프·검색 인덱스는 모듈 레벨 1회 로드. 요청 처리 중 외부 네트워크 호출 금지 (postgres 제외).
- package.json: `name: learning-path-check-mcp`, scripts { build: tsc(+compiled data가 build/로 복사되는지 확인), start, dev, typecheck, test, "compile:data": "bun scripts/compile-data.ts" }.
- Dockerfile: event-safety 것 포팅 (bun 멀티스테이지, 비루트, HEALTHCHECK).

## 9. 테스트 (PRD §13·§14 수용 기준)

`tests/graph.test.ts`:
- 참조 무결성: 모든 엣지 from/to 존재. 순환 없음(전체 prerequisite), 존재하지 않는 성취기준 코드 0건(출력 코드가 전부 컴파일 데이터에 존재).
- 분수 나눗셈류 초등 수학 개념의 역추적이 2단계 이상 나오는지.

`tests/tools.test.ts` (핸들러 직접 호출):
1. 프로필 CRUD + 삭제 cascade
2. search: 정상 / not_found / ambiguous / 직업계 범위 안내
3. overview: 초5 수학 — 영역·성취기준 포함, 프로필 이력 반영
4. trace: 초등·중등·고등 개념 선수경로 + 과정 수준 전이 응답 구분
5. check 생성 → outcome 조합별 판정(understood/review_needed/needs_more_info) → 가장 기초 개념이 첫 복습 지점
6. 재점검 delta: 같은 개념 재판정 시 improved 표시
7. plan: 위상정렬 순서, 기간 분배, calendarEvents 존재
8. progress 기록 → upcoming에 반영, 지연 항목 표시
9. report: 기간 집계, 금지 표현 부재, 이전 대비 변화
10. 스코프 격리: 다른 scopeKey에서 남의 childId 접근 불가
11. 결정성: 동일 입력(시간 필드 제외) 동일 출력 — trace/search/overview
12. ID 왕복: 모든 도구 출력의 Markdown 본문에 관련 ID 문자열 포함

`tests/http.test.ts`: /health, initialize(3버전), tools/list 10개+annotations, 413, 연속 시나리오(프로필→검색→trace→check→assess→plan→report를 HTTP로 연속 호출).

`tests/store.test.ts`: memory/file 드라이버 CRUD·격리·cascade (postgres는 DATABASE_URL 있을 때만 skip-if-absent).

## 10. 문서

- README.md: 제품 소개, 핵심 메시지("AI가 공부를 가르치기 전에, 무엇을 어떤 순서로 배워야 하는지부터"), 데이터 자산·버전, 도구 10개 표, 초·중·고 개념 관계와 과정 전이의 의미 구분, 실행법, env 표(DATABASE_URL/STORE_PATH/USER_SCOPE_SALT/PORT/TIME_ZONE), AI School 벤치마크 맥락 링크.
- NOTICE.md: 두 온톨로지 레포의 NOTICE·LICENSE-CONTENT 승계 + 교육부 고시·NCIC 출처 고지.

## 11. 완료 정의

```bash
bun run compile:data   # 형제 레포에서 1회 실행, 산출물 커밋
bun install && bun run typecheck && bun test && bun run build
bun run start  →  /health OK, /mcp tools/list 10개+annotations
# AI 채팅 시나리오: 데모 1~4 (PRD §12) 를 HTTP 연속 호출로 재현
```
- 커밋 단위: compile-data+데이터 / domain / store+identity / tools / server / tests / docs.

## 12. 작업 순서

1. event-safety-check-mcp에서 서버·설정 뼈대 포팅, package.json/tsconfig, `bun run typecheck` 통과
2. compile-data.ts + 산출물 생성·검증·커밋
3. domain(graph/search/judgment/question-builder/plan-builder) + 단위 테스트
4. store 3드라이버 + identity
5. tools 10개 + registry + presenters
6. http 연속 시나리오 테스트
7. Dockerfile·README·NOTICE
