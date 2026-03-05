# concepts/index.md는 Index의 concept 정의 문서이다

## 맥락

concepts/index.md의 역할이 논의되었다. 처음에는 concept 목록과 관계도를 담는 실제 인덱스로 작성했으나, .loom/index.md가 루트 지도로 추가되면서 역할이 중복되었다.
두 파일의 책임을 분리할 필요가 있었다.

## 결정

concepts/index.md는 "Index란 무엇인가"를 설명하는 concept 정의 문서로 한다. 실제 도메인 지도는 .loom/index.md가 담당한다.

### 제약 조건

- .loom/index.md가 루트 진입점으로 이미 존재한다: 두 파일이 같은 역할을 하면 동기화 부담이 생긴다

### 전제 조건

- index가 독립된 도메인 엔티티로 인식된다: index의 정의, 책임, 설계 방향을 기술할 별도 문서가 필요하다

## 대안

### concepts/index.md를 실제 인덱스로 유지

- 설명: .loom/index.md를 두지 않고 concepts/index.md가 지도 역할을 겸한다
- 트레이드오프: .loom/index.md가 루트 진입점으로 이미 필요했고, 두 파일이 같은 역할을 하면 동기화 부담이 생긴다

### concepts/index.md를 제거하고 concept.md에 통합

- 설명: index 관련 내용을 concept.md의 한 섹션으로 흡수한다
- 트레이드오프: index는 concept과 다른 엔티티이므로 별도 문서가 자연스럽다

## 영향

- [[index]] - concept 정의 문서로서의 역할이 확정됨
- [[concept]] - index가 독립 엔티티로 추가됨
