import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownText } from './markdown.js'

describe('MarkdownText', () => {
  it('renders common Kanban card markdown without escaping it as plain text', () => {
    const html = renderToStaticMarkup(
      <MarkdownText
        compact
        content={[
          '**Acceptance**',
          '',
          '- [x] Workspace artifact uploaded',
          '- [ ] QA approved',
          '',
          '[Open file](workspace://outputs/brief.md)',
        ].join('\n')}
      />,
    )

    expect(html).toContain('<strong>Acceptance</strong>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('href="workspace://outputs/brief.md"')
  })
})
