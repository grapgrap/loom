# Review의 reflect에서 원칙 생성을 제거

## 맥락

review의 reflect가 "원칙으로 축적한다"로 프레이밍되어 있어서,
매 review마다 원칙을 만들어야 한다는 강박이 발생했다.
review는 세션당 한 번 실행되는데, 단일 세션에서 "반복적 패턴"을 발견하는 것은 구조적으로 불가능하다.

brainmaxxing에서는 reflect(세션 학습 추출)와 ruminate/meditate(원칙 증류)가 분리되어 있었다.

## 결정

review의 reflect 역할을 두 가지로 재정의한다:
1. 기존 원칙 검증 — 이번 세션의 경험이 기존 원칙과 부합하는지 확인, 불일치 시 수정
2. 세션 학습 축적 — concept/decision 보완 + auto memory에 교훈 기록

새 원칙 생성은 reflect에서 하지 않는다. auto memory에 축적된 후 calibrate에서 증류한다.

### 제약 조건

- 세션 간 학습 전달이 필요하다: auto memory가 중간 저장소 역할을 한다

### 전제 조건

- auto memory가 세션 간 영속한다: Claude Code의 auto memory 메커니즘이 유효하다

## 대안

### reflect에서 원칙 생성을 유지하되 기준만 높인다

- 설명: 축적 기준을 강화하여 가벼운 원칙이 생성되지 않도록 한다
- 트레이드오프: 기준을 아무리 높여도 "매 review에서 원칙을 찾아야 한다"는 구조적 압력이 남는다

## 영향

- [[principle]] - 원칙 생성 경로가 review에서 calibrate로 이동
