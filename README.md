# Learning Path Check — 우리 아이 뭐 배우지? 체크

> AI가 공부를 가르치기 전에, 무엇을 어떤 순서로 배워야 하는지부터 정확히 알아야 합니다.

대한민국 2022 개정 교육과정 기반의 초·중·고 학습 경로 MCP 서버입니다. 교육과정 검색에서 끝나지 않고 자녀별 확인 질문, 결정론적 상태 판정, 복습 계획, 진행 기록, 재점검 일정, 주간·월간 학부모 리포트까지 이어집니다.

이 서비스는 성적이나 학생의 능력을 판정하지 않습니다. 원천 데이터에 저장된 관계·질문·증거만 사용하며, 관계나 성취기준을 요청 시점에 생성하지 않습니다.

## 데이터 범위

런타임은 외부 교육과정 저장소나 웹에 접속하지 않고 빌드에 포함된 읽기 전용 데이터만 조회합니다.

| 학교급 | P0 토픽 | P0 과정 노드 | 선수관계 |
|---|---:|---:|---:|
| 초등 | 1,956 | 11 | 1,894 |
| 중학교 | 2,160 | 24 | 2,155 |
| 고등학교 지원 범위 | 3,124 | 231 | 2,932 |

추가로 초등→중학교 개념 관계 19건, 중학교→고등학교 전이 50건, 고등학교 과정 관계 39건, 교과 연속성 관계 11건을 포함합니다. 전체 컴파일 결과는 개념 7,506개와 관계 7,100개입니다.

- 초등 데이터: `kr-full-depth-v0.4`
- 중학교 데이터: `kr-2022-middle-v0.4.0-candidate`
- 고등학교 데이터: `kr-2022-high-v0.4.0-candidate`
- 학교급 브리지: `kr-2022-middle-high-bridge-v0.4.0-candidate`
- 고등학교 P0는 공통·일반·진로·융합 선택 및 교양·계열 과목을 지원합니다. 직업계 전문교과 528과목·47,625토픽은 제외하고 범위 안내를 반환합니다.
- 중학교 성취기준은 7~9학년군 단위이므로 개별 학년 배정을 단정하지 않습니다. 고등학교 과목의 실제 편성 학년은 학교마다 다를 수 있습니다.
- `required-prerequisite`, `recommended-before`, 과정 전이를 구분하며 과정 전이는 공식 이수 요건으로 표현하지 않습니다.

공식 기준은 [교육부 2022 개정 교육과정 고시](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=141&boardSeq=93458&lev=0)와 [국가교육과정정보센터(NCIC)](https://ncic.re.kr/?m=4)를 확인하세요. 이 저장소의 해석은 교육부·국가교육위원회·NCIC의 승인이나 공식 해석이 아닙니다.

## MCP 도구

| 도구 | 역할 | 상태 변경 |
|---|---|---|
| `manage_child_profile` | 최소 정보 자녀 프로필 CRUD·연쇄 삭제 | 예 |
| `search_curriculum` | 자연어·과목·성취기준 검색과 모호성 처리 | 아니요 |
| `get_curriculum_overview` | 학교급·학년·과목 개요와 점검 이력 표시 | 아니요 |
| `trace_learning_path` | 선수·후속·학교급 전이와 근거 추적 | 아니요 |
| `create_learning_check` | 원천 질문·증거 기반 점검 생성 | 예 |
| `assess_learning_check` | `outcome` 기반 상태·변화·재점검일 저장 | 예 |
| `build_review_plan` | 선수순 복습 계획과 캘린더 데이터 생성 | 예 |
| `record_learning_progress` | 활동 상태와 보호자 관찰 기록 | 예 |
| `get_upcoming_learning_actions` | 지연·오늘·예정 활동과 재점검 조회 | 아니요 |
| `get_parent_learning_report` | 주간·월간 변화와 다음 우선순위 요약 | 아니요 |

`assess_learning_check`는 자유 텍스트를 채점하지 않습니다. 호출 클라이언트가 답변을 `ok | partial | fail | unknown` 중 하나로 매핑해야 하며, 서버는 그 값만 결정론적으로 상태에 반영합니다.

## 실행

요구 사항은 Bun 1.3 이상입니다.

```bash
bun install --frozen-lockfile
bun run verify
bun run start
```

개발 서버는 `bun run dev`, 데이터 원천을 다시 컴파일할 때만 `bun run compile:data`를 사용합니다. 컴파일에는 형제 저장소 `../korean-elementary-learning-map`, `../korean-secondary-learning-map`이 필요하지만, 일반 빌드와 실행에는 필요하지 않습니다.

기본 엔드포인트:

- `POST /mcp` — stateless Streamable HTTP MCP
- `GET /health` — 서비스·도구 수·데이터 버전

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | HTTP 포트 |
| `TIME_ZONE` | `Asia/Seoul` | 날짜를 생략한 계획·리포트의 기준 시간대 |
| `DATABASE_URL` | 없음 | 설정 시 PostgreSQL 영속 저장소 사용 |
| `STORE_PATH` | 없음 | DB가 없을 때 원자적 JSON 파일 저장소 사용 |
| `USER_SCOPE_SALT` | 개발용 고정값 | 전달된 사용자 식별자를 내부 스코프 키로 해시할 때 사용 |

저장소 우선순위는 `DATABASE_URL` → `STORE_PATH` → 프로세스 메모리입니다. 운영에서는 `DATABASE_URL`과 임의의 긴 `USER_SCOPE_SALT`를 설정하세요. 식별 헤더가 없으면 비추측성 `childId`가 접근 권한 역할을 하는 공개 스코프 모드로 동작합니다.

인식하는 사용자 식별자는 `x-playmcp-user-id`, `x-user-id`, `x-forwarded-user`, Bearer JWT의 `sub` 순서입니다. JWT 서명을 인증하는 기능은 아니므로 배포 경계의 인증 프록시가 헤더를 신뢰할 수 있게 보장해야 합니다.

## Docker

```bash
docker build -t learning-path-check-mcp .
docker run --rm -p 8080:8080 \
  -e USER_SCOPE_SALT='replace-with-a-long-random-value' \
  learning-path-check-mcp
```

## 검증과 재현성

```bash
bun run compile:data
bun run typecheck
bun test
bun run build
```

컴파일러는 모든 관계 종점, 중복 ID, 자기 순환, 15 MiB 산출물 상한을 검사합니다. 테스트는 선수관계 DAG, 성취기준 코드 존재, 저장소 격리·연쇄 삭제, 10개 도구 annotations, 256 KiB 본문 제한, HTTP 연속 시나리오를 검증합니다. 현재 후보 릴리스 근거와 해시는 [릴리스 기록](docs/release/v0.1.0-candidate.md)에 있습니다.

[DEXA AI School 벤치마크의 제품 맥락](docs/PRD.md#11-경쟁-포지셔닝)은 PRD에 기록되어 있습니다. 벤치마크 원본은 이 저장소에 포함하지 않습니다.

## 권리와 고지

서버 코드는 [MIT License](LICENSE)입니다. 컴파일 교육과정 데이터에는 같은 라이선스가 적용되지 않으며, 원천별 ODbL·CC BY-SA 조건과 공식 문서 권리 보류가 있습니다. 배포 전 반드시 [NOTICE](NOTICE.md)를 확인하세요.
