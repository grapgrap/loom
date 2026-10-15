# 정리 결과의 반영 계약

일상 기록에는 이 JSON을 요구하지 않는다. 이 계약은 `tidy`가 여러 원본을 읽고 해석한 결과를 반영할 때 사용한다. CLI는 입력 값의 제약·근거의 존재·동시 갱신을 검사하며, 근거가 주장을 뒷받침하는지는 모델이 판단한다.

## 준비

로드한 `tidy/SKILL.md`의 위치에서 `../../scripts/context/`의 절대 경로를 구한다. 아래 `<plugin-root>`와 `<checkout>`은 실제 경로로 바꾸고 인용한다. Windows의 첫 실행과 권한 절차는 [작업 맥락](../../work/references/context.md)을 따른다.

```sh
node "<plugin-root>/scripts/context/cli.mjs" tidy prepare --cwd "<checkout>" --limit 20
```

- `snapshot`: 반영할 때 그대로 전달할 준비 작업의 ID다. 새 기록이 없으면 `null`이다.
- `records`: 이번 묶음에서 모두 검토할 원본이다. 기존 기억·체크포인트의 이전 리비전도 포함한다.
- `current`: 기존의 정리된 기억과 업무 상태다. 이것은 검토할 현재 그림이며 새 근거를 대신하지 않는다.
- `current.retired`: 이미 퇴역한 기억의 ID·범위·퇴역 이유다. 과거 원본을 찾았다는 이유만으로 다시 활성화하지 않는다.
- `remaining`: 이번 묶음에 포함하지 않은 미처리 원본 수다.

snapshot은 준비 당시의 기억 버전과 처리 범위를 고정한다. 준비 후 들어온 기록은 이번 결과를 반영해도 미처리 상태로 남는다. 준비만으로 처리 지점을 앞당기지 않는다.

`current.memories`에는 기존 `remember`로 저장한 현재 기억도 출처 ref와 함께 포함한다. 첫 정리에서 변경하지 않은 기존 기억은 유지된다. 현재 기억을 보존해도 묶음 밖의 원본은 처리 완료로 표시하지 않는다. 준비 후 바뀐 원본은 `pending`에서 함께 확인한다.

## 변경분

입력은 `snapshot`과 변경할 항목만 담는다. `memories`, `works`, `retire`는 생략할 수 있다. 아무 변경도 필요하지 않았으면 snapshot만 반영해 검토한 범위를 처리 완료로 만들 수 있다.

기억:

| 필드 | 값 |
| --- | --- |
| `id` | 같은 판단을 갱신할 때 재사용할 소문자·숫자·하이픈 ID |
| `scope` | 프로젝트 공통이면 `{"type":"project"}`, 업무 전용이면 `{"type":"work","id":"업무-id"}` |
| `text`, `reason` | 현재 판단과 적용 조건, 그 이유 |
| `sources` | 주장을 뒷받침하는 실제 원본 ref 배열. 비어 있을 수 없다. |
| `status` | 기본은 `active`. 미확정·충돌은 `unresolved`로 남긴다. |
| `supersedes` | 선택 사항. 이 판단으로 대체한 원본 ref 배열 |

업무 상태는 `id`, `goal`, `status`, `progress`, `evidence`, `next`, `sources`를 전달한다. 상태는 `active` 또는 `complete`다. `evidence`에는 실제 검증 원본의 ref를 넣는다. `complete`는 검증 근거가 있고 `next`가 비어 있을 때만 사용한다. 근거가 실제 완료를 입증하는지도 확인한다.

퇴역 항목은 `{"id":"기억-id","reason":"이유","sources":["원본-ref"]}`다. 퇴역은 평소 조회에서 제외하며 원본과 정리 이력은 보존한다. 원본 삭제 요청에는 `forget`을 사용한다.

각 ref는 조회 결과에서 복사한 `note:업무-id@번호`, `memory:기억-id@리비전`, `checkpoint:업무-id@리비전`이다. 존재하지 않는 ref를 만들거나 snapshot 이후의 기록을 이번 결과의 근거로 사용하지 않는다. 같은 기억의 scope는 바꿀 수 없으므로 적용 범위를 확장할 때 새 ID를 사용한다.

예를 들어 prepare에서 `note:context-cli@1`, `note:context-cli@2`를 실제로 읽고 두 번째 기록이 첫 결정을 바꾼 것으로 확인했다면:

```sh
node "<plugin-root>/scripts/context/cli.mjs" tidy apply --cwd "<checkout>" <<'LOOM_TIDY_JSON'
{
  "snapshot": "prepare에서 받은 실제 ID",
  "memories": [
    {
      "id": "context-input-method",
      "scope": { "type": "project" },
      "text": "기억 저장 입력은 stdin으로 전달한다.",
      "reason": "입력 파일이 작업 변경 목록에 노출된 관찰에 따른 선택이다.",
      "sources": ["note:context-cli@2"],
      "supersedes": ["note:context-cli@1"]
    }
  ]
}
LOOM_TIDY_JSON
```

실제 입력에는 현재 prepare 결과의 snapshot과 읽은 원본 ref를 사용한다. 위 예시의 문구나 ID를 실제 근거로 취급하지 않는다.

Windows PowerShell에서는 JSON을 here-string 변수에 담고 UTF-8로 파이프한다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$tidyJson | & "<plugin-root>\scripts\context\cli.cmd" tidy apply --cwd "<checkout>"
```

## 반영과 실패

CLI는 원본 확인부터 정리 결과·처리 지점 반영까지 원본 삭제와 같은 잠금으로 보호한다. snapshot의 기준 버전이 여전히 현재 버전인지 확인하고, 정리 결과와 처리 지점을 하나의 교체로 저장한다. 다른 tidy가 먼저 반영했다면 실패하므로 새로 준비하고 재검토한다. 같은 snapshot과 같은 변경분의 직후 재시도는 리비전을 추가하지 않는다.

형식·출처·잠금·쓰기 오류에는 처리 지점을 앞당기지 않는다. 오류를 해결할 수 없으면 기존 기억과 미처리 기록을 유지하고 정리가 끝나지 않았음을 알린다. 실행 중 원본이 삭제됐으면 그 원본을 근거로 복원하지 않는다.

원본을 삭제하면 그 원본을 근거로 삼는 정리 결과도 이력에서 제거한다. `supersedes`만 연결된 현재 기억은 대체 관계만 제거하고 유지한다. 현재 판단의 근거와 과거 판단을 대체했다는 관계를 구분한다.
