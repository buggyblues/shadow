export function renderMarkdownToHtml(md: string): string {
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, lang, code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`,
  )

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')

  html = html.replace(/^---$/gm, '<hr />')

  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  )

  html = html.replace(/^(?!<[a-z])((?!<\/)[^\n]+)$/gm, (line) => {
    if (/^<(h[1-6]|pre|ul|ol|li|blockquote|hr|table|thead|tbody|tr|th|td)/.test(line)) return line
    return line ? `<p>${line}</p>` : ''
  })

  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_m, headerRow, bodyRows) => {
    const headers = (headerRow as string)
      .split('|')
      .map((h: string) => h.trim())
      .filter(Boolean)
    const rows = (bodyRows as string)
      .trim()
      .split('\n')
      .map((row: string) =>
        row
          .split('|')
          .map((c: string) => c.trim())
          .filter(Boolean),
      )
    return `<table><thead><tr>${headers.map((h: string) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row: string[]) => `<tr>${row.map((c: string) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  })

  return html
}

export function SimpleMarkdown({
  content,
  compact = false,
}: {
  content: string
  compact?: boolean
}) {
  const trimmed = compact ? content.slice(0, 500) : content
  const html = renderMarkdownToHtml(trimmed)
  return (
    <div
      className={`card-markdown text-[11px] leading-relaxed text-zinc-400 ${compact ? 'max-h-32 overflow-hidden' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
