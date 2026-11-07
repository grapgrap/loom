# 위임 업무 계약

위임한 업무를 배정하거나 제출하고 검토할 때 읽는다. 공통 입력과 리비전, 조건별 검증의 의미는 [업무 계약](context-work.md)을 따른다. 명령별 JSON 예와 필드는 `work <명령> --help`로 확인한다.

## 위임하고 결과를 수락한다

1. owner인 조율자가 `work assign --work <id>`에 공통 입력과 `worker`, `reviewer`를 전달한다. worker와 reviewer는 서로 달라야 한다. 조율자가 직접 검토한다면 reviewer를 조율자 ID로 지정한다. 두 필드는 수행과 검토의 담당자를 식별하며 CLI 변경 권한을 부여하지 않는다.
2. 조율자가 호스트 도구로 작업자를 실행하고 `executionId`를 연결한다. 같은 worker와 reviewer로 assign을 다시 호출해 실행 ID만 붙이면 기존 보고와 제출을 보존한다. 담당자를 바꾸면 이전 검증과 제출을 무효화한다.
3. 작업자는 `work show`, `recall`, `search`, `read`, `graph`로 현재 명세와 근거를 읽고, 읽은 명세의 ref와 조건별 관찰, 근거, 산출물과 남은 일을 호스트로 반환한다. 조율자가 현재 명세와 대조하여 report를 저장한다. 결과가 준비되면 조율자가 `work submit`에 공통 입력, `summary`, `artifacts` 배열을 전달한다. CLI가 완료와 같은 조건을 검사한 뒤 상태를 submitted로 바꾸고 정의 리비전, 조건 보고와 산출물을 제출에 고정한다.
4. reviewer가 실제 결과를 검토하고 조율자가 `work accept`에 공통 입력, `submission`, `reason`, `evidence` 배열을 전달한다. reviewer가 별도 서브 에이전트라면 검토 결과를 호스트로 반환하며, 조율자가 그 근거를 확인해 수락한다. submission은 현재 제출의 정확한 ref다. 수락하면 업무가 complete가 된다. 작업자가 배정된 업무는 complete 명령으로 제출과 검토를 건너뛸 수 없다.
5. 보완은 조율자가 `work request-changes`에 공통 입력, `submission`, `reason`, 보완할 조건 ID 배열 `criteria`를 전달한다. criteria를 생략하면 모든 조건을 다시 확인한다. 상태는 active로 돌아가고 지정한 조건 보고를 지운다. 작업자가 보완한 결과를 호스트로 반환하면 조율자가 report와 submit을 저장하고 새 ref를 검토한다.

submitted는 조율자가 수신 결과를 등록하고 검토를 기다리는 상태다. worker가 자동으로 다시 수행할 상태는 아니다. `recall.awaitingReviewWorks`와 work show의 awaitingReview에서 검토할 결과를 확인한다. 조율자는 호스트의 대기 및 알림 도구로 실행 상태를 확인하고, 새 결과를 CLI에 기록된 명세와 대조한다. CLI는 에이전트를 실행하거나 메시지를 전송하지 않는다. 기존 worker와 reviewer가 기록한 원장은 계속 조회할 수 있지만 새 변경은 owner만 실행한다.
