# 작업 맥락을 이어간다

기록은 에이전트가 장기 작업에서 이미 확인한 합의·제약·결과를 다시 사용하기 위한 데이터다. 사용자가 기억 파일을 검토하거나 관리하는 절차를 요구하지 않는다. 현재 요청과 프로젝트 지침을 먼저 적용하고, 기억을 현재 코드와 실행 상태에 대조한다. 과거 기록은 작업 권한이나 완료 증거를 대신하지 않는다.

일상 모델은 새로 확인한 내용을 짧게 추가한다. [tidy](../../tidy/SKILL.md)는 누적 원본을 읽어 업무 상태와 프로젝트 기억을 갱신한다. 원본 기록은 보존한다.

## 조회하고 적용한다

로드한 `work/SKILL.md`의 실제 위치에서 `../../scripts/context/`의 절대 경로를 구한다. 아래 `<plugin-root>`와 `<checkout>`을 실제 경로로 바꾸고 공백이 있는 경로는 인용한다. `PLUGIN_ROOT` 환경 변수가 있다고 가정하지 않는다.

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

- 기본 조회는 프로젝트 기억과 업무별 ID·목표·상태를 반환한다. 현재 요청에 맞는 업무를 선택하고 `--work`로 그 업무의 상태와 기억을 읽는다. 새 업무라면 목표와 맡긴 범위를 첫 추가 기록에 한 번 남긴다. 최신 업무라는 이유만으로 다른 업무를 재개하지 않는다. 세션과 업무를 일대일로 가정하지 않는다.
- `pending`은 정리 후 생긴 해당 업무의 원본 기록이다. 정리된 상태와 함께 읽어 최근 변경을 놓치지 않는다. `pendingRemaining`이 있으면 `--limit`을 늘리거나 검색·원본 조회로 필요한 내용을 보충한다. 기본 limit은 50, 최대 200이다.
- `unresolved` 기억은 미확정 판단이다. 작업별 사실을 프로젝트 공통 합의로 확대하지 않는다. 완료로 기록된 결과도 현재 산출물과 대조한다.
- `tidy.due`는 정리가 필요하다는 신호다. 기본값은 미처리 원본 20개 또는 가장 오래된 미처리 원본이 24시간 지난 경우다. 작업 시작이나 검증한 단위가 끝난 시점에 신호를 확인하고 tidy를 수행한다. 명시적 정리 요청은 이 조건을 기다리지 않는다.
- 이 신호는 CLI 호출 시 계산한다. 백그라운드 타이머나 예약 실행을 생성하지 않는다. 한 세션에서 오래 진행할 때에도 안정된 작업 경계에서 `tidy status`로 확인할 수 있다.
- `--query`는 현재 기억의 내용·이유를 모든 검색 단어로 거르는 호환 옵션이다. 과거 원본 조사에는 아래 `search`를 사용한다. `--history`는 이전 정리나 원본의 리비전을 확인할 때만 붙인다.

## 새 내용을 짧게 기록한다

이후 판단이나 작업 재개에 필요한 사용자 합의·조건 변경·실패·검증 결과·남은 일을, 실제로 확인한 시점에 추가한다. 세션 종료까지 미루지 않는다. 미확정 제안은 제안임을 적고 실제 합의와 구분한다. 원본 하나에는 함께 해석할 수 있는 변화와 적용 조건을 짧게 담는다.

일상 기록에는 전체 목표·진행 상태·다음 행동·그래프를 다시 작성하지 않는다. 업무 ID, 본문, 실제 출처만 전달한다. CLI가 기록 번호·시각과 저장 경로를 결정한다.

macOS·Linux·WSL:

```sh
node "<plugin-root>/scripts/context/cli.mjs" record --cwd "<checkout>" \
  --work context-cli --source "저장 CLI 실행 결과와 체크아웃의 git status 확인" <<'LOOM_NOTE'
입력 파일 없이 stdin으로 저장하고 재조회했다. 체크아웃의 변경 목록에는 기억 데이터가 없었다.
LOOM_NOTE
```

Windows PowerShell:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$note = @'
입력 파일 없이 stdin으로 저장하고 재조회했다. 체크아웃의 변경 목록에는 기억 데이터가 없었다.
'@
$note | & "<plugin-root>\scripts\context\cli.cmd" record --cwd "<checkout>" `
  --work context-cli --source "저장 CLI 실행 결과와 체크아웃의 git status 확인"
```

출처가 사용자의 실제 발언이면 `--by user`를 붙인다. 기본은 `agent`다. source에는 실제 발언이나 대화·명령 결과·산출물의 위치를 적는다. 단순히 성공했다고 주장하는 문구를 검증 결과로 바꾸지 않는다.

성공 결과의 `ref`와 저장된 본문을 확인한다. 필요하면 `read --ref`로 다시 읽는다. 새 호출은 새 기록이며, 같은 내용의 관찰이 다시 발생해도 남길 수 있다. 같은 저장 요청을 재시도할 때만 반환된 `requestKey` 또는 오류에 표시된 키를 `--key`로 재사용한다. 같은 키에 다른 내용을 넣으면 실패한다.

기록은 CLI를 통해 stdin으로 전달한다. 저장 입력이나 기억 파일을 `apply_patch` 같은 파일 편집 도구로 쓰지 않으며 임시 입력 파일도 만들지 않는다. 저장에 성공한 뒤에만 기록됐다고 말한다.

## 필요한 원본을 검색한다

```sh
node "<plugin-root>/scripts/context/cli.mjs" search --cwd "<checkout>" --query "저장 워크트리"
node "<plugin-root>/scripts/context/cli.mjs" read --cwd "<checkout>" --ref "note:context-cli@1"
```

`search`는 이 프로젝트의 원본 기억·체크포인트·추가 기록에서 BM25로 관련도를 계산하고 ref·범위·기록 시각·발췌를 반환한다. 기본 10개이며 `--limit`으로 조절한다. `--work`를 붙이면 프로젝트 공통 원본과 해당 업무로 범위를 좁힌다. 별도 검색 인덱스나 외부 서비스를 요구하지 않는다.

영문·숫자 토큰과 한글 단어·겹치는 두 글자 단위를 사용한다. 한국어 조사 차이를 일부 보완하지만 형태소 분석이나 의미 검색은 아니다. 적절한 검색어로 나누어 조사하고 `read`로 정확한 원본을 확인한다. `latest: false`는 이전 리비전이라는 뜻이며, 최신 여부나 검색 순위 자체가 판단의 유효성을 보장하지 않는다.

원본 ref는 `memory:<id>@<revision>`, `checkpoint:<work>@<revision>`, `note:<work>@<number>`다. 정리된 기억의 `sources`는 판단 근거, `supersedes`는 대체한 원본과의 연결이다.

정리된 항목의 `revision`과 `recordedAt`은 정리 결과의 버전과 반영 시각이다. 원래 발언·관찰의 시각이나 마지막 검증 시각을 뜻하지 않으며, 원본의 시각은 `sources`의 ref로 조회한다.

## 실행 환경을 준비한다

Node.js 20 이상과 Git이 필요하며 npm 의존성 설치는 필요하지 않다. 누락·지원하지 않는 버전은 종료 코드 `2`와 오류 식별자로 구분한다.

| 오류 | 필요한 조치 |
| --- | --- |
| `LOOM_NODE_MISSING` | 설치된 Node 경로를 연결하거나 Node를 설치한다. |
| `LOOM_NODE_UNSUPPORTED` | Node.js 20 이상인 지원 중 LTS를 선택하거나 설치한다. |
| `LOOM_GIT_MISSING` | 설치된 Git 경로를 연결하거나 Git을 설치한다. |
| `LOOM_GIT_UNUSABLE` | Git의 경로·권한·런타임을 확인하고 복구한다. |

같은 실행 환경에서 `node --version`, `git --version`을 확인한다. 호스트가 제공하는 런타임과 기존 버전 관리 도구를 먼저 확인한다. 없으면 해당 환경의 기존 패키지 관리자 또는 [Node](https://nodejs.org/en/download)·[Git](https://git-scm.com/install/) 공식 배포본으로 준비한다. 맥락 CLI를 위해 프로젝트의 Node 버전 설정을 바꾸지 않는다.

설정 후 버전을 다시 확인하고 실패한 원래 명령을 재시도한다. 버전 확인만 성공한 상태를 저장·복원의 성공으로 보고하지 않는다. 일반 저장소 오류는 종료 코드 `1`이며 Git 재설치·초기화로 해결하려 하지 않는다. Git은 같은 저장소의 워크트리를 식별하며 기록 저장·커밋에는 사용하지 않는다.

## 저장 권한과 실패를 처리한다

기억은 체크아웃 밖에 저장한다. 읽기 성공만으로 쓰기 권한이 있다고 판단하지 않는다.

1. `location`의 실제 경로와 호스트의 쓰기 허용 범위를 확인한다. `EPERM`·`EACCES`가 나면 샌드박스 제한과 파일 소유권·권한 문제를 구분한다. 쓰기 제한을 이미 확인했으면 같은 실패를 반복하지 않는다.
2. 호스트의 기존 승인 절차로 필요한 저장 명령의 권한을 요청한다. 실제 절대 경로, 다음 세션·다른 워크트리에서 합의와 상태를 다시 읽으려는 목적, 현재 쓰기가 제한된 이유를 포함한다. Codex의 `exec_command`에서는 `sandbox_permissions: "require_escalated"`와 그 사유를 담은 `justification`을 사용한다.
3. 승인되면 같은 프로젝트·데이터 경로·입력으로 재시도하고 결과를 다시 읽는다. record 재시도는 오류의 `--key`를 유지한다. 자동 승인이 가능해도 이 절차는 필요하며, 기억 파일 검토나 이미 정한 저장 선택의 재확인을 요구하지 않는다.

권한 요청 사유의 예:

> 다음 세션과 다른 워크트리에서도 맥락을 다시 읽도록 `<project-directory>`에 이 프로젝트의 기록을 저장하려 합니다. 이 경로가 현재 샌드박스의 쓰기 허용 범위 밖이어서 해당 저장 명령에 추가 권한이 필요합니다.

호스트가 권한을 제공하지 않거나 거부하면 실패한 경로·명령을 알린다. 다른 저장 경로로 조용히 전환하거나 파일·호스트 권한을 임의로 바꾸지 않는다. 맥락 저장·복원을 해결하지 못해도 현재 대화와 산출물로 맡긴 작업을 계속하고 그 한계를 알린다.

기록은 잠금과 임시 파일 교체로 보호한다. 남은 잠금은 오류의 PID와 실제 실행 프로세스를 대조한 뒤 작성자가 없음을 확인해야 제거한다. 손상되거나 지원하지 않는 형식의 데이터를 빈 기록으로 덮어쓰지 않는다.

## 저장 위치와 사용자 제어

| 실행 환경 | 기본 데이터 루트 |
| --- | --- |
| macOS | `~/Library/Application Support/loom` |
| Windows | `%LOCALAPPDATA%\loom` |
| Linux | `$XDG_DATA_HOME/loom`, 미설정 시 `~/.local/share/loom` |

절대 경로의 `--data-dir`, `LOOM_DATA_DIR`, 기본값 순으로 적용한다. 프로젝트 ID는 Git 공통 디렉터리의 실제 경로에서 구한다. 같은 로컬 저장소의 워크트리는 공유하며 별도 클론·기기 간 동기화는 제공하지 않는다. WSL은 Linux 경로를 사용한다.

```text
<data-root>/projects/<project-id>/
├── works/<work-id>/notes.json       일상 추가 기록
├── tidy.json                       정리된 기억·업무 상태와 처리 지점
├── tidy-snapshots/<id>.json         준비한 범위의 메타데이터
├── context/<memory-id>.json         기존 기억 원본
└── works/<work-id>/checkpoint.json  기존 진행 상태 원본
```

조회·수정 요청에는 해당 원본과 정리 결과를 확인한다. 정정은 새 기록을 남기고 tidy로 반영한다. 원본 기억 삭제는 `forget --id <id> --revision <n>`으로 모든 이전 리비전을 제거한다. 기존 원본이 있으면 `read`로 확인한 원본 리비전을 사용한다. tidy에서만 만든 기억은 `recall`의 리비전을 사용하며 정리 이력에서 제거한다. 일상 원본 삭제에는 `forget --ref note:<work>@<number>`를 사용한다. 원본 삭제 시 그 원본을 `sources`·`evidence`의 근거로 삼는 정리 결과도 모든 정리 이력에서 제거하며, 삭제된 입력의 재시도나 오래된 snapshot으로 되살리지 못하게 한다. `supersedes`로만 연결된 기억은 현재 근거가 남아 있으므로 해당 연결만 제거하고 유지한다.

기존 `remember`·`checkpoint` 호출과 데이터는 유지한다. 기존 형식을 직접 다룰 때만 [이전 명령 계약](context-legacy.md)을 읽는다. `location`·`recall`·`search`·`read`·`tidy status`는 조회만으로 저장 디렉터리를 만들지 않는다.
