# Skill은 concept으로 정의하지 않는다

## 맥락

loom 초기 셋업에서 도메인 엔티티를 식별할 때, skill(shape, plan, review, meditate)을 concept으로 포함할지 논의했다.
skill도 loom의 구성 요소이므로 concept으로 정의할 수 있는지가 쟁점이었다.

## 결정

skill은 concept으로 정의하지 않는다. concept은 concept, decision, plan, principle 4개만 둔다.

### 제약 조건

- concept은 도메인 엔티티를 정의하는 문서다: skill은 도메인 엔티티가 아니라 loom의 "코드"에 해당한다

### 전제 조건

- skill과 concept의 성격이 구분된다: skill은 프로세스(동사)이고 concept은 엔티티(명사)이다

## 대안

### skill을 concept으로 포함

- 설명: skill 자체의 변경도 shape → plan → review 루프를 타게 하여 일관성을 높인다
- 트레이드오프: skill은 loom의 코드에 해당하므로 concept과 성격이 다르다. 오버헤드가 이점보다 크다

## 영향

- [[concept]] - 도메인 엔티티 목록에서 skill 제외
