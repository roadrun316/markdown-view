# markdown-view (/md)

Claude Code 의 응답을 Markdown 으로 렌더링해 보여주는 모드입니다.

- `/md` : 모든 세션의 응답을 모은 브라우저 미리보기를 엽니다. 머리말·목차·판단 카드·패널로 그리고, mermaid 도식을 그림으로 그립니다. 응답이 끝날 때마다 갱신됩니다.
  - **HTML 복사** : Confluence·Notion·메일·Word 같은 편집기에 붙여넣을 수 있는 형태로 복사합니다.
  - **원문 복사** : Markdown 원문을 복사합니다.
  - **삭제** : 보던 응답을 목록에서 지웁니다. 결과·세션 줄에 마우스를 올리면 나오는 × 로도 지울 수 있습니다(세션은 그때까지의 결과 전체). 그 브라우저에서만 숨기며 기록 파일과 `/md pane` 에는 남습니다. 왼쪽 위 **되돌리기**로 다시 보입니다.
- `/md pane [N]` : 터미널 옆 패널에 N 번째 최근 응답을 보여줍니다.
- `/md publish [N | 세션id#번호]` : 응답을 claude.ai Artifact 페이지로 발행해 달라고 Claude 에게 요청합니다.
- `/md close` : 패널을 닫습니다.

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install markdown-view --marketplace roadrun316/markdown-view
```

`Add marketplace?` 에 `y`, 이어서 범위(user 권장)를 Enter 로 고릅니다.

셸에서:

```sh
claude plugin install markdown-view --marketplace roadrun316/markdown-view
```

데스크톱 앱(`/plugin` 이 안 되는 곳): 프롬프트 상자 옆 + → Plugins → Add marketplace 에 `roadrun316/markdown-view` → Add plugin.

공개 저장소라 GitHub 로그인 없이 설치됩니다.

github.com 에 접속할 수 없는 PC 에서는 이 저장소를 zip 으로 받아 지우지 않을 곳에 풀고, 그 폴더를 마켓플레이스로 추가합니다:

```sh
claude plugin marketplace add "C:\Users\<사용자>\.claude\mods\markdown-view"
claude plugin install markdown-view@markdown-view
```

고친 판으로 바꿀 때는 같은 폴더에 덮어쓴 뒤 `claude plugin marketplace update markdown-view` 를 실행합니다.

## 보고서 관례 (자동)

`/md` 미리보기는 특정 Markdown 관례(`# 제목` + 결론 문단, `> [!주의] 제목` 콜아웃, `> [!DO]`/`> [!DONT]` 패널, 도식 뒤 `*설명*` 등)를 카드와 패널로 그립니다. 플러그인이 설치되면 이 관례([`docs/conventions.md`](docs/conventions.md))를 대화형 세션의 시스템 프롬프트에 덧붙이므로, `CLAUDE.md` 를 고치지 않아도 Claude 가 이 관례로 씁니다.

- 끄기: `/config` 에서 markdown-view 의 `보고서 관례 넣기` 를 끕니다.
- `~/.claude/CLAUDE.md` 에 이미 `/md 뷰어 관례` 가 적혀 있으면 두 번 넣지 않고 그쪽을 따릅니다.
- `claude -p` 같은 화면 없는 실행에는 넣지 않습니다.

## 참고

- 미리보기 페이지는 marked·DOMPurify·highlight.js·mermaid 를 CDN 에서 불러오므로 인터넷이 필요합니다.
- `/md publish` 는 claude.ai Artifact 를 쓰므로 Claude Code 가 claude.ai 계정으로 로그인되어 있어야 합니다.
- 응답 모음은 PC 마다 `~/.claude/markdown-view-hub` 에 따로 쌓입니다.
