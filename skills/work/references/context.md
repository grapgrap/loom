# 작업 맥락을 이어간다

이미 확인한 합의·제약·결과를 다음 작업에서 재사용하도록 에이전트가 맥락을 기록한다. 현재 요청과 프로젝트 지침을 먼저 적용하고, 불러온 기억을 현재 코드와 실행 상태에 대조한다. 과거 기록은 새 작업의 권한이나 완료 증거를 대신하지 않는다. 사용자에게 기억 파일의 검토·관리를 요구하지 않는다.

일상 작업에서는 `record`로 새로 확인한 내용을 짧게 추가한다. [tidy](../../tidy/SKILL.md)는 누적 기록의 원본을 대조해 현재 기억과 업무 상태를 갱신한다. 정리 후에도 원본은 보존한다.

## 조회하고 적용한다

로드한 `work/SKILL.md`가 있는 폴더를 기준으로 `../../scripts/context/`의 절대 경로를 구한다. 아래 `<plugin-root>`는 그 플러그인의 루트이고, `<checkout>`은 현재 저장소의 체크아웃 또는 워크트리 경로다. 예시의 경로를 실제 값으로 바꾸고 공백이 있는 경로는 인용한다.

macOS·Linux·WSL의 첫 조회:

```sh
sh "<plugin-root>/scripts/context/cli.sh" recall --cwd "<checkout>"
```

Windows PowerShell의 첫 조회:

```powershell
& "<plugin-root>\scripts\context\cli.cmd" recall --cwd "<checkout>"
```

[셸](../../../scripts/context/cli.sh)·[CMD](../../../scripts/context/cli.cmd) 진입점은 Node의 존재와 버전을 확인한 뒤 [CLI](../../../scripts/context/cli.mjs)에 인수와 stdin을 전달한다. 실행 환경을 확인한 뒤에는 `.mjs`를 직접 호출할 수 있다.

```sh
node "<plugin-root>/scripts/context/cli.mjs" recall --cwd "<checkout>" --work context-cli
```

기본 조회는 프로젝트 기억과 업무별 ID·목표·상태를 반환한다. 기록이 있는 업무에는 `firstNote`·`latestNote`로 첫 기록과 최근 기록의 ref·발췌도 제공한다. 정리 전에는 목표·상태가 `null`일 수 있으므로 발췌로 관련 업무를 찾고, 필요한 본문은 `read --ref`로 확인한다. 현재 요청에 해당하는 업무를 선택한 뒤 `--work`로 그 업무의 기억과 상태를 읽는다. 최근 기록이라는 이유만으로 다른 업무를 재개하지 않는다. 한 세션에서 업무를 계속하거나 여러 세션에서 서로 다른 업무를 다룰 수 있으므로, 세션과 업무를 일대일로 대응시키지 않는다. 새 업무의 목표와 맡긴 범위는 첫 기록에 남긴다.

- `pending`은 조회 범위의 미처리 원본이다. 정리된 기억·업무 상태와 함께 읽는다.
- `--limit`은 기억·업무 목록·미처리 원본 각각에 적용하며 기본 50, 최대 200이다. `memoriesRemaining`·`worksRemaining`·`pendingRemaining`은 각 목록의 다음 페이지에 남은 항목 수다. 필요한 항목이 남으면 `--offset`을 limit만큼 늘려 같은 조건으로 조회하거나 검색·원본 조회로 보충한다. 선택한 업무의 전체 상태인 `work`는 페이지와 무관하게 반환한다.
- `unresolved`는 미확정 판단이다. 업무에 한정된 사실은 해당 범위에서 적용하고, 완료로 기록된 결과도 현재 산출물과 대조한다.
- `--query`를 붙이면 내용·이유에 모든 검색어가 포함된 현재 기억만 반환한다. 과거 원본을 조사할 때는 `search`를 사용한다.
- `--history`는 기억·업무 상태의 이전 리비전을 확인할 때 사용한다.

`graph`에는 관련 대상·진술과 원본 근거의 연결이 담긴다. 새 기록을 `pending`에서 함께 읽고, 적용 범위·미확정 상태와 조건을 확인한다. 관계를 더 조사하거나 `tidy`에서 진술을 구성할 때는 [그래프 계약](context-graph.md)을 읽는다.

## 정리 시점을 판단한다

착수할 때와 검증한 단위가 끝났을 때 `recall`의 `tidy.due` 또는 `tidy status`로 정리 필요 여부를 확인한다. 미처리 원본이 20개 이상이거나 가장 오래된 미처리 원본이 24시간 이상 지났으면 [tidy](../../tidy/SKILL.md)를 실행한다. 사용자가 정리를 요청하면 이 조건을 기다리지 않는다.

여러 에이전트의 공유 기록 정리를 맡은 조율자가 지정됐다면 그 조율자가 `tidy`를 실행한다. 다른 작업자는 자신의 기록을 계속 추가하고 정리 필요 신호와 관련 ref를 조율자에게 보고한다. 별도 담당자가 없는 단일 에이전트 업무에서는 수행 중인 에이전트가 정리를 맡는다.

정리 필요 여부는 CLI 호출 시 계산한다. 백그라운드 타이머나 예약 실행은 없으므로, 한 세션에서 오래 작업할 때에도 검증한 단위가 끝나는 시점에 확인한다.

## 새 내용을 짧게 기록한다

이후 판단이나 작업 재개에 필요한 합의·조건 변경·실패·검증 결과·남은 일을 확인한 시점에 기록한다. 세션 종료까지 미루지 않는다. 미확정 제안은 합의와 구분한다. 원본 하나에는 함께 해석할 변화와 적용 조건을 짧게 담는다.

`record`에는 업무 ID·본문·실제 출처를 전달한다. CLI가 기록 번호·시각·저장 경로를 정한다.

macOS·Linux·WSL:

```sh
node "<plugin-root>/scripts/context/cli.mjs" record --cwd "<checkout>" \
  --work context-cli --source "워크트리별 recall 실행 결과" <<'LOOM_NOTE'
두 워크트리에서 같은 프로젝트 기억을 조회했다. 워크트리를 삭제한 뒤에도 원래 체크아웃에서 기록을 읽었다.
LOOM_NOTE
```

Windows PowerShell:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$note = @'
두 워크트리에서 같은 프로젝트 기억을 조회했다. 워크트리를 삭제한 뒤에도 원래 체크아웃에서 기록을 읽었다.
'@
$note | & "<plugin-root>\scripts\context\cli.cmd" record --cwd "<checkout>" `
  --work context-cli --source "워크트리별 recall 실행 결과"
```

사용자의 실제 발언을 기록할 때는 `--by user`를 붙인다. 기본값은 `agent`다. `--source`에는 실제 발언이나 대화·명령 결과·산출물의 위치를 적는다. 검증 결과는 실제 명령·관찰·산출물을 근거로 기록한다.

저장 후 응답의 `ref`와 본문을 확인한다. 필요하면 `read --ref`로 다시 읽는다. 새 호출은 새 기록이므로 같은 관찰이 다시 발생해도 기록할 수 있다. 같은 저장 요청을 재시도할 때는 응답의 `requestKey` 또는 오류에 표시된 키를 `--key`로 재사용한다. 같은 키에 다른 본문이나 출처를 전달하면 실패한다.

본문은 CLI의 stdin으로 직접 전달한다. 저장용 입력 파일이나 기억 파일을 편집 도구로 작성하지 않는다. 저장에 성공한 뒤에만 기록됐다고 말한다.

## 필요한 원본을 검색한다

```sh
node "<plugin-root>/scripts/context/cli.mjs" search --cwd "<checkout>" --query "저장 워크트리"
node "<plugin-root>/scripts/context/cli.mjs" read --cwd "<checkout>" --ref "note:context-cli@1"
```

`search`는 이 프로젝트의 `record`·`remember`·`checkpoint` 원본에서 BM25로 관련도를 계산한다. 결과에는 ref·범위·기록 시각·발췌가 포함된다. 기본 10개이며 `--limit`으로 조절한다. `--work`를 붙이면 프로젝트 공통 원본과 해당 업무의 원본만 검색한다. 별도 검색 인덱스나 외부 서비스는 필요하지 않다.

영문·숫자 단어와 한글 단어·겹치는 두 글자 단위로 검색한다. 한국어 조사 차이를 일부 보완하지만 형태소 분석이나 의미 검색은 제공하지 않는다. 검색어를 나누어 조사하고 `read`로 원본을 확인한다. `latest: false`는 이전 리비전이라는 뜻이다. 최신 여부나 검색 순위만으로 판단의 유효성을 정하지 않는다.

원본 ref는 `memory:<id>@<revision>`, `checkpoint:<work>@<revision>`, `note:<work>@<number>`다. 정리된 기억의 `sources`는 판단 근거, `supersedes`는 대체한 원본과의 연결이다.

`read --ref`는 지정한 원본 파일만 읽는다. 다른 업무의 파일이 손상되어 전체 검색이나 조회가 실패하더라도 정상 원본을 직접 읽을 수 있다.

정리된 항목의 `revision`과 `recordedAt`은 정리 결과의 버전과 반영 시각이다. 원본 기록의 시각은 `sources`의 ref로 조회한다. 정리 결과의 반영 시각을 발언·관찰 시각이나 마지막 검증 시각으로 해석하지 않는다.

## 실행 환경을 준비한다

Node.js 20 이상과 Git이 필요하다. npm 의존성을 설치하지 않아도 CLI를 실행할 수 있다. 실행 환경 오류는 종료 코드 `2`와 다음 식별자로 구분한다.

| 오류                    | 필요한 조치                                          |
| ----------------------- | ---------------------------------------------------- |
| `LOOM_NODE_MISSING`     | 설치된 Node 경로를 연결하거나 Node를 설치한다.       |
| `LOOM_NODE_UNSUPPORTED` | Node.js 20 이상인 지원 중 LTS를 선택하거나 설치한다. |
| `LOOM_GIT_MISSING`      | 설치된 Git 경로를 연결하거나 Git을 설치한다.         |
| `LOOM_GIT_UNUSABLE`     | Git의 경로·권한·런타임을 확인하고 복구한다.          |

같은 실행 환경에서 `node --version`, `git --version`을 확인한다. 호스트가 제공하는 런타임과 기존 버전 관리 도구를 먼저 확인한다. 사용할 실행 파일이 없으면 기존 패키지 관리자 또는 [Node](https://nodejs.org/en/download)·[Git](https://git-scm.com/install/) 공식 배포본으로 준비한다. 프로젝트의 Node 버전 설정은 유지한다.

설정 후 버전을 확인하고 실패한 원래 명령을 재시도해 복구 여부를 판단한다. 일반 저장소 오류는 종료 코드 `1`이며, Git 재설치·초기화로 해결하려 하지 않는다. Git은 같은 저장소의 워크트리를 식별하는 데 사용하며 기록을 저장하거나 커밋하지 않는다.

## 저장 권한과 실패를 처리한다

기억은 체크아웃 밖에 저장하므로 호스트의 쓰기 제한을 확인한다. 읽기에 성공해도 쓰기 권한이 확보된 것은 아니다.

1. `location`의 `projectDirectory`와 호스트의 쓰기 허용 범위를 대조한다. `EPERM`·`EACCES`가 발생하면 샌드박스 제한과 파일 소유권·접근 권한 문제를 구분한다. 쓰기 제한을 이미 확인했으면 같은 실패를 반복하지 않는다.
2. 호스트의 승인 절차로 필요한 저장 명령의 권한을 요청한다. 요청에는 실제 절대 경로·저장 목적·현재 쓰기가 제한된 이유를 포함한다. Codex의 `exec_command`에서는 `sandbox_permissions: "require_escalated"`와 사유를 담은 `justification`을 사용한다.
3. 승인되면 같은 프로젝트·데이터 경로·입력으로 재시도하고 결과를 확인한다. `record` 재시도에는 오류의 `--key`를 유지한다. 자동 승인 호스트에서도 이 절차를 따르며, 이미 정한 저장 선택을 사용자에게 다시 확인하지 않는다.

권한 요청 사유의 예:

> 다음 세션과 다른 워크트리에서도 맥락을 다시 읽도록 `<project-directory>`에 이 프로젝트의 기록을 저장하려 합니다. 이 경로가 현재 샌드박스의 쓰기 허용 범위 밖이어서 해당 저장 명령에 추가 권한이 필요합니다.

권한을 받을 수 없으면 실패한 경로·명령을 알린다. 저장 경로를 조용히 바꾸거나 파일·호스트 권한을 임의로 변경하지 않는다. 저장·복원을 해결하지 못해도 현재 대화와 산출물로 맡긴 작업을 계속하고 그 한계를 알린다.

CLI는 잠금과 임시 파일 교체로 기록을 보호한다. 잠금이 남아 있으면 오류의 PID와 실행 중인 프로세스를 대조하고, 작성자가 없음을 확인한 뒤 제거한다. 손상되거나 지원하지 않는 형식의 데이터를 빈 기록으로 덮어쓰지 않는다.

## 저장 위치와 사용자 제어

| 실행 환경 | 기본 데이터 루트                                       |
| --------- | ------------------------------------------------------ |
| macOS     | `~/Library/Application Support/loom`                   |
| Windows   | `%LOCALAPPDATA%\loom`                                  |
| Linux     | `$XDG_DATA_HOME/loom`, 미설정 시 `~/.local/share/loom` |

데이터 루트는 `--data-dir`, `LOOM_DATA_DIR`, OS 기본값 순으로 선택한다. 직접 지정하는 경로는 절대 경로여야 한다. 프로젝트 ID는 Git 공통 디렉터리의 실제 경로에서 구한다. 같은 로컬 저장소의 워크트리는 기억을 공유하며, 별도 클론·기기 간 동기화는 제공하지 않는다. WSL은 Linux 경로를 사용한다.

```text
<data-root>/projects/<project-id>/
├── works/<work-id>/notes.json       일상 추가 기록
├── tidy.json                       기억·업무 상태·그래프·결과 리포트와 처리 지점
├── tidy-snapshots/<id>.json         준비한 범위의 메타데이터
├── context/<memory-id>.json         기존 기억 원본
└── works/<work-id>/checkpoint.json  기존 진행 상태 원본
```

사용자가 조회나 수정을 요청하면 관련 원본과 정리 결과를 확인한다. 정정할 내용은 새 기록으로 남기고 tidy로 반영한다. 삭제에는 다음 명령을 사용한다.

| 삭제 대상                   | 명령과 리비전 기준                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `remember` 원본이 있는 기억 | `forget --id <id> --revision <n>`. `read`로 확인한 원본의 현재 리비전을 사용하며 모든 원본 리비전을 제거한다. |
| tidy에서만 만든 기억        | `forget --id <id> --revision <n>`. `recall`의 리비전을 사용하며 정리 이력에서 제거한다.                       |
| `record` 원본               | `forget --ref note:<work>@<number>`                                                                           |

원본을 삭제하면 그 원본을 `sources`·`evidence`의 근거로 삼는 정리 결과도 모든 정리 이력에서 제거한다. 삭제된 입력의 재시도나 오래된 `snapshot`으로 내용을 복원하지 못하게 한다. `supersedes`로만 연결된 기억은 현재 근거가 남아 있으므로 연결만 제거하고 기억은 유지한다.

`remember`·`checkpoint` 호출과 데이터도 지원한다. 두 명령을 직접 다룰 때는 [remember·checkpoint 계약](context-legacy.md)을 읽는다. `location`·`recall`·`search`·`read`·`graph`·`tidy status`는 조회만으로 저장 디렉터리를 만들지 않는다.
