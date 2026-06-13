import { describe, expect, it } from 'vitest'
import { splitHermesToolCalls } from './hermes-tool-parser'

describe('splitHermesToolCalls', () => {
  it('captures Hermes file and delegated task calls', () => {
    const result = splitHermesToolCalls(
      [
        '需要中文字体。用 Noto 字体:',
        '🔧 patch: "/tmp/gen_openai_pdf.py"',
        '🔀 delegate_task: "Research OpenAI governance structure"',
      ].join('\n'),
    )

    expect(result.content).toBe('需要中文字体。用 Noto 字体:')
    expect(result.toolCalls).toMatchObject([
      { name: 'patch', value: '/tmp/gen_openai_pdf.py', kind: 'file' },
      { name: 'delegate_task', value: 'Research OpenAI governance structure', kind: 'todo' },
    ])
  })

  it('keeps unescaped shell quotes inside terminal commands', () => {
    const result = splitHermesToolCalls(
      'terminal: "BIND="--task-message-id ec623c20-b63f" shadowob inbox update"',
    )

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]).toMatchObject({
      name: 'terminal',
      value: 'BIND="--task-message-id ec623c20-b63f" shadowob inbox update',
    })
  })

  it('captures Hermes memory, session search, cron, and file search calls', () => {
    const result = splitHermesToolCalls(
      [
        '🧠 memory: "+memory: "Knowledge base v3: ~/.her...""',
        '🧠 memory: "~memory: "Tech news sync scrip""',
        '🧠 memory: "~memory: "Tech news Q&A pipeli""',
        '🔍 session_search: "recall: "tech-news-to-answers cron...""',
        '⏰ cronjob: "update"',
        '⏰ cronjob: "list"',
        '🔍 session_search: "recall: "cron prompt update tech-n...""',
        '🔎 search_files: "cron.*9ee2ca4d4356"',
      ].join('\n'),
    )

    expect(result.content).toBe('')
    expect(result.toolCalls).toMatchObject([
      { name: 'memory', value: '+memory: "Knowledge base v3: ~/.her..."', kind: 'tool' },
      { name: 'memory', value: '~memory: "Tech news sync scrip"', kind: 'tool' },
      { name: 'memory', value: '~memory: "Tech news Q&A pipeli"', kind: 'tool' },
      { name: 'session_search', value: 'recall: "tech-news-to-answers cron..."', kind: 'tool' },
      { name: 'cronjob', value: 'update', kind: 'todo' },
      { name: 'cronjob', value: 'list', kind: 'todo' },
      { name: 'session_search', value: 'recall: "cron prompt update tech-n..."', kind: 'tool' },
      { name: 'search_files', value: 'cron.*9ee2ca4d4356', kind: 'file' },
    ])
  })

  it('captures bare Hermes tool status lines', () => {
    const result = splitHermesToolCalls('🌑 shadowob_send_message...')

    expect(result.content).toBe('')
    expect(result.toolCalls).toMatchObject([
      { name: 'shadowob_send_message', value: 'shadowob_send_message', kind: 'tool' },
    ])
  })
})
