import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Answer, HubSession } from '../types'

const PANE = 'markdown-view'
const KEEP = 50
// 허브 목록에 올리는 세션: 최근 30일, 최대 300개
const KEEP_DAYS = 30
const MAX_SESSIONS = 300

const answers = atom({ plugin: 'markdown-view', key: 'answers' } as const, [])
const selected = atom({ plugin: 'markdown-view', key: 'selected' } as const, null)
const hubSession = atom({ plugin: 'markdown-view', key: 'hub' } as const, null)

// 질의는 화면에 다 보일 만큼만 남긴다
const PROMPT_MAX = 4000

// 턴마다 그 턴을 부른 질의 (turnId -> 질의). 모드가 다시 읽히면 비지만, 다시 읽히는 건 턴이 끝난 뒤다.
const prompts = new Map<string, string>()
// prompt.submit 이 next 를 부르는 동안만 들고 있는, 막 입력한 질의. 그 사이 시작한 턴이 가져간다.
let submitted: string | null = null

const clock = (at: number) => {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 이 PC 의 모든 세션이 같이 쓰는 폴더: ~/.claude/markdown-view-hub
//   index.html        브라우저 페이지
//   index.js          세션 목록 (sessions/ 를 나열해 만든다)
//   sessions/<id>.js  세션 하나의 응답들
//   focus.js          /md 를 친 세션 (페이지가 그 세션으로 옮겨 간다)
const hubDir = async ($: EngineInterface) => {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  return `${home.replace(/\\/g, '/')}/.claude/markdown-view-hub`
}

const wrap = (fn: string, value: unknown) => `window.${fn}(${JSON.stringify(value)})\n`
const unwrap = (text: string): unknown => JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')))

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const stripTags = (text: string) => text.replace(/<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi, ' ')

// 첫 사용자 프롬프트를 세션 제목으로 쓴다 (시스템 태그는 걷어 낸다).
const firstPrompt = async ($: EngineInterface): Promise<string | null> => {
  const messages = await $.session.messages().catch(() => [])
  for (const m of messages) {
    if (m.role !== 'user') continue
    const text = stripTags(m.text).replace(/\s+/g, ' ').trim()
    if (text !== '') return text.slice(0, 120)
  }
  return null
}

// 이 세션을 허브에 묶는다. 세션 id 가 바뀌었으면 (/clear, resume) 그 id 의 기록을 이어 받는다.
const bindSession = async ($: EngineInterface): Promise<HubSession> => {
  const id = await $.session.id()
  const current = await read($, hubSession)
  if (current !== null && current.id === id) {
    if (current.label !== null) return current
    const label = await firstPrompt($)
    if (label === null) return current
    const next = { ...current, label }
    await update($, hubSession, () => next)
    return next
  }

  const dir = await hubDir($)
  const prev = await $.fs.read(`${dir}/sessions/${id}.js`)
    .then(text => unwrap(text as string) as Partial<HubSession> & { answers?: Answer[] })
    .catch(() => null)
  const root = await $.session.root()
  const next: HubSession = {
    id,
    root,
    project: baseName(root),
    label: prev?.label ?? (await firstPrompt($)),
    startedAt: prev?.startedAt ?? Date.now(),
  }
  // 처음 묶일 때 기록이 없으면 이 세션이 이미 모은 응답을 그대로 둔다.
  if (prev !== null || current !== null) {
    await update($, answers, () => (prev?.answers ?? []).slice(-KEEP))
    await update($, selected, () => null)
  }
  await update($, hubSession, () => next)
  return next
}

const writeIndex = async ($: EngineInterface, dir: string) => {
  const now = Date.now()
  const entries = (await $.fs.list(`${dir}/sessions`).catch(() => []))
    .filter(f => f.kind === 'file' && f.name.endsWith('.js') && now - f.mtimeMs < KEEP_DAYS * 86_400_000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SESSIONS)
    .map(f => ({ id: f.name.slice(0, -3), mtime: f.mtimeMs }))
  await $.fs.write(`${dir}/index.js`, wrap('__mdhubIndex', { version: now, sessions: entries }))
}

const writeSession = async ($: EngineInterface, endedAt: number | null = null) => {
  const hub = await read($, hubSession)
  if (hub === null) return
  const dir = await hubDir($)
  const record = { ...hub, updatedAt: Date.now(), endedAt, answers: await read($, answers) }
  await $.fs.write(`${dir}/sessions/${hub.id}.js`, wrap('__mdhub', record))
  await writeIndex($, dir)
}

// 헤드리스 실행(claude -p, 앱이 부르는 CLI)은 그리는 화면이 없다: 허브에 올리지 않는다.
const isInteractive = async ($: EngineInterface) => (await $.session.surfaces().catch(() => [])).length > 0

const openHub = async ($: EngineInterface) => {
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const dir = await hubDir($)
  const hub = await bindSession($)
  await writeSession($)
  // 열 때마다 페이지를 새로 깔아 모드가 고친 HTML 이 반영되게 한다.
  await $.fs.write(`${dir}/index.html`, await $.fs.read(`${$.plugin.root}/preview/index.html`) as string)
  await $.fs.write(`${dir}/focus.js`, wrap('__mdhubFocus', { id: hub.id, at: Date.now() }))

  const page = `${dir}/index.html`
  const argv = isWindows
    ? ['rundll32', 'url.dll,FileProtocolHandler', page.replace(/\//g, '\\')]
    : ['xdg-open', page]
  const ran = await $.process.run(argv).catch(() => $.process.run(['open', page]))
  return ran.exitCode === 0 ? page : undefined
}

// /md publish: 응답 하나를 Claude 에게 넘겨 Artifact 페이지로 발행하게 한다.
//   /md publish          이 세션의 최신 응답
//   /md publish N        이 세션의 N번째 최근 응답 (1 = 최신)
//   /md publish <id>#<k> 허브의 다른 세션 (브라우저의 "아티팩트로 발행" 버튼이 이 줄을 복사한다)
type Target = { sid: string; n: number; answer: Answer; project: string; label: string | null }

// 발행 요청 프롬프트의 첫 줄. turn.start 가 이 표시를 보고 질의를 명령줄로 남긴다.
const PUBLISH_MARK = /^\[md publish ([^\]\s]+)\]/
const PUBLISH_USAGE = '사용법: /md publish [N | <세션id>#<번호>]  (N: 1 = 최신 응답)'

const pickTarget = async ($: EngineInterface, arg: string): Promise<Target | string> => {
  const other = /^([0-9a-z-]{4,})#(\d+)$/i.exec(arg)
  if (other !== null) {
    const [, prefix, nText] = other as unknown as [string, string, string]
    const dir = await hubDir($)
    const hits = (await $.fs.list(`${dir}/sessions`).catch(() => []))
      .filter(f => f.kind === 'file' && f.name.endsWith('.js') && f.name.startsWith(prefix))
    if (hits.length === 0) return `허브에서 ${prefix} 세션을 찾지 못했습니다.`
    if (hits.length > 1) return `${prefix}(으)로 시작하는 세션이 여럿입니다. id 를 더 길게 적어 주세요.`
    const record = unwrap(await $.fs.read(`${dir}/sessions/${hits[0]!.name}`) as string) as HubSession & { answers?: Answer[] }
    const n = Number(nText)
    const answer = record.answers?.[n - 1]
    if (answer === undefined) return `그 세션에는 #${n} 응답이 없습니다 (응답 ${record.answers?.length ?? 0}개).`
    return { sid: record.id, n, answer, project: record.project, label: record.label }
  }
  if (arg !== '' && !/^\d+$/.test(arg)) return PUBLISH_USAGE
  const list = await read($, answers)
  const nth = arg === '' ? 1 : Number(arg)
  if (list.length === 0) return '발행할 응답이 아직 없습니다.'
  if (nth < 1 || nth > list.length) return `1~${list.length} 사이로 골라 주세요 (1 = 최신).`
  const hub = await read($, hubSession)
  const sid = hub?.id ?? (await $.session.id())
  const root = hub?.root ?? (await $.session.root())
  return { sid, n: list.length - nth + 1, answer: list[list.length - nth]!, project: baseName(root), label: hub?.label ?? null }
}

const stamp = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${clock(at)}`
}

const publishPrompt = (t: Target, tag: string, base: string, prevUrl: string) => {
  const query = t.answer.prompt === undefined ? '(없음)' : t.answer.prompt.replace(/\s+/g, ' ').slice(0, 300)
  return [
    `[md publish ${tag}] 이전 Claude 응답 하나를 Artifact 페이지로 발행해 줘.`,
    '',
    `- 원문 Markdown: ${base}.md (Read 로 끝까지 읽는다)`,
    `- 출처: ${t.project} · ${t.label ?? '(제목 없음)'} · #${t.n} · ${stamp(t.answer.at)}`,
    `- 그 응답을 부른 질의: ${query}`,
    ...(prevUrl === '' ? [] : [`- 전에 발행한 페이지: ${prevUrl} — 새로 만들지 말고 이 URL 을 read 한 뒤 같은 URL 로 갱신한다.`]),
    '',
    '만드는 방법',
    '1. 원문의 사실·수치·경로·코드·결론은 그대로 옮긴다. 빼거나 지어내지 않고 문장만 다듬는다.',
    '2. 머리말: eyebrow(출처·날짜), 제목, 핵심을 담은 한두 문장 lede, 섹션 목차.',
    '3. 섹션마다 제목과 한 줄 요약을 둔다. 표는 테두리 상자에 넣고, 주의·확인·원인 같은 판단은 칩을 단 카드로, 할 일/안 할 일처럼 맞서는 목록은 두 칸 패널로 보여 준다.',
    '4. mermaid 도식은 같은 내용을 인라인 SVG 로 다시 그린다. 원문에 없는 컴포넌트나 단계를 더하지 않는다. 도식마다 PNG 로 클립보드에 복사하는 "이미지 복사" 버튼을 둔다.',
    '5. 색은 :root 토큰으로 정의하고 라이트·다크를 모두 맞춘다.',
    `6. 발행이 끝나면 페이지 URL 한 줄만 ${base}.url 에 쓴다 (다음에 같은 응답을 발행할 때 같은 URL 을 갱신하려고). 답은 링크와 한 줄 요약만.`,
  ].join('\n')
}

// 원문을 허브의 publish/ 에 두고 발행 요청을 Claude 에게 보낸다 (세션이 한가해지면 한 턴으로 돈다).
const publish = async ($: EngineInterface, t: Target) => {
  const dir = await hubDir($)
  const base = `${dir}/publish/${t.sid.slice(0, 8)}-${t.answer.at}`
  await $.fs.write(`${base}.md`, t.answer.text)
  const prevUrl = await $.fs.read(`${base}.url`).then(text => (text as string).trim()).catch(() => '')
  const tag = `${t.sid.slice(0, 8)}#${t.n}`
  // command.run 안에서 바로 submit 하면 그 명령이 쥔 턴을 기다리게 되므로 타이머로 한 박자 미룬다
  $.clock.after(0, () => {
    void $.prompt.submit({ text: publishPrompt(t, tag, base, prevUrl), asUser: true })
      .catch((err: unknown) => $.ui.toast(`발행 요청을 보내지 못했습니다: ${err instanceof Error ? err.message : String(err)}`))
  })
  return { tag, md: `${base}.md`, isUpdate: prevUrl !== '' }
}

// /md 뷰어 보고서 관례 (docs/conventions.md) 를 시스템 프롬프트에 덧붙인다.
// ~/.claude/CLAUDE.md 에 이미 같은 관례가 있으면 두 번 넣지 않는다.
const CONVENTIONS_ID = 'markdown-view:conventions'
const CONVENTIONS_MARK = '/md 뷰어 관례'
const readConventions = async ($: EngineInterface): Promise<string | null> => {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'
  const own = await $.fs.read(`${home.replace(/\\/g, '/')}/.claude/CLAUDE.md`).then(t => t as string).catch(() => '')
  if (own.includes(CONVENTIONS_MARK)) return null
  const text = (await $.fs.read(`${$.plugin.root}/docs/conventions.md`) as string).trim()
  return [
    '# 보고서 관례 (markdown-view 플러그인)',
    '',
    '이 PC 에는 Claude 응답을 그려 주는 `/md` 뷰어(markdown-view 플러그인)가 설치되어 있다. 응답을 쓸 때 아래 관례를 따른다.',
    '',
    text,
  ].join('\n')
}

export const register: Register = (on, options) => {
  if (options.conventions !== false) {
    // 모드가 다시 읽힐 때마다 한 번만 읽는다
    let conventions: Promise<string | null> | null = null
    on('prompt.compose', async ($, e, next) => {
      const composed = await next(e)
      // 화면이 없는 실행(claude -p)은 /md 로 볼 일이 없다
      if (e.surfaces.length === 0) return composed
      conventions ??= readConventions($).catch(() => null)
      const text = await conventions
      if (text === null || composed.sections.some(s => s.id === CONVENTIONS_ID)) return composed
      return { sections: [...composed.sections, { id: CONVENTIONS_ID, text, scope: 'session' as const }] }
    })
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'md',
      description: '모든 세션의 Claude 응답을 Markdown 미리보기로 보기 (/md 브라우저, /md pane [N] 터미널 패널, /md publish [N] Artifact 페이지로 발행, /md close)',
      argumentHint: '[pane [N] | publish [N | 세션id#번호] | close]',
    })

    return next(e)
  })

  on('command.run', { command: 'md' }, async ($, e) => {
    const [sub = '', nthArg = ''] = e.args.trim().split(/\s+/)

    if (sub === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Markdown 패널을 닫았습니다.' }
    }

    if (sub === 'publish') {
      const target = await pickTarget($, nthArg)
      if (typeof target === 'string') return { text: target }
      const sent = await publish($, target)
      return {
        text: `${sent.tag} 응답을 Artifact 페이지로 ${sent.isUpdate ? '다시 발행(같은 URL 갱신)' : '발행'}하도록 Claude 에게 요청했습니다.\n원문: ${sent.md}`,
      }
    }

    if (sub === 'pane') {
      const list = await read($, answers)
      const nth = Number.parseInt(nthArg, 10)
      // /md pane 1 = 최신, /md pane 2 = 그 이전 ...
      const to = Number.isInteger(nth) && nth >= 1 && nth <= list.length ? list.length - nth : null
      await update($, selected, () => to)
      await $.ui.open({ id: PANE, title: 'Markdown', focus: true })
      return { text: 'Markdown 패널을 열었습니다.' }
    }

    const page = await openHub($)
    return {
      text: page === undefined
        ? '브라우저를 열지 못했습니다.'
        : `모든 세션의 응답을 모은 미리보기를 열었습니다. 어느 세션이든 응답이 끝나면 자동으로 갱신됩니다.\n${page}`,
    }
  })

  // 질의는 입력한 그대로 남긴다: 스킬·명령은 펼친 본문이 아니라 친 명령줄로.
  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta === true || e.origin.kind === 'task-notification') return next(e)
    const text = (e.command === undefined ? e.text : `/${e.command.name} ${e.command.args}`).trim().slice(0, PROMPT_MAX)
    if (text === '') return next(e)
    // 돌고 있는 턴에 끼어든 질의는 그 턴의 질의에 붙인다
    if (e.turnId !== undefined) {
      const before = prompts.get(e.turnId)
      prompts.set(e.turnId, before === undefined ? text : `${before}\n\n${text}`)
      return next(e)
    }
    submitted = text
    try {
      return await next(e)
    } finally {
      submitted = null
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      // 이 모드가 보낸 발행 요청은 펼친 프롬프트 대신 명령줄로 남긴다
      const mark = PUBLISH_MARK.exec(stripTags(e.text).trim())
      const text = mark !== null ? `/md publish ${mark[1]}` : submitted ?? stripTags(e.text).trim().slice(0, PROMPT_MAX)
      if (text !== '') prompts.set(e.turnId, text)
      submitted = null
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // 메인 대화의 응답만 (서브에이전트 응답 제외)
    if (e.agentId === undefined && e.answer.trim() !== '') {
      const interactive = await isInteractive($)
      if (interactive) await bindSession($)
      const prompt = prompts.get(e.turnId)
      const answer: Answer = { turnId: e.turnId, text: e.answer, at: Date.now(), ...(prompt === undefined ? {} : { prompt }) }
      await update($, answers, list => [...list, answer].slice(-KEEP))
      await update($, selected, () => null)
      if (interactive) await writeSession($)
    }

    if (e.agentId === undefined) prompts.delete(e.turnId)
    return done
  })

  on('session.end', async ($, e, next) => {
    const hub = await read($, hubSession)
    if (hub !== null && hub.id === e.sessionId) await writeSession($, Date.now()).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const list = await read($, answers)
    const picked = await read($, selected)

    if (list.length === 0) {
      return <Text dimColor>아직 Claude 응답이 없습니다. 응답이 끝나면 여기에 Markdown으로 표시됩니다.</Text>
    }

    const index = picked === null ? list.length - 1 : Math.min(Math.max(picked, 0), list.length - 1)
    const answer = list[index]!
    const go = (to: number) => update($, selected, () => (to >= list.length - 1 ? null : to))

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text dimColor>
            {index + 1}/{list.length} · {clock(answer.at)}
            {picked === null ? ' · 최신 따라가기' : ''}
          </Text>
          <Button key="prev" hotkey="p" plain dimColor={index === 0} onPress={() => go(Math.max(0, index - 1))}>
            이전
          </Button>
          <Button key="next" hotkey="n" plain dimColor={index === list.length - 1} onPress={() => go(index + 1)}>
            다음
          </Button>
          <Button key="browser" hotkey="b" plain onPress={async () => {
            $.ui.toast((await openHub($)) === undefined ? '브라우저를 열지 못했습니다.' : '브라우저 미리보기를 열었습니다.')
          }}>
            브라우저
          </Button>
          <Button key="publish" hotkey="a" plain onPress={async () => {
            const hub = await read($, hubSession)
            const sid = hub?.id ?? (await $.session.id())
            const root = hub?.root ?? (await $.session.root())
            const sent = await publish($, { sid, n: index + 1, answer, project: baseName(root), label: hub?.label ?? null })
            $.ui.toast(`${sent.tag} 응답의 Artifact 발행을 Claude 에게 요청했습니다.`)
          }}>
            발행
          </Button>
          <Button key="copy" hotkey="c" plain onPress={async pe => {
            const copied = await $.ui.copy({ text: answer.text, surface: pe.surface })
            $.ui.toast(copied.isCopied ? 'Markdown 원문을 복사했습니다.' : `복사 실패: ${copied.reason}`)
          }}>
            복사
          </Button>
          <Button key="close" hotkey="x" plain role="dismiss" onPress={() => $.ui.close({ id: PANE })}>
            닫기
          </Button>
        </Box>
        {answer.prompt === undefined ? null : (
          <Box key="prompt" flexDirection="row" gap={1}>
            <Text bold>질의 ›</Text>
            <Text dimColor>{answer.prompt}</Text>
          </Box>
        )}
        <Markdown key="body" text={answer.text} />
      </Box>
    )
  })
}
