# Index

프로젝트의 도메인 엔티티와 그 관계를 기술하는 지도.

## 목록

- [[index]] — 디렉토리의 진입점, 항목과 관계를 요약하는 탐색 지도
- [[concept]] — 도메인을 정적으로 정의하는 영속 문서 (분해)
- [[flow]] — 도메인들을 시간 위에서 합성하는 경로 (조합)
- [[decision]] — concept과 flow의 변경 맥락을 기록하는 횡단 문서
- [[plan]] — 설계를 실행 가능한 태스크로 구조화한 문서
- [[rule]] — 항상 지켜져야 하는 강제적 합의
- [[convention]] — 강하게 권장되지만 대체 가능한 형태

## 관계

```
  concept (분해) <--> flow (조합)
          \           /
         decision (변경 맥락)
               |
             plan
               ^ 자동 참조
         rule · convention
```

- **concept**과 **flow**가 대등한 두 축이다. concept이 도메인을 정적으로 분해하고, flow가 그 도메인들을 시간 위에서 조합한다. 어느 것도 중심이 아니다.
- **decision**이 concept과 flow의 변경을 횡단적으로 기록한다. 여러 엔티티에 걸칠 수 있다.
- **plan**이 concept·flow·decision을 참조하여 실행 단위를 구성한다. concept과 flow가 plan의 범위를 한정한다.
- **rule·convention**은 각 스킬이 룰 카탈로그 로드 단계에서 인지하는 합의 잔고다. 강제성 축에서 rule이 무거운 자리, convention이 가벼운 자리이며, `.loom/rules/` 폴더에 보관된다.
- 누적된 decision이 새 rule·convention의 판단 기준 역할을 한다. 별도의 "원칙" 엔티티는 두지 않으며, 깊은 판단 근거는 사용자 본인의 영역에 머문다.
