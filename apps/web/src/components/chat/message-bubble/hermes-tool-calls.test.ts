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
})
