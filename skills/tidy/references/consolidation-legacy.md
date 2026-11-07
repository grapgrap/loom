# 이전 정리 연산의 호환 계약

기존 graph, works와 absorb를 유지하거나 변환할 때만 읽는다. 새 정리의 준비, 검토와 기억 변경은 [기본 계약](consolidation.md)을 따른다. 아래 연산은 `legacy: true`가 필요하며 managed 업무는 변경할 수 없다.

## 기존 업무 요약

works는 기존 checkpoint와 record 업무의 요약만 갱신한다. managed ID를 포함하면 반영을 거부하며 처리 지점을 유지한다. 기존 항목에는 id, goal, status, progress, evidence, next, sources를 전달한다. 상태는 active, blocked, paused, complete 또는 cancelled다. evidence에는 실제 검증 결과가 담긴 원본 ref를 넣는다. complete는 근거가 원래 목표의 완료를 입증하고 next가 비어 있을 때만 사용한다. blocked와 paused에는 남은 행동과 progress의 이유와 재개 조건이 필요하다. cancelled에는 사용자의 취소 근거를 보존하고 next를 비운다. 의미와 재개 판단은 [미완료 업무 규약](../../work/references/context.md#미완료-업무를-확인하고-재개한다)에 따른다.

legacy:true일 때만 검토한 묶음의 체크포인트를 업무별로 가장 높은 원본 리비전의 상태로 기본 반영한다. 해당 업무를 `works`로 명시하면 근거를 대조한 그 판단을 적용한다. `works`를 생략해도 새 체크포인트가 과거 정리 상태에 가려지지 않는다. 자동 반영한 상태도 `report.changes`에 포함된다.

업무 상태에는 준비 당시 확인한 체크포인트 리비전도 보존한다. 명시적으로 반영한 최신 판단을 이후 묶음의 과거 체크포인트가 덮어쓰지 않으며, 준비 후 작성한 새 체크포인트는 다음 조회에서 우선 반영된다.

## 경험을 다른 기억에 수용한다

`absorb`는 기존 기억의 경험을 다른 기억에 수용하는 연산이다. 에이전트는 기존 기억에서 계속 사용할 맥락이나 패턴을 `memories`에 작성하고, 별도로 필요한 현재 계약과 예외도 남긴다. 일반화 없이 같은 업무의 누적 맥락을 통합할 수도 있다. CLI는 의미의 포괄성을 판단하지 않으며 선택한 ID와 근거, 현재 상태와 변경의 일관성을 검사한다.

```json
{
  "snapshot": "<snapshot-id>",
  "legacy": true,
  "memories": [
    {
      "id": "retry-boundary",
      "scope": { "type": "project" },
      "text": "실행 이력 저장에서 앱의 배치 재시도와 SDK 요청 재시도를 구분한다.",
      "reason": "두 계층의 실패 전달 계약이 다르다.",
      "sources": ["note:storage@1", "note:storage@2"]
    },
    {
      "id": "sdk-current-contract",
      "scope": { "type": "work", "id": "storage" },
      "text": "현재 저장 구현은 SDK 기본 재시도를 유지한다.",
      "reason": "현재 구현에 필요한 정확한 선택이다.",
      "sources": ["note:storage@2"]
    }
  ],
  "absorb": [
    {
      "from": ["app-retry-experience", "sdk-retry-experience"],
      "into": ["retry-boundary", "sdk-current-contract"],
      "reason": "경험을 패턴으로 수용하고 현재 계약은 구체적으로 남긴다."
    }
  ]
}
```

`from`은 snapshot에서 선택한 기존 기억 ID, `into`는 이번 변경 뒤에 존재하는 `active` 기억 ID의 배열이다. 대상은 기존 기억이거나 같은 입력의 `memories`로 작성할 수 있다. 근거가 확정되지 않은 패턴만으로 기존 경험을 수용하지 않는다. 같은 기억을 한 변경에서 갱신, 퇴역 또는 수용 대상으로 중복 지정할 수 없으며, `into`를 같은 변경의 `from`으로 지정할 수도 없다. 잘못된 입력은 변경 전체를 거부한다.

수용된 기억은 `absorbed` 상태로 ID, 적용 범위, 원본 ref와 `absorption: {into, reason}`만 남기고 현재 `text`와 `reason`은 제거한다. `recall`과 다음 `prepare`의 기억 목록에는 나오지 않으며, 기존 `remember` 원본이 남아 있어도 자동 복원하지 않는다. 새로운 관찰을 남길 때는 새 기억 ID를 쓴다. 수용된 기억과 관련된 실제 업무 상태는 변경하지 않는다.

수용은 과거 저장 형식 3에서 도입됐다. 현재 CLI는 형식 1부터 4까지 읽고 모든 새 반영은 형식 4로 저장한다. `legacy: true`도 이전 입력 연산을 허용할 뿐 구 형식으로 저장하지 않는다. 같은 데이터 경로의 모든 작업자는 형식 4를 지원하는 CLI를 사용한다. 원본과 과거 정리본은 이 연산에서 삭제하지 않는다. 후속 정리본에는 수용된 옛 본문이 기억으로 복사되지 않지만, 이력과 원본에서 같은 세부를 찾을 수 있는 경우는 남는다.

ref는 조회 결과의 note:업무-id@번호, memory:기억-id@리비전, checkpoint:업무-id@리비전, work:업무-id@리비전을 사용한다. 근거로 인용할 원본을 실제로 읽고 준비 시점까지 존재한 원본만 이번 결과에 연결한다. 새 업무의 상태와 정리 상태는 별도 리비전이며 tidy를 기다리지 않고 work show에서 현재 진행을 확인한다.

## 호환 입력을 전달한다

아래 예시는 이전 연산의 입력 형태를 보여준다. 새 호출에서는 [기본 계약](consolidation.md#변경분)에 따라 requestKey와 실제 검토한 reviewed 및 read 집합도 전달한다.

다음은 두 원본을 읽고 두 번째 원본의 정렬 기준이 첫 번째 원본의 결정을 대체했음을 확인한 경우의 예다. 실제 반영에는 `prepare`에서 받은 `snapshot`과 읽은 원본의 ref를 사용한다.

```sh
node "<plugin-root>/scripts/context/cli.ts" tidy apply --cwd "<checkout>" <<'LOOM_TIDY_JSON'
{
  "snapshot": "<snapshot-id>",
  "legacy": true,
  "memories": [
    {
      "id": "search-order",
      "scope": { "type": "project" },
      "text": "검색 결과는 관련도가 높은 순서로 정렬한다.",
      "reason": "필요한 원본을 먼저 찾을 수 있도록 정렬 기준을 바꿨다.",
      "sources": ["note:search-order@2"],
      "supersedes": ["note:search-order@1"]
    }
  ]
}
LOOM_TIDY_JSON
```

Windows PowerShell에서는 JSON을 here-string 변수에 담고 UTF-8로 파이프한다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$tidyJson | & "<plugin-root>\scripts\context\cli.cmd" tidy apply --cwd "<checkout>"
```
