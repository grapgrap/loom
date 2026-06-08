# Plan: loom에 flow(조합 축) 도입

## 목표

loom이 도메인 분해(concept)만 일급으로 다루던 것을, **도메인 간 조합(flow)도 일급으로 다루도록 확장**한다. 분해와 조합을 함께 산출하여, 그동안 갈 곳 없어 decision으로 표류하던 "흐름"을 제자리에 정주시킨다.

## 달성되어야 하는 것 (완료 조건)

1. flow가 concept과 대등한 산출물 축으로 확립된다 (산출물 체계).
2. 모든 스킬(shape·plan·task·review·calibrate)이 flow를 산출·참조·검증한다.
3. loom 자신의 `.loom` 문서들이 새 체계와 일관된다 (메타 정의 포함).
4. 변경이 커밋되어 보존된다.

## 배경 — 왜 이렇게 결정했나 (핵심 맥락)

- **문제**: 요구사항을 도메인으로 분해(concept)했으나, 도메인들이 *어떤 순서로 맞물려 흐르는지*(시퀀스/플로우)를 담을 자리가 없었다. 그 결과 흐름이 decision으로 표류했다 (여러 프로젝트에서 decision이 concept을 최대 8배 압도).
- **진단**: DDD는 분해(bounded context)와 조합(domain message flow)을 짝으로 다루는데, loom은 분해만 일급화 — 전략적 설계의 절반만 구현.
- **핵심 개념** (확정됨):
  - **concept** = 도메인의 정적 정의. 항목: 목적·책임·정책·경계. 닫힌 노드. 시점 무관 스냅샷.
    - 책임=달성(Do), 정책=준수 규칙(invariant/policy 통합), 경계=하지 않는 것(Don't).
  - **flow** = 도메인 간 흐름. 항목: 목적·단계. 경로. **단계는 도메인 경계 횡단 수준이며 내부 구현은 담지 않는다**(코드와의 drift 방어).
  - flow는 concept의 경계를 드러내는 렌즈 — 분해와 조합은 상호 규정적.
  - 프랙탈: concept도 flow도 재귀적으로 합성된다. **변이 = sub flow**(별도 항목 아님).
  - flow 입자성 = 하나의 완결된 흐름(트리거에서 결과까지).
  - 다축: "concept이 중심"이라는 단일 위계를 해체, concept과 flow는 그래프 위 대등한 두 축.
- **목적의 토대**: 영속화의 목적은 코드 동기화가 아니라 *만드는 이들 사이의 정렬*(같은 맥락 -> 같은 것). drift는 해상도 차이라 어느 정도 수용 가능하고, calibrate가 고수준 모순만 잡는다.
- **검증됨**: 클린 컨텍스트 서브에이전트로 concept(책임/정책 변별)과 flow(도메인 간 단계 입자성) 템플릿이 의도대로 작동함을 확인 (청구·entitlement·체크아웃).
- **관련 decision**: 0048(flow 도입과 다축), 0049(concept·flow 항목 구조), 0050(shape Step 3 재편).

## 완료된 것

- [x] `templates/concept.md` 개정 (목적·책임·정책·경계·관계)
- [x] `templates/flow.md` 신설 (목적·단계)
- [x] `.loom/concepts/flow.md` 신설 (flow concept 정의)
- [x] `.loom/concepts/concept.md` 갱신 (새 구조 + flow 관계)
- [x] `.loom/index.md` 갱신 (다축, 중심 해체)
- [x] decision 0048, 0049
- [x] `skills/shape/SKILL.md` 개정 — Step 3을 "흐름과 경계 수립"(흐름 도출 -> 경계 식별 -> 괴리 조정 -> 반복 종료)으로 재편, Step 4에 flow 산출 추가, Summary에 Flows
- [x] decision 0050
- [x] 커밋 `06ceab4` (묶음 A). **shape 개정 + 0050은 아직 미커밋.**

## 남은 태스크

### Phase 1 — 스킬 flow 반영 (병렬 가능, 각 스킬을 읽고 손봄)

shape 같은 재편이 아니라 *flow를 참조 대상에 추가*하는 수준. 단 각 스킬의 결에 맞게.

- [ ] `skills/plan/SKILL.md` — Step 0 컨텍스트 로드에 flow 읽기, Step 2 분해 시 flow를 참조(흐름의 단계가 태스크 구성의 단서), 관련 문서에 flow 추가
- [ ] `skills/task/SKILL.md` — 구현 시 관련 flow를 참조(흐름이 도메인 협력의 방향을 제공)
- [ ] `skills/review/SKILL.md` — 구현이 관련 flow를 충족하는지 검증 항목 추가
- [ ] `skills/calibrate/SKILL.md` — flow와 코드의 괴리 점검 추가 (concept과 동일한 방식)

### Phase 2 — 메타 정의 일관성 (묶음 A 잔여, 기계적)

concept 템플릿 변경(0049)의 파급. 각 메타 정의를 새 항목 구조(목적·책임·정책·경계)로 다시 쓰고 flow를 참조.

- [ ] `.loom/concepts/decision.md` — "concept과 flow의 변경 맥락" 반영, 새 구조 갱신
- [ ] `.loom/concepts/plan.md` — flow 참조 추가, 새 구조 갱신
- [ ] `.loom/concepts/rule.md`, `convention.md` — flow에도 적용됨을 반영, 새 구조 갱신

### Phase 3 — 마무리

- [ ] 전체 커밋 (전역 gitignore의 `.loom/` 때문에 새 `.loom` 파일은 `git add -f` 필요)
- [ ] (선택) `README.md` / `README.ko.md` — Components에 flow 추가, Work Flow 설명 갱신
- [ ] (선택) 스킬 개정 후 서브에이전트 클린 검증 (concept/flow 템플릿 검증과 같은 방식)

## 의존관계

- Phase 1과 2는 서로 독립 — 병렬 진행 가능.
- Phase 3(커밋)은 1·2 이후. 단 shape 개정 + 0050 커밋은 **즉시 가능**(별도로 먼저 커밋해도 됨).
- 크리티컬 패스: Phase 1 (스킬 4개) -> Phase 3.

## 열린 질문 / 판단 필요

- 메타 정의(decision·plan·rule·convention)를 새 구조로 *지금* 다 갱신할지, 아니면 calibrate가 점진적으로 잡게 둘지 (Phase 2의 범위).
- 전역 `~/.gitignore.global`의 `.loom/` 근본 해결: 프로젝트 `.gitignore`에 negation을 둘지, 전역 규칙을 조정할지. (현재는 매 `.loom` 추가 시 `-f` 우회 중.)
- loom 자신의 `.loom`을 aeira vault로 초기화할지 (현재 미초기화라 `aeira sync` 보류 중).
