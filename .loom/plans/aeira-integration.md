# aeira 인프라 통합

## 핵심 구조

aeira는 `.loom/` 문서의 위키링크를 방향 그래프로 구축하여 탐색하는 CLI 도구.
loom 스킬이 맥락을 로드할 때(Step 0) aeira를 활용하고, 문서를 변경할 때 그래프를 갱신한다.

활용 프리미티브:
- `aeira search "키워드"` — 진입점 확보 (키워드 기반 문서 검색)
- `aeira graph neighbors {node}` — 연결된 문서 탐색 (1-hop 이웃)
- `aeira sync` — 그래프 갱신 (문서 변경 후 강제)

대상 범위: `.loom/` 내 문서만 (concepts, decisions, plans, index)

## 작업 목록

### 1. aeira init 및 최초 sync

#### 작업 견적

- 설정: 낮음 — CLI 명령 두 줄

#### 작업 순서

- 의존: 없음
- 병렬: 2, 3과 독립

#### 세부 작업 목록

- [x] `aeira init .loom` — source 경로 등록
- [x] `aeira sync` — 최초 그래프 구축

### 2. 스킬 Step 0에 aeira 탐색 추가

#### 작업 견적

- 패턴 설계: 보통 — 기존 grep 기반 탐색을 aeira로 대체하는 표현 확정
- 적용: 낮음 — 5개 스킬에 동일 패턴 삽입

#### 작업 순서

- 의존: 없음 (스킬 파일 수정은 init과 무관)
- 병렬: 3과 동시 불가 (같은 파일 수정)

#### 세부 작업 목록

- [x] skills/shape/SKILL.md — Step 0에 aeira 탐색 단계 추가
- [x] skills/plan/SKILL.md — Step 0에 aeira 탐색 단계 추가
- [x] skills/task/SKILL.md — Step 0에 aeira 탐색 단계 추가
- [x] skills/review/SKILL.md — Step 0에 aeira 탐색 단계 추가
- [x] skills/calibrate/SKILL.md — Step 0에 aeira 탐색 단계 추가

### 3. 문서 변경 후 sync 호출 강제

#### 작업 견적

- 삽입 지점 식별: 보통 — 각 스킬의 문서 변경 시점이 다름
- 적용: 낮음 — 한 줄 지시 삽입

#### 작업 순서

- 의존: 2 (같은 파일 수정, 순차 진행)
- 병렬: 없음

#### 세부 작업 목록

각 스킬의 문서 변경 시점:
- [x] skills/shape/SKILL.md — Step 3 (concept/decision/index 생성/수정 후)
- [x] skills/plan/SKILL.md — Step 3 (plan 파일 생성 후)
- [x] skills/task/SKILL.md — Step 1 (decision 기록 후)
- [x] skills/review/SKILL.md — Step 3 (세션 학습 축적 후)
- [x] skills/calibrate/SKILL.md — Step 1 (교정 수행 후)

### 4. 정규화 점검

#### 작업 견적

- 점검: 낮음 — 5개 파일 나란히 비교

#### 작업 순서

- 의존: 2, 3
- 병렬: 없음

#### 세부 작업 목록

- [x] 5개 스킬의 aeira 관련 표현·순서·경로 일관성 확인
- [x] 불일치 발견 시 교정 (plan sync 표현 통일)

## 검증

- `aeira search "concept"` 실행 시 `.loom/concepts/` 문서가 반환되는가
- `aeira graph neighbors concept` 실행 시 연결된 decision/plan이 나오는가
- 스킬 실행 후 문서 변경이 `aeira sync` 없이도 그래프에 반영되지 않음을 확인 (sync 강제의 필요성 검증)
