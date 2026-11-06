import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const pane = { title: 'Markdown', isFocused: false, bodyColumns: 80, placement: 'inline' } as const

for (const surface of SURFACES) {
  test(`${surface}: 응답을 Markdown으로 그리고 이전/다음으로 넘긴다`, async ($, on) => {
    on('turn.complete', async () => ({ text: '' }))

    await $.turn.complete({ answer: '# 첫 응답\n\n- 항목', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.turn.complete({ answer: '## 두 번째\n\n`code`', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
    // 서브에이전트 응답은 무시
    await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer', agentId: 'a1' })

    const ui = await $.ui.mount({ plugin: 'markdown-view', surface, component: 'Pane', requestId: 'markdown-view', props: pane as never })
    expect((await ui.find({ key: 'body' }))?.text).toBe('## 두 번째\n\n`code`')

    await ui.press({ key: 'prev' })
    expect((await ui.find({ key: 'body' }))?.text).toBe('# 첫 응답\n\n- 항목')

    await ui.press({ key: 'next' })
    expect((await ui.find({ key: 'body' }))?.text).toBe('## 두 번째\n\n`code`')
  })
}

test('응답 위에 그 응답을 부른 질의를 함께 그린다', async ($, on) => {
  on('turn.start', async (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }))
  // 엔진 쪽: 입력이 들어가면 그 턴을 시작한다
  on('prompt.submit', async (_$: unknown, e: { text: string }) => {
    await $.turn.start({ text: '<command-name>/review</command-name> 펼친 스킬 본문', turnId: 't2' })
    return { text: e.text }
  })

  // 질의를 친 턴: turn.start 의 글을 쓴다 (시스템 태그는 걷어 낸다)
  await $.turn.start({ text: '<system-reminder>x</system-reminder>로그 분석해 줘', turnId: 't1' })
  await $.turn.complete({ answer: '# 분석', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ plugin: 'markdown-view', surface: 'terminal', component: 'Pane', requestId: 'markdown-view', props: pane as never })
  expect((await ui.find({ key: 'prompt' }))?.text).toBe('질의 ›로그 분석해 줘')

  // 명령으로 시작한 턴: 펼친 본문이 아니라 친 명령줄
  await $.prompt.submit({ text: '/review', command: { name: 'review', args: 'the diff' }, wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.complete({ answer: '리뷰', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect((await ui.find({ key: 'prompt' }))?.text).toBe('질의 ›/review the diff')

  // 질의 없이 시작한 턴은 질의 줄이 없다
  await $.turn.start({ text: '', turnId: 't3' })
  await $.turn.complete({ answer: '이어서', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  expect(await ui.find({ key: 'prompt' })).toBeUndefined()
})
