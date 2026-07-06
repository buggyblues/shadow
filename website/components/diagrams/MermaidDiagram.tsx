'use client'

import { useEffect, useRef, useState } from 'react'

type Theme = 'dark' | 'base'

let _uid = 0
function nextId() {
  return `mermaid-render-${++_uid}`
}

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

async function renderDiagram(diagram: string, dark: boolean): Promise<string> {
  const mermaid = (await import('mermaid')).default

  const theme: Theme = dark ? 'dark' : 'base'

  mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables: dark
      ? {
          // Dark theme — matches the dark-on-dark design from the product diagram
          background: '#0f172a',
          mainBkg: '#1e293b',
          nodeBorder: '#3b82f6',
          clusterBkg: '#1e2d40',
          clusterBorder: '#2563eb',
          titleColor: '#e2e8f0',
          edgeLabelBackground: '#1e293b',
          lineColor: '#64748b',
          primaryColor: '#1e3a5f',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#3b82f6',
          secondaryColor: '#0f172a',
          secondaryTextColor: '#e2e8f0',
          secondaryBorderColor: '#334155',
          tertiaryColor: '#172032',
          tertiaryTextColor: '#e2e8f0',
          tertiaryBorderColor: '#334155',
          fontFamily: 'inherit',
        }
      : {
          // Light theme — clean, slightly tinted backgrounds
          background: '#ffffff',
          mainBkg: '#f8fafc',
          nodeBorder: '#93c5fd',
          clusterBkg: '#eff6ff',
          clusterBorder: '#bfdbfe',
          titleColor: '#0f172a',
          edgeLabelBackground: '#f1f5f9',
          lineColor: '#94a3b8',
          primaryColor: '#eff6ff',
          primaryTextColor: '#0f172a',
          primaryBorderColor: '#93c5fd',
          secondaryColor: '#f0fdf4',
          secondaryTextColor: '#0f172a',
          secondaryBorderColor: '#bbf7d0',
          tertiaryColor: '#fef9c3',
          tertiaryTextColor: '#0f172a',
          tertiaryBorderColor: '#fde047',
          fontFamily: 'inherit',
        },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 20,
    },
    fontSize: 13,
  })

  const id = nextId()
  const { svg } = await mermaid.render(id, diagram.trim())

  // Post-process: round all rect corners for a softer, card-like look
  const rounded = svg.replace(/<rect([^>]*?)(\s*\/>|><\/rect>)/g, (match, attrs, close) => {
    if (/rx\s*=/.test(attrs)) return match
    return `<rect${attrs} rx="12" ry="12"${close}`
  })
  return rounded
}

export function MermaidDiagram({ diagram }: { diagram: string }) {
  const [svg, setSvg] = useState<string>('')
  const [dark, setDark] = useState(false)
  const cancelRef = useRef(false)

  // Track dark mode
  useEffect(() => {
    const update = () => setDark(isDark())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  // Render diagram on content or theme change
  useEffect(() => {
    cancelRef.current = false
    setSvg('')
    renderDiagram(diagram, dark)
      .then((result) => {
        if (!cancelRef.current) setSvg(result)
      })
      .catch((err) => console.warn('[MermaidDiagram] render error:', err))

    return () => {
      cancelRef.current = true
    }
  }, [diagram, dark])

  if (!svg) {
    return <div className="mermaid-placeholder" aria-label="Loading diagram…" />
  }

  return (
    <div
      className="mermaid-container"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid outputs sanitized SVG
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
