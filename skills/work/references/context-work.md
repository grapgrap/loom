# 공통 업무 CLI 계약

`work`는 단독 업무와 위임 업무에 같은 목표·범위·완료 조건·보고 구조를 사용한다. 이 CLI에 등록된 업무는 managed: true로 표시된다. `orchestrate`는 이 업무들을 연결하고 배정하며 결과를 수락한다. 아래 명령은 [작업 맥락](context.md)의 CLI·프로젝트·데이터 루트를 그대로 사용한다. 명령 이름 앞에 `node "<plugin-root>/scripts/context/cli.ts"`를 붙인다.

## 업무를 정의하고 조회한다

`work create --work <id>`는 JSON을 stdin으로 받는다.

```json
{
  "expectedRevision": 0,
  "actor": "main",
  "source": { "type": "agent", "reference": "현재 사용자 요청" },
  "goal": "만료된 세션에서 보호 화면 접근을 차단한다.",
  "scope": "세션 검사와 화면 이동을 구현하고 실제 접근 경로를 확인한다.",
  "criteria": [
    {
      "id": "expired-session",
      "description": "만료된 세션으로 보호 화면에 진입하면 로그인 화면으로 이동한다.",
      "verification": "만료된 세션으로 보호 URL을 열고 최종 화면과 보호 데이터의 노출 여부를 관찰한다."
    }
  ],
  "next": ["현재 세션 검사와 화면 이동을 확인한다."]
}
```

create의 actor가 계획과 완료 판단을 맡는 owner가 된다. `goal`은 사용자 목표, `scope`는 맡긴 범위다. `criteria`는 하나 이상의 `{id, description, verification}`이며 ID를 중복하지 않는다. 설명에는 기대 결과를, verification에는 그 결과를 확인할 입력·환경·사용 경로를 적는다. 선택 필드인 `next`를 생략하면 목표를 첫 행동으로 둔다. 짧은 질문에는 별도 업무를 만들 필요가 없다.

하위 업무에는 `parent`, `contributesTo`, 필요한 경우 `dependsOn`을 추가한다. parent는 기존 상위 업무 ID, contributesTo는 그 업무의 조건 ID 배열, dependsOn은 기존 선행 업무 ID 배열이다. 상위 업무의 owner가 하위 업무를 정의한다. 부모·의존 관계의 순환과 존재하지 않는 참조는 거부한다. 하위 업무는 기본적으로 전체 완료에 필수다. 선택 업무를 정의할 때만 `required: false`를 명시한다.

`work show --work <id>`는 현재 업무와 직접 하위 업무, 선행 상태, `ready`, `blocked`, `awaitingReview`, `missingCriteria`를 반환한다. `--tree`는 모든 하위 업무를 `works`에 포함하며 무관한 업무는 포함하지 않는다. `--history`는 선택 업무의 이전 리비전도 반환한다. 상위 업무가 paused·cancelled면 하위 업무도 ready에서 제외하고 blocked의 stoppedBy에 원인을 표시한다. ready는 상태와 선행 조건에 따른 실행 후보이며 호스트에서 에이전트가 실행 중인지는 별도로 확인한다.

## 공통 변경 입력과 리비전

모든 변경 명령은 stdin JSON의 `expectedRevision`, `actor`, `source`를 요구한다. create는 expectedRevision 0, 이후 변경은 work show의 `work.revision`을 사용한다. actor는 소문자·숫자·하이픈으로 된 에이전트 식별자다. 호스트 실행 ID는 별도의 executionId에 보존한다. actor는 조율에서 합의한 담당자를 식별하는 값이며 인증 수단은 아니다.

각 변경은 새 업무 리비전과 `work:<id>@<revision>` ref를 반환한다. 이 ref는 read·search·graph·tidy의 근거로 사용할 수 있다. 같은 JSON 요청을 직후 재시도하면 리비전을 중복 추가하지 않는다. 충돌하면 현재 업무와 바뀐 정의·조건·보고를 읽고 조정한다. 예전 입력의 리비전 번호만 바꿔 재시도하지 않는다.

프로젝트의 업무와 관계는 하나의 잠금과 원자적 파일 교체로 갱신한다. 부모 완료 판정과 자식 변경도 이 저장 단위 안에서 처리한다. 파일 크기나 작업 수가 이 저장 방식의 실제 제약이 되면 저장 구현을 교체하되 업무 계약은 유지한다.

## 조건별로 보고한다

`work report --work <id>`는 수행자가 확인한 현재 진행·다음 행동과 조건별 관찰을 저장한다.

```json
{
  "expectedRevision": 1,
  "actor": "main",
  "source": { "type": "agent", "reference": "실제 실행 명령과 화면 관찰" },
  "progress": "만료된 세션의 보호 URL 접근을 확인했다.",
  "next": [],
  "checks": [
    {
      "criterionId": "expired-session",
      "verdict": "met",
      "observation": "로그인 화면으로 이동했고 보호 데이터가 노출되지 않았다.",
      "evidence": ["실제 명령 출력·화면 캡처·검증 기록의 위치"]
    }
  ]
}
```

verdict는 `met`·`unmet`·`unknown`이다. met에는 하나 이상의 증거가 필요하다. CLI는 증거의 문자열·조건 연결과 상태 일관성을 확인하며, 증거 내용이 기대 결과를 입증하는지는 에이전트가 판단한다. 선행 업무가 완료되지 않았으면 met 보고는 거부한다.

checks를 생략하거나 빈 배열로 전달하면 기존 조건 보고를 보존한다. 전달한 조건만 갱신하므로 유효한 다른 검증을 반복하지 않는다. 진행 설명·next만 바뀐 보고는 상위 검증을 무효화하지 않는다. 새로운 조건 보고는 기여하는 상위 조건과 그 결과에 의존하는 업무의 재확인을 요구한다.

`status`는 생략하거나 `active`·`blocked`·`paused`로 지정한다. blocked·paused는 progress에 이유와 재개 조건을, next에 남은 행동을 둔다. paused는 사용자의 보류 지시가 있을 때만 사용한다. submitted·complete·cancelled 상태에서는 보고로 수행을 재개하지 않는다.

## 단독 업무를 완료한다

`work complete --work <id>`에는 공통 변경 입력만 전달한다. owner가 실행하며 모든 조건이 met이고 next가 비어 있어야 한다. 선행 업무와 필수 하위 업무도 완료돼야 한다. 각 하위 업무가 끝났더라도 상위 업무 자체의 통합·사용 경로 조건은 별도로 보고한다.

`work cancel`은 공통 입력과 `reason`으로 취소 근거를 남기고 next를 비운다. 필수 자식을 취소해도 부모의 필수 조건이 충족되지는 않는다. `work reopen`은 owner가 reason과 함께 명시적으로 재개할 때 사용하며 이전 검증과 제출을 무효화한다. 보류·취소의 재개 권한은 현재 사용자 지시에서 확인한다.

## 위임하고 결과를 수락한다

1. owner가 `work assign --work <id>`에 공통 입력과 `worker`, `reviewer`를 전달한다. worker와 reviewer는 서로 달라야 한다. 조율자가 결과를 수락한다면 reviewer를 조율자 ID로 지정한다. 이후 조건 보고는 worker가 맡는다.
2. 호스트 도구로 작업자를 실행하고 `executionId`를 연결한다. 같은 worker·reviewer로 assign을 다시 호출해 실행 ID만 붙이면 기존 보고와 제출을 보존한다. 담당자를 바꾸면 이전 검증·제출을 무효화한다.
3. worker가 report로 조건을 확인하고 `work submit`에 공통 입력, `summary`, `artifacts` 배열을 전달한다. 완료와 같은 조건을 검사한 뒤 상태를 submitted로 바꾸고 정의 리비전·조건 보고·산출물을 제출에 고정한다. 반환된 `submission.ref`를 메인에게 전달한다.
4. reviewer가 실제 결과를 검토하고 `work accept`에 공통 입력, `submission`, `reason`, `evidence` 배열을 전달한다. submission은 현재 제출의 정확한 ref다. 수락하면 업무가 complete가 된다. assigned 업무는 complete 명령으로 이 단계를 건너뛸 수 없다.
5. 보완은 `work request-changes`에 공통 입력, `submission`, `reason`, 보완할 조건 ID 배열 `criteria`를 전달한다. criteria를 생략하면 모든 조건을 다시 확인한다. 상태는 active로 돌아가고 지정한 조건 보고를 지운다. worker가 보완·재보고·재제출하면 새 ref를 검토한다.

submitted는 미완료 업무지만 worker가 자동으로 다시 수행할 상태는 아니다. `recall.awaitingReviewWorks`와 work show의 awaitingReview에서 reviewer의 다음 행동을 확인한다. 메인은 호스트의 대기·알림 도구로 실행 상태를 확인하고, 새 결과를 업무 CLI에 대조한다. CLI는 에이전트를 실행하거나 메시지를 전송하지 않는다.

## 계획을 갱신하고 기록을 이어간다

`work revise`는 owner가 공통 입력·reason과 변경할 `goal`, `scope`, `criteria`, `contributesTo`, `dependsOn`, `required`를 전달한다. 업무 정의와 검증 대상을 바꾸는 동작이므로 해당 업무의 검증·제출을 무효화한다. 새로운 사용자 목표·권한이 필요한 선택은 먼저 사용자 지시를 확인한다.

조건·담당 변경, 재개, 새로운 검증 보고는 기여하는 상위 조건과 의존 업무의 검증도 무효화한다. 기여 조건을 바꾸면 이전·새 상위 조건을 모두 다시 확인한다. 영향받은 complete·submitted는 active로 돌아가고 새 리비전이 생긴다. 상위의 무관한 조건 보고는 보존한다. blocked·paused·cancelled는 기존 이유와 상태를 유지하며 재확인 이유만 recheckReason에 추가한다. 취소된 업무의 next는 비운 채 유지한다. 이전 제출은 새 조건이나 리비전의 결과로 수락할 수 없다. 상위 조건을 제거하려면 먼저 그 조건을 참조하는 하위 명세를 조정한다.

처리 과정의 판단·합의·출처는 기존 record로 계속 남긴다. 업무 CLI는 현재 정의·수행·검증·수락 상태를 소유하며, tidy는 그 이력을 근거로 기억과 그래프를 정리한다. tidy나 checkpoint가 managed 업무 상태를 덮어쓰는 요청은 거부한다.

기존 업무는 recall로 원문과 상태를 읽은 뒤 create에 `adopt: true`와 확인 가능한 새 명세를 전달해 전환한다. 기존 checkpoint ref와 기록은 보존한다. 이전 완료 선언을 새 조건의 met 증거로 자동 변환하지 않는다. 기존 업무를 전환하지 않으면 [이전 계약](context-legacy.md)을 계속 사용한다. 같은 프로젝트를 조율하는 에이전트는 이 업무 CLI를 지원하는 같은 버전을 사용한다.
