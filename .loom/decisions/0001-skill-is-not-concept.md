# Skill은 concept으로 정의하지 않는다

## 맥락
loom 초기 셋업에서 도메인 엔티티를 식별할 때, skill(shape, plan, review, meditate)을 concept으로 포함할지 논의했다.

## 결정
skill은 concept으로 정의하지 않는다. concept은 concept, decision, plan, principle 4개만 둔다.

## 대안
- skill을 concept으로 포함 — skill 자체의 변경도 shape → plan → review 루프를 타게 된다. 그러나 skill은 loom의 "코드"에 해당하므로, concept(도메인 엔티티)과 성격이 다르다. 오버헤드가 이점보다 크다고 판단.

## 영향
- [[concept]] — 도메인 엔티티 목록에서 skill 제외
