import { expect, test } from 'claude-code/testing'

const ID = 'markdown-view:conventions'

// 엔진 쪽: 기본 시스템 프롬프트와 파일 몇 개
const engine = (on: any, files: Record<string, string>) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: '기본', scope: 'shared' }] }))
  on('env.get', async (_$: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    const path = e.path.replace(/\\/g, '/')
    const hit = Object.entries(files).find(([k]) => path.endsWith(k))
    if (hit === undefined) throw new Error('ENOENT')
    return { value: hit[1] }
  })
}

// 엔진이 시스템 프롬프트를 만들 때 넘기는 입력
const input = (surfaces: ('terminal' | 'desktop')[]) =>
  ({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces, tools: [], outputStyle: null, traits: [] })

const DOC = { '/docs/conventions.md': '## 보고서 형식: /md 뷰어 관례\n\n- 첫 줄은 `# 제목`' }

test('대화형 세션의 시스템 프롬프트 끝에 보고서 관례를 붙인다', async ($, on) => {
  engine(on, DOC)
  const out = await $.prompt.compose(input(['terminal']))
  expect(out.sections.map(s => s.id)).toEqual(['intro', ID])
  const added = out.sections[1]!
  expect(added.scope).toBe('session')
  expect(added.text).toContain('- 첫 줄은 `# 제목`')

  // 두 번째 요청에도 같은 섹션이 한 번만 붙는다
  const again = await $.prompt.compose(input(['terminal']))
  expect(again.sections.filter(s => s.id === ID).length).toBe(1)
})

test('CLAUDE.md 에 이미 관례가 있으면 붙이지 않는다', async ($, on) => {
  engine(on, { ...DOC, '/me/.claude/CLAUDE.md': '## 보고서 형식: /md 뷰어 관례 (사용자 지정)' })
  const out = await $.prompt.compose(input(['terminal']))
  expect(out.sections.map(s => s.id)).toEqual(['intro'])
})

test('화면이 없는 실행(claude -p)에는 붙이지 않는다', async ($, on) => {
  engine(on, DOC)
  const out = await $.prompt.compose(input([]))
  expect(out.sections.map(s => s.id)).toEqual(['intro'])
})

test('설정에서 끄면 붙이지 않는다', { options: { conventions: false } }, async ($, on) => {
  engine(on, DOC)
  const out = await $.prompt.compose(input(['terminal']))
  expect(out.sections.map(s => s.id)).toEqual(['intro'])
})
