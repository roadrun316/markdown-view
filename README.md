# markdown-view (/md)

Claude Code 의 응답을 Markdown 으로 렌더링해 보여주는 모드입니다.

- `/md` : 모든 세션의 응답을 모은 브라우저 미리보기를 엽니다. 머리말·목차·판단 카드·패널로 그리고, mermaid 도식을 그림으로 그립니다. 응답이 끝날 때마다 갱신됩니다.
  - **HTML 복사** : Confluence·Notion·메일·Word 같은 편집기에 붙여넣을 수 있는 형태로 복사합니다.
  - **원문 복사** : Markdown 원문을 복사합니다.
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

이 저장소는 비공개입니다. 이 저장소를 읽을 수 있는 GitHub 계정이어야 하고, 그 PC 에 github.com 용 git 자격 증명이 이미 있어야 합니다 (SSH 키, 또는 `gh auth login` 뒤 `gh auth setup-git`). 설치 중에 로그인을 묻지 않습니다.

## 보고서 관례 (선택)

`/md` 미리보기는 특정 Markdown 관례(`# 제목` + 결론 문단, `> [!주의] 제목` 콜아웃, `> [!DO]`/`> [!DONT]` 패널, 도식 뒤 `*설명*` 등)를 카드와 패널로 그립니다. Claude 가 이 관례로 쓰게 하려면 [`docs/claude-md-snippet.md`](docs/claude-md-snippet.md) 내용을 `~/.claude/CLAUDE.md` 끝에 붙입니다.

## 참고

- 미리보기 페이지는 marked·DOMPurify·highlight.js·mermaid 를 CDN 에서 불러오므로 인터넷이 필요합니다.
- `/md publish` 는 claude.ai Artifact 를 쓰므로 Claude Code 가 claude.ai 계정으로 로그인되어 있어야 합니다.
- 응답 모음은 PC 마다 `~/.claude/markdown-view-hub` 에 따로 쌓입니다.
