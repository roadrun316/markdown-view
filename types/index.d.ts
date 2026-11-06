// prompt: 그 응답을 부른 사용자 질의. 질의 없이 시작한 턴(작업 알림, 이어 가기)이나 예전 기록은 없다.
export type Answer = { turnId: string; text: string; at: number; prompt?: string }

// 허브에 이 세션을 쓸 때의 머리 정보. 세션 id 가 바뀌면 (/clear, resume) 새로 만든다.
export type HubSession = {
  id: string
  root: string
  project: string
  // 세션의 첫 프롬프트 (세션 목록의 제목). 아직 못 읽었으면 null.
  label: string | null
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'markdown-view': {
      answers: Answer[]
      // 보고 있는 응답의 위치. null 이면 항상 최신 응답을 따라간다.
      selected: number | null
      // 허브에 쓰는 이 세션. 헤드리스(-p) 실행이면 null 로 남는다.
      hub: HubSession | null
    }
  }
}
