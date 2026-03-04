# concepts/index.md는 Index의 concept 정의 문서이다

## 맥락
concepts/index.md의 역할이 논의되었다. 처음에는 concept 목록과 관계도를 담는 실제 인덱스로 작성했으나, .loom/index.md가 루트 지도로 추가되면서 역할이 중복되었다.

## 결정
concepts/index.md는 "Index란 무엇인가"를 설명하는 concept 정의 문서로 한다. 실제 도메인 지도는 .loom/index.md가 담당한다.

## 대안
- concepts/index.md를 실제 인덱스로 유지하고 .loom/index.md를 두지 않음 — 그러나 .loom/index.md가 루트 진입점으로 필요했고, 두 파일이 같은 역할을 하면 동기화 부담이 생긴다.
- concepts/index.md를 제거하고 concept.md에 통합 — 그러나 index는 concept과 다른 엔티티이므로 별도 문서가 자연스럽다.

## 영향
- [[index]] — concept 정의 문서로서의 역할이 확정됨
- [[concept]] — index가 독립 엔티티로 추가됨
