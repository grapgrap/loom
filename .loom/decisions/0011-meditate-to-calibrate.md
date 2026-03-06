# Meditate를 calibrate로 전환 — concept 감사를 메인 역할로

## 맥락

meditate는 원칙 감사 전용 스킬이었다. 그러나 concept도 세션이 쌓이면서 코드와 괴리가 생기고,
책임이 겹치거나 관계가 누락될 수 있다. concept 전체의 건강 상태를 점검하는 역할이 없었다.

review가 세션의 끝에서 구현을 검증하듯, concept/코드의 축적된 괴리를 교정하는 스킬이 필요했다.

## 결정

meditate를 calibrate로 전환한다.
- 메인 역할: concept과 코드의 정합성 감사. 괴리 발견 → decision 최신순 원인 추적 → 리포트 제안 → 승인 후 교정
- 부차적 역할: 기존 원칙 검증 + auto memory에서 원칙 증류
- concept 변경 시 새 decision 생성. 기존 decision은 수정하지 않는다.

### 제약 조건

- concept 교정은 리포트 후 사용자 승인이 필요하다: concept은 프로젝트의 공유 어휘이므로 자동 변경하지 않는다

### 전제 조건

- decision이 concept 변경의 이력 역할을 한다: 괴리의 원인을 decision에서 추적할 수 있다

## 대안

### meditate와 별도 concept 감사 스킬을 분리

- 설명: meditate는 원칙 감사로 유지하고, concept 감사 스킬을 새로 만든다
- 트레이드오프: 스킬 수가 늘어나고, 원칙 검증이 두 곳에서 중복될 수 있다

## 영향

- [[concept]] - calibrate가 concept의 건강 상태를 정기적으로 점검한다
- [[decision]] - calibrate가 concept 교정의 근거로 decision을 최신순 추적한다
- [[principle]] - 원칙 증류 경로가 calibrate로 이동한다
