# 정리 결과의 반영 계약

tidy apply에는 원본을 검토해 결정한 기억·그래프와 기존 업무 요약의 변경분을 전달한다. managed 업무 상태는 [업무 CLI](../../work/references/context-work.md)가 소유한다. CLI는 입력 값의 제약·근거의 존재·동시 갱신을 검사한다. 근거가 주장을 뒷받침하는지는 에이전트가 판단한다.

## 준비

로드한 `tidy/SKILL.md`가 있는 폴더를 기준으로 `../../scripts/context/`의 절대 경로를 구한다. `<plugin-root>`는 그 플러그인의 루트이고, `<checkout>`은 현재 저장소의 체크아웃 또는 워크트리 경로다. 예시의 경로를 실제 값으로 바꾸고 인용한다. 첫 실행과 저장 권한은 [작업 맥락](../../work/references/context.md)의 절차를 따른다.

```sh
node "<plugin-root>/scripts/context/cli.ts" tidy prepare --cwd "<checkout>" --limit 20
```

- `snapshot`: 반영할 때 전달할 준비 결과의 ID다. 미처리 기록과 선택한 재검토 기억이 없으면 `null`이다.
- `records`: 이번 묶음에서 모두 검토할 원본이다. remember·checkpoint·work의 이전 리비전도 포함한다.
- `current`: 보존하거나 갱신할 현재 기억과 업무 상태다. `current.memories`에는 `remember`로 저장한 기억도 원본 ref와 함께 포함한다.
- `current.retired`: 이미 현재 기억에서 제외한 항목의 ID·범위·제외 이유다. 과거 원본을 찾았다는 이유만으로 다시 활성화하지 않는다.
- `current.graph`: 기존 대상과 진술이다. 대체·제외된 진술도 보존하므로 상태를 확인한다.
- `current.managedWorks`: 업무 CLI의 현재 상태이며 읽기 전용이다. managedWorksRemaining으로 다음 페이지를 확인한다. current.works는 기존 업무 요약만 포함한다.
- `remaining`: 묶음 밖에 남은 미처리 원본 수다.

`--limit`은 `records`와 `current`의 기억·업무·제외 목록 각각에 적용한다. `current.memoriesRemaining`·`worksRemaining`·`retiredRemaining`으로 남은 항목을 확인한다. 현재 상태의 다음 페이지가 필요하면 같은 limit과 증가한 `--offset`으로 다시 준비한다. offset은 `current`의 목록에만 적용하며 미처리 원본을 건너뛰지 않는다. 각 호출은 새 snapshot을 반환한다. 페이지를 읽는 동안 `baseRevision`이나 `records`의 ref 목록이 바뀌면 새 준비 결과를 기준으로 검토하고, 마지막으로 검토한 snapshot을 반영한다.

`snapshot`은 준비 당시의 정리 결과 버전과 검토할 원본 묶음을 고정한다. 준비만으로 처리 지점을 바꾸지 않는다. 반영에 성공하면 검토한 묶음만 처리 완료로 표시하고, 묶음 밖의 기록과 준비 후 추가된 기록은 미처리 상태로 남긴다.

첫 정리에서도 변경하지 않은 기존 기억은 보존한다. 기억을 보존하는 것과 원본을 검토 완료로 표시하는 것은 별개다. 준비 후 바뀐 원본은 `recall`의 `pending`에서 확인한다.

기존 기억을 재검토하려면 `tidy prepare --revisit`을 사용한다. 새 원본이 없어도 `current.memories`가 있으면 snapshot을 만든다. `--query`는 원본과 기억의 검색 텍스트에 모든 검색어가 포함된 항목을 선택하고, `--work`는 프로젝트 공통과 해당 업무로 범위를 한정한다. 두 필터는 `--revisit`과 함께 사용한다. `--work`가 없으면 모든 업무의 기억을 주제로 찾을 수 있다. 이 선택은 패턴을 자동으로 도출하거나 기억의 유효성을 판정하지 않는다.

재검토 snapshot은 버전 2이며 `memoryIds`는 해당 페이지의 `current.memories` ID다. 구 CLI가 새 수용 요청을 무시하고 반영하지 않도록 재검토 snapshot부터 새 형식을 사용한다. `--limit`과 `--offset`은 선택된 기억의 페이지에 적용한다. `absorb.from`에는 그 snapshot에 포함된 기억만 쓸 수 있으므로 여러 페이지의 수용은 각각 준비하고 반영한다. 앞선 반영으로 목록이 바뀌면 다음 페이지의 범위를 다시 확인한다. 기존 기준 리비전 검사와 원본 해시 검사를 재사용한다.

## 변경분

입력에는 `snapshot`과 변경할 항목만 담는다. `memories`, `works`, `retire`, `absorb`, `graph`는 생략할 수 있으며, 생략한 기존 항목은 유지된다. 원본을 모두 검토했지만 변경할 내용이 없으면 `snapshot`만 반영해 해당 묶음을 처리 완료로 표시한다.

`graph`의 대상·진술·제외 요청은 [그래프 계약](../../work/references/context-graph.md)에 따라 구성한다. 기억·업무 상태와 같은 기준 리비전·원본 범위에서 검사하고 한 번에 저장한다.

`memories`의 각 항목은 다음 필드를 사용한다.

| 필드             | 값                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `id`             | 소문자·숫자·하이픈으로 된 기억 ID. 같은 판단을 갱신할 때 재사용한다.                      |
| `scope`          | 프로젝트 공통이면 `{"type":"project"}`, 업무 전용이면 `{"type":"work","id":"업무-id"}`다. |
| `text`, `reason` | 현재 판단과 적용 조건, 그 이유다.                                                         |
| `sources`        | 주장을 뒷받침하는 실제 원본 ref 배열. 비어 있을 수 없다.                                  |
| `status`         | 기본은 `active`. 미확정·충돌은 `unresolved`로 남긴다.                                     |
| `supersedes`     | 선택 사항이다. 이 판단으로 대체한 원본 ref 배열이다.                                      |

같은 기억의 `scope`는 바꿀 수 없다. 적용 범위를 확장할 때는 새 ID를 사용한다.

works는 기존 checkpoint·record 업무의 요약만 갱신한다. managed ID를 포함하면 반영을 거부하며 처리 지점을 유지한다. 기존 항목에는 id, goal, status, progress, evidence, next, sources를 전달한다. 상태는 active·blocked·paused·complete·cancelled다. evidence에는 실제 검증 결과가 담긴 원본 ref를 넣는다. complete는 근거가 원래 목표의 완료를 입증하고 next가 비어 있을 때만 사용한다. blocked·paused에는 남은 행동과 progress의 이유·재개 조건이 필요하다. cancelled에는 사용자의 취소 근거를 보존하고 next를 비운다. 의미와 재개 판단은 [미완료 업무 규약](../../work/references/context.md#미완료-업무를-확인하고-재개한다)에 따른다.

검토한 묶음의 체크포인트는 업무별로 가장 높은 원본 리비전의 상태가 기본 반영된다. 해당 업무를 `works`로 명시하면 근거를 대조한 그 판단을 적용한다. `works`를 생략해도 새 체크포인트가 과거 정리 상태에 가려지지 않는다. 자동 반영한 상태도 `report.changes`에 포함된다.

업무 상태에는 준비 당시 확인한 체크포인트 리비전도 보존한다. 명시적으로 반영한 최신 판단을 이후 묶음의 과거 체크포인트가 덮어쓰지 않으며, 준비 후 작성한 새 체크포인트는 다음 조회에서 우선 반영된다.

`retire`의 각 항목은 `{"id":"기억-id","reason":"제외 이유","sources":["원본-ref"]}`다. 해당 기억을 현재 조회에서 제외하고 원본과 정리 이력은 보존한다. 원본을 삭제할 때는 `forget`을 사용한다.

## 경험을 다른 기억에 수용한다

`absorb`는 기존 기억의 경험을 다른 기억에 수용하는 연산이다. 모델은 적용 조건과 판단 기준을 담은 패턴, 별도로 필요한 현재 계약이나 예외를 `memories`에 작성한다. CLI는 의미의 포괄성을 판단하지 않으며 선택한 ID와 근거, 현재 상태와 변경의 일관성을 검사한다.

```json
{
  "snapshot": "<snapshot-id>",
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

`from`은 `--revisit` snapshot에서 선택한 기존 기억 ID, `into`는 이번 변경 뒤에 존재하는 `active` 기억 ID의 배열이다. 대상은 기존 기억이거나 같은 입력의 `memories`로 작성할 수 있다. 미확정 패턴만으로 기존 경험을 수용하지 않는다. 같은 기억을 한 변경에서 갱신, 퇴역 또는 수용 대상으로 중복 지정할 수 없으며, `into`를 같은 변경의 `from`으로 지정할 수도 없다. 잘못된 입력은 변경 전체를 거부한다.

수용된 기억은 `absorbed` 상태로 ID, 적용 범위, 원본 ref와 `absorption: {into, reason}`만 남기고 현재 `text`와 `reason`은 제거한다. `recall`과 다음 `prepare`의 기억 목록에는 나오지 않으며, 기존 `remember` 원본이 남아 있어도 자동 복원하지 않는다. 새로운 관찰을 남길 때는 새 기억 ID를 쓴다. 수용된 기억과 관련된 실제 업무 상태는 변경하지 않는다.

첫 수용 반영부터 정리 저장 형식은 버전 3이다. 이 CLI는 버전 1과 2도 읽으며, 수용 데이터에는 버전 3을 지원하는 CLI를 사용한다. 원본과 과거 정리본은 이 연산에서 삭제하지 않는다. 후속 정리본에는 수용된 옛 본문이 기억으로 복사되지 않지만, 이력과 원본에서 같은 세부를 찾을 수 있는 경우는 남는다.

ref는 조회 결과의 note:업무-id@번호, memory:기억-id@리비전, checkpoint:업무-id@리비전, work:업무-id@리비전을 사용한다. 근거로 인용할 원본을 실제로 읽고 준비 시점까지 존재한 원본만 이번 결과에 연결한다. 새 업무의 상태와 정리 상태는 별도 리비전이며 tidy를 기다리지 않고 work show에서 현재 진행을 확인한다.

다음은 두 원본을 읽고 두 번째 원본의 정렬 기준이 첫 번째 원본의 결정을 대체했음을 확인한 경우의 예다. 실제 반영에는 `prepare`에서 받은 `snapshot`과 읽은 원본의 ref를 사용한다.

```sh
node "<plugin-root>/scripts/context/cli.ts" tidy apply --cwd "<checkout>" <<'LOOM_TIDY_JSON'
{
  "snapshot": "<snapshot-id>",
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

## 반영과 실패

CLI는 원본 확인부터 반영까지 원본 삭제와 같은 잠금으로 보호한다. `snapshot`의 기준 버전을 확인하고, 정리 결과와 처리 지점을 함께 저장한다. 다른 tidy가 먼저 반영했다면 리비전이 충돌하므로 새로 준비해 변경분을 재검토한다. 같은 `snapshot`과 같은 변경분을 직후에 재시도하면 리비전을 추가하지 않는다.

반영 응답은 리비전·처리 지점과 이번에 변경한 기억·업무 상태만 반환한다. 저장된 전체 상태는 유지되며, 반영 후 확인에는 `recall`을 사용한다. 입력의 필수 값·타입·허용 상태가 잘못되면 필드 이름과 기대값을 알리고 처리 지점을 유지한다.

입력·출처·잠금·쓰기 오류가 발생하면 처리 지점을 앞당기지 않는다. 해결할 수 없으면 기존 기억과 미처리 기록을 유지하고 정리가 끝나지 않았음을 알린다. 실행 중 원본이 삭제되면 그 원본을 근거로 내용을 복원하지 않는다.

원본 삭제가 기억·이력·근거 연결에 미치는 영향은 [작업 맥락의 삭제 계약](../../work/references/context.md#저장-위치와-사용자-제어)을 따른다.

## 결과 리포트

성공 응답에는 정리 결과와 `report`가 함께 담긴다. 리포트는 CLI가 실제 저장 전후를 비교해 만들며, 입력에 같은 내용을 다시 전달한 항목은 변경으로 세지 않는다.

| 필드                     | 의미                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `report.processed`       | 이번에 검토 완료로 반영한 원본 ref 배열.                                                                |
| `report.remaining`       | 반영 시점에 남은 미처리 원본 수. 이후 새로 들어온 기록 수는 `recall`에서 확인한다.                      |
| `report.changes`         | 실제 변경된 기억(`memory`)·업무(`work`)·대상(`entity`)·진술(`statement`)의 목록.                        |
| 변경의 `id`, `action`    | 바뀐 항목과 `added`, `updated`, `retired`, `absorbed`, `superseded` 등의 변화.                          |
| 변경의 `before`, `after` | 변경 전후의 내용. 새 항목의 `before`는 `null`이다. 근거와 적용 조건, 추가 할 일도 이 내용에서 확인한다. |

같은 `snapshot`·변경분을 직후 재시도하면 같은 리비전과 같은 리포트를 반환한다. 실패한 반영의 리포트는 만들지 않는다. 실제 변경이 없는 검토에도 `changes: []`와 처리한 범위를 반환한다. 사용자가 원본을 삭제하면 리포트에 남은 해당 내용과 연결도 함께 제거한다.
