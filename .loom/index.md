# Index

프로젝트의 도메인 엔티티와 그 관계를 기술하는 지도.

## 목록

- [[index]] — 디렉토리의 진입점, 항목과 관계를 요약하는 탐색 지도
- [[concept]] — 프로젝트의 도메인 엔티티를 정의하는 영속 문서
- [[decision]] — 컨셉 변경의 결정 맥락을 기록하는 횡단 문서
- [[plan]] — 설계를 실행 가능한 태스크로 구조화한 문서
- [[principle]] — 경험에서 축적되는 범용적 교훈

## 관계

```
principle ──판단 근거──→ concept
                          ↕ 변경 맥락
                       decision
                          ↓ 설계 의도
concept ──범위 한정──→ plan
```

- **concept**이 중심이다. 프로젝트가 다루는 세계의 구성 요소를 정의한다.
- **decision**이 concept의 변경을 횡단적으로 기록한다. 여러 concept에 걸칠 수 있다.
- **plan**이 concept과 decision을 참조하여 실행 단위를 구성한다.
- **principle**이 모든 판단의 근거가 된다. review에서 축적되고 meditate에서 정제된다.
