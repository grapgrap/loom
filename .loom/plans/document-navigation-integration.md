# 문서 탐색 도구의 선택적 통합

## 핵심 구조

loom의 스킬들(shape, plan, review, calibrate)은 모두 컨텍스트 로드 단계에서 `.loom/` 문서를 탐색한다.
현재는 grep/glob으로 수행하며, 토큰 경제성이 낮다.

navigation 스킬을 추가하여, 에이전트가 문서 탐색 시 설정된 도구를 활용하도록 안내한다.

### 도구 설정 모델

최초 실행 시 도구를 감지/선택하고, 프로젝트의 auto memory에 저장한다.
auto memory는 세션 시작 시 자동으로 컨텍스트에 로드되므로, 이후 실행에서 별도 파일 읽기 없이 바로 사용한다.

도구별 특성:
1. Obsidian CLI — 구조적 탐색 (links, backlinks, orphans). 앱 실행 필요.
2. qmd — 키워드/의미 검색. MCP 서버로 네이티브 통합. 독립 실행.
3. grep/glob — 폴백. 항상 가용. 설정 불필요.

navigation 스킬은 사용자가 직접 호출하지 않는다. 에이전트가 문서 탐색이 필요할 때 참조하는 내부 스킬이다.

## 파일 구조

```
skills/
├── navigation/SKILL.md   ← 신규
├── shape/SKILL.md         ← 수정 (Step 0에 navigation 참조 추가)
├── plan/SKILL.md          ← 수정 (Step 0에 navigation 참조 추가)
├── review/SKILL.md        ← 수정 (컨텍스트 로드에 navigation 참조 추가)
└── calibrate/SKILL.md     ← 수정 (컨텍스트 로드에 navigation 참조 추가)
```

## 작업 목록

### 1. navigation 스킬 작성

#### 작업 견적

- 도구별 명령어 매핑: 낮음 — shape 과정에서 이미 조사 완료
- 폴백 전략 기술: 낮음 — 선형 우선순위

#### 작업 순서

- 의존: 없음
- 병렬: 없음

#### 세부 작업 목록

- [x] `skills/navigation/SKILL.md` — 에이전트 내부 스킬. 도구별 사용법과 설정 모델 기술.
  - description: 에이전트가 .loom 문서를 탐색할 때 참조하는 내부 스킬임을 명시
  - 초기 설정: auto memory 확인 → 없으면 도구 감지 → 감지 결과와 각 도구의 특성을 사용자에게 안내 → 사용자가 선택 → memory에 저장
  - 설정 이후: memory에 기록된 도구만 사용
  - 도구별 명령어 매핑:
    - 백링크: obsidian `backlinks` / qmd `search --files` / grep
    - 정방향 링크: obsidian `links` / qmd `get` + 위키링크 추출 / grep
    - 검색: obsidian `search` / qmd `search`·`query` / grep
    - 건강 점검: obsidian `orphans`·`unresolved`·`deadends` / 셸 스크립트

### 2. 기존 스킬 컨텍스트 로드 수정

#### 작업 견적

- 수정 범위: 낮음 — 각 스킬의 Step 0에 1~2줄 추가

#### 작업 순서

- 의존: 1
- 병렬: 4개 스킬 수정은 서로 병렬 가능

#### 세부 작업 목록

- [x] `skills/shape/SKILL.md` — Step 0 컨텍스트 로드에 navigation 스킬 참조 추가
- [x] `skills/plan/SKILL.md` — Step 0 컨텍스트 로드에 navigation 스킬 참조 추가
- [x] `skills/review/SKILL.md` — 컨텍스트 로드에 navigation 스킬 참조 추가
- [x] `skills/calibrate/SKILL.md` — 컨텍스트 로드에 navigation 스킬 참조 추가

### 3. 검증

#### 작업 견적

- 검증 시나리오: 낮음 — 도구 유무 2가지 경우

#### 작업 순서

- 의존: 2

#### 세부 작업 목록

- [ ] qmd가 설정된 환경에서 shape 실행 → 컨텍스트 로드 시 qmd 활용 확인
- [ ] Obsidian이 실행된 환경에서 backlinks 조회 → obsidian CLI 활용 확인
- [ ] 도구 없는 환경에서 shape 실행 → grep 폴백 동작 확인

## 참조

- decision 0014 — 문서 탐색 도구는 선택적·교체 가능하게 제공한다

## 검증

- navigation 스킬이 로드되었을 때, 에이전트가 grep 대신 가용한 도구를 사용하는가
- 도구가 없을 때, 기존 동작(grep)이 깨지지 않는가
- 스킬 참조가 컨텍스트 로드의 토큰 비용을 오히려 늘리지 않는가
