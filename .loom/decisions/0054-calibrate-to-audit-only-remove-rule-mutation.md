# calibrate를 누적 감사·리포트 전용으로 한정하고 rule·convention 변경을 제거한다

## 맥락

reflect 제거(0053)로 review가 검증·보고 전용이 되었다. 그러나 calibrate는 concept·decision은 리포트만 하면서(직접 변경하지 않고 shape 재진입으로 넘김), rule·convention만 직접 검증·수정·제거하는 비대칭을 남기고 있었다. review가 rule을 위반 분류(보고)만 하는 것과도 어긋났다.

이 비대칭의 뿌리는 한 Step(Step 3 "rule·convention 검증")이 두 성질을 섞고 있었던 데 있다. rule을 **기준**으로 누적 감사를 진행하는 일(잣대)과, rule을 **대상**으로 검증·생성·수정·제거하는 일(목적어)이 같은 자리에 있었다. 실제로 Step 3의 "룰 카탈로그 활용" 절차는 마지막 단계가 "본문에 따라 누적 감사를 진행한다"로, 본래 누적 감사(Step 2)를 위한 기준 활용이었다.

## 결정

calibrate를 누적 감사·리포트 전용으로 한정한다. rule을 기준으로 한 감사는 유지하고, rule을 대상으로 한 검증·변경은 제거한다.

- rule을 **기준**으로 한 감사(잣대)는 유지한다: Step 1(룰 카탈로그 로드)을 남기고, Step 3에 있던 "룰 카탈로그 활용" 절차를 Step 2(누적 감사)로 옮겨 누적 감사가 rule을 기준으로 진행함을 본문에 드러낸다.
- rule을 **대상**으로 한 검증·변경(목적어)은 제거한다: 기존 rule·convention 검증(중복·충돌·낡음), 신규 발견, 제거 제안을 삭제한다. rule·convention의 생성·변경은 shape 전담으로 남는다(0053과 정합).
- description과 본문의 "교정한다" 표현을 "감사·리포트"로 정정한다 -- calibrate는 무엇도 직접 고치지 않고, 교정 방향은 사용자가 shape 재진입으로 판단한다.
- 그래프 갱신 단계는 조건부 안전망(`.loom`을 변경한 경우 sync)으로 유지한다 -- 다른 스킬과 일관된 패턴이다.

## 전제 조건

- rule·convention의 생성·변경은 shape 전담으로 충분하다(0053): review·calibrate는 감사·보고만 하고, 합의는 shape에서 일어난다
- rule의 누적 건강은 전용 감사 없이도 감지된다: review가 매 세션 위반 분류로 rule을 마주치고, shape이 설계 때 rule을 활용하는 접점에서 낡음·충돌이 드러난다

## 제약 조건

- rule·convention을 대상으로 한 전용 누적 감사(중복·충돌·낡음 점검)가 사라진다
  - 제약이 없었다면: rule 누적 감사를 어딘가 두었겠으나, rule은 수가 적고 사용자가 직접 쥐는 합의 잔고라 전용 단계의 값어치가 그 비용을 넘지 않는다

## 대안

### Step 3 전체(룰 카탈로그 활용 포함)를 삭제

- 설명: Step 1과 Step 3를 함께 지워 calibrate에서 rule을 완전히 들어낸다
- 트레이드오프: 누적 감사의 기준 자체가 rule인데 룰 카탈로그가 사라지면 감사가 잣대를 잃는다. 기준 활용과 대상 변경을 구분하지 못한 처리다

### rule 검증·변경을 calibrate에 유지

- 설명: 비대칭을 그대로 두고 calibrate가 rule을 직접 검증·수정·발견한다
- 트레이드오프: review는 보고만 하는데 calibrate만 rule을 직접 바꾸는 비대칭이 남는다. concept·decision은 shape로 보내면서 rule만 직접 고치는 일관성 결여가 유지된다

## 영향

- calibrate - Step 3 제거. 룰 카탈로그 활용을 Step 2로 이전. description·본문의 "교정" 표현 정정. Summary의 Rules 블록 제거. 누적 감사·리포트 전용이 됨
- [[0053-defer-self-learning-loop-remove-reflect]] - review를 검증·보고 전용으로 만든 결정과 나란히 calibrate를 감사·리포트 전용으로 정렬 (계승)
