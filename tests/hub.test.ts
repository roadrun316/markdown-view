import { expect, mock, test } from 'claude-code/testing'

const HUB = 'C:/Users/me/.claude/markdown-view-hub'
const unwrap = (text: string) => JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')))
// 엔진이 Windows 에서 경로를 역슬래시로 바꿔 넘기므로 / 로 맞춰 저장한다
const norm = (path: string) => path.replace(/\\/g, '/')

// 파일 시스템과 세션 정보를 메모리로 흉내 낸다
const fake = (on: any, opts: { surfaces: string[] }) => {
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let sid = 's1'
  on('session.surfaces', async () => ({ value: opts.surfaces }))
  on('session.id', async () => ({ value: sid }))
  on('session.root', async () => ({ value: 'E:\\GitHub\\VibeCoding' }))
  on('session.messages', async () => ({ value: [
    { role: 'user', text: '<system-reminder>무시</system-reminder>\n  허브 만들어 줘  ', toolUses: [] },
    { role: 'assistant', text: '네', toolUses: [] },
  ] }))
  on('env.get', async (_$: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined }))
  on('fs.write', async (_$: unknown, e: { path: string; text: string }) => {
    files.set(norm(e.path), e.text)
    mtimes.set(norm(e.path), mtimes.size + Date.now())
    return { value: undefined }
  })
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    const text = files.get(norm(e.path))
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.list', async (_$: unknown, e: { path: string }) => {
    const dir = `${norm(e.path)}/`
    return { value: [...files.keys()]
      .filter(p => p.startsWith(dir))
      .map(p => ({ name: p.slice(dir.length), kind: 'file', size: 1, mtimeMs: mtimes.get(p)!, isLink: false })) }
  })
  return { files, setSession: (id: string) => { sid = id } }
}

const turn = (turnId: string, answer: string) =>
  ({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' }) as const

test('대화형 세션의 응답을 허브 폴더에 세션별로 쓰고 목록을 만든다', async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  on('session.end', async (_$: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))
  const { files, setSession } = fake(on, { surfaces: ['terminal'] })

  await $.turn.complete(turn('t1', '# 첫 응답'))
  await $.turn.complete(turn('t2', '두 번째'))

  const s1 = unwrap(files.get(`${HUB}/sessions/s1.js`)!)
  expect(s1.project).toBe('VibeCoding')
  expect(s1.label).toBe('허브 만들어 줘')
  expect(s1.answers.map((a: { text: string }) => a.text)).toEqual(['# 첫 응답', '두 번째'])
  expect(s1.endedAt).toBe(null)

  // /clear 로 세션 id 가 바뀌면 새 세션 파일에 따로 쌓인다
  setSession('s2')
  await $.turn.complete(turn('t3', '새 세션'))
  const s2 = unwrap(files.get(`${HUB}/sessions/s2.js`)!)
  expect(s2.answers.map((a: { text: string }) => a.text)).toEqual(['새 세션'])

  const index = unwrap(files.get(`${HUB}/index.js`)!)
  expect(index.sessions.map((s: { id: string }) => s.id).sort()).toEqual(['s1', 's2'])

  // 원래 id 로 돌아오면 (resume) 그 세션 기록을 이어 받는다
  setSession('s1')
  await $.turn.complete(turn('t4', '이어서'))
  expect(unwrap(files.get(`${HUB}/sessions/s1.js`)!).answers.length).toBe(3)

  await $.session.end({ reason: 'exit', sessionId: 's1', resume: { id: 's1' } } as never)
  expect(unwrap(files.get(`${HUB}/sessions/s1.js`)!).endedAt).toBeGreaterThan(0)
})

test('헤드리스 실행(claude -p)은 허브에 쓰지 않는다', async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  const { files } = fake(on, { surfaces: [] })

  await $.turn.complete(turn('t1', '응답'))
  expect(files.size).toBe(0)
})

test('/md publish 는 원문을 허브에 두고 Claude 에게 발행 요청을 보낸다', async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  on('turn.start', async (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  const { files, setSession } = fake(on, { surfaces: ['terminal'] })
  const toasts: string[] = []
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
  const sent: string[] = []
  on('prompt.submit', async (_$: unknown, e: { text: string }) => { sent.push(e.text); return { text: e.text } })
  const clock = mock.clock(on, { now: Date.now() })
  // 발행 요청은 명령이 끝난 다음 박자에 나간다
  const run = async (args: string) => {
    const out = await ($.command.run({ command: 'md', args, origin: { kind: 'composer' } } as never) as Promise<{ text?: string }>)
    await clock.advance(1)
    return out
  }

  setSession('abcd1234-0000')
  await $.turn.complete(turn('t1', '# 첫 응답'))
  await $.turn.complete(turn('t2', '## 두 번째'))

  // N = 1 이 최신, 2 는 그 이전
  const out = await run('publish 2')
  expect(out.text).toContain('abcd1234#1')
  const mdPath = [...files.keys()].find(p => p.startsWith(`${HUB}/publish/abcd1234-`) && p.endsWith('.md'))!
  expect(files.get(mdPath)).toBe('# 첫 응답')
  expect(toasts).toEqual([])
  expect(sent.length).toBe(1)
  expect(sent[0]!.startsWith('[md publish abcd1234#1]')).toBe(true)
  expect(sent[0]).toContain(mdPath)
  expect(sent[0]).not.toContain('전에 발행한 페이지')

  // 전에 발행한 URL 이 있으면 같은 URL 을 갱신하라고 한다
  files.set(mdPath.replace(/\.md$/, '.url'), 'https://claude.ai/artifact/abc\n')
  expect((await run('publish abcd#1')).text).toContain('같은 URL')
  expect(sent[1]).toContain('전에 발행한 페이지: https://claude.ai/artifact/abc')

  // 발행 턴의 질의는 펼친 프롬프트가 아니라 명령줄로 남긴다
  await $.turn.start({ text: sent[1]!, turnId: 't3' })
  await $.turn.complete(turn('t3', 'https://claude.ai/artifact/abc'))
  const s = unwrap(files.get(`${HUB}/sessions/abcd1234-0000.js`)!)
  expect(s.answers[2].prompt).toBe('/md publish abcd1234#1')

  // 잘못 고르면 요청을 보내지 않고 이유를 말한다
  expect((await run('publish 9')).text).toContain('1~3')
  expect((await run('publish zzzz#1')).text).toContain('찾지 못했습니다')
  expect((await run('publish x')).text).toContain('사용법')
  expect(sent.length).toBe(2)
})
