import type React from 'react'
import { Children, isValidElement, useState } from 'react'

function CodeGroup({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  const tabs: { title: string; content: React.ReactNode }[] = []

  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      tabs.push({
        title: (child.props as Record<string, string>)?.['data-title'] || `Tab ${tabs.length + 1}`,
        content: (child.props as Record<string, React.ReactNode>)?.children,
      })
    }
  })

  if (tabs.length === 0) return <>{children}</>

  return (
    <div className="code-group-container">
      <div className="code-group-tabs">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            className={`code-group-tab${idx === active ? ' active' : ''}`}
            onClick={() => setActive(idx)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {tabs.map((tab, idx) => (
        <div key={idx} style={{ display: idx === active ? 'block' : 'none' }}>
          {tab.content}
        </div>
      ))}
    </div>
  )
}

export default CodeGroup
export { CodeGroup }
