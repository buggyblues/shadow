import { ArrowRight, BookOpen, Clock, ExternalLink, Lightbulb, Zap } from 'lucide-react'
import type {
  ExampleCardMeta,
  FlowCardMeta,
  InspirationCardMeta,
  ReferenceCardMeta,
  TimelineCardMeta,
} from '../../types'
import { SimpleMarkdown } from './MarkdownRenderer'

export function extractMermaidNodes(mermaid: string): string[] {
  const nodes: string[] = []
  const nodeRegex = /(\w+)\s*[\[\(\{]+([^}\]\)]+)[\]\)\}]+/g
  let m
  while ((m = nodeRegex.exec(mermaid)) !== null) {
    nodes.push(m[2].trim())
  }
  if (nodes.length === 0) {
    const arrowParts = mermaid.split(/-->|---/)
    for (const part of arrowParts) {
      const clean = part.trim().replace(/^\w+\s*/, '')
      if (clean) nodes.push(clean.slice(0, 20))
    }
  }
  return [...new Set(nodes)]
}

export function MermaidFlow({ meta }: { meta: FlowCardMeta }) {
  const nodes = extractMermaidNodes(meta.mermaid)
  return (
    <div className="space-y-1.5">
      {nodes.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {nodes.slice(0, 5).map((node, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="rounded-md bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-300 truncate max-w-[80px]">
                {node}
              </span>
              {i < Math.min(nodes.length, 5) - 1 && (
                <span className="text-zinc-700 text-[10px]">→</span>
              )}
            </div>
          ))}
          {nodes.length > 5 && (
            <span className="text-[9px] text-zinc-600">+{nodes.length - 5}</span>
          )}
        </div>
      )}
      <pre className="rounded-md bg-surface/60 border border-border/20 px-2 py-1.5 text-[10px] text-zinc-500 font-mono overflow-x-auto max-h-20 whitespace-pre-wrap leading-relaxed">
        {meta.mermaid.slice(0, 200)}
        {meta.mermaid.length > 200 ? '...' : ''}
      </pre>
    </div>
  )
}

export function ExampleCard({ meta }: { meta: ExampleCardMeta }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <BookOpen className="h-3 w-3 text-sky-400 shrink-0" />
        <span className="text-[11px] font-medium text-sky-300">{meta.subject}</span>
        {meta.industry && (
          <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] text-sky-400/70">
            {meta.industry}
          </span>
        )}
      </div>
      {meta.scenario && (
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          <span className="text-zinc-600">Scenario:</span> {meta.scenario}
        </p>
      )}
      {meta.challenge && (
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          <span className="text-zinc-600">Challenge:</span> {meta.challenge}
        </p>
      )}
      {meta.approach && (
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          <span className="text-zinc-600">Approach:</span> {meta.approach}
        </p>
      )}
      {meta.results && meta.results.length > 0 && (
        <div className="rounded-md bg-sky-500/5 border border-sky-500/10 px-2 py-1.5">
          <p className="text-[9px] text-sky-400/70 mb-0.5">Results:</p>
          {meta.results.map((r, i) => (
            <p key={i} className="text-[10px] text-zinc-400">
              • {r.metric}: <span className="font-medium text-zinc-300">{r.value}</span>
              {r.context && <span className="text-zinc-600 ml-1">({r.context})</span>}
            </p>
          ))}
        </div>
      )}
      {meta.takeaway && (
        <div className="rounded-md bg-amber-500/5 border border-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300/90">
          💡 {meta.takeaway}
        </div>
      )}
    </div>
  )
}

export function ReferenceCard({ meta }: { meta: ReferenceCardMeta }) {
  const typeLabel = {
    paper: 'Paper',
    book: 'Book',
    article: 'Article',
    website: 'Website',
    report: 'Report',
  }
  const credLabel = {
    high: { text: 'High', color: 'text-emerald-400 bg-emerald-500/10' },
    medium: { text: 'Med', color: 'text-amber-400 bg-amber-500/10' },
    low: { text: 'Low', color: 'text-zinc-400 bg-zinc-500/10' },
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {meta.refType && (
          <span className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[9px] text-zinc-400">
            {typeLabel[meta.refType] || meta.refType}
          </span>
        )}
        {meta.credibility && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] ${credLabel[meta.credibility]?.color || ''}`}
          >
            Credibility: {credLabel[meta.credibility]?.text || meta.credibility}
          </span>
        )}
      </div>
      {meta.refTitle && (
        <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">{meta.refTitle}</p>
      )}
      {meta.authors && meta.authors.length > 0 && (
        <p className="text-[10px] text-zinc-400">{meta.authors.join(', ')}</p>
      )}
      {meta.publishDate && <p className="text-[9px] text-zinc-600">{meta.publishDate}</p>}
      {meta.url && (
        <a
          href={meta.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-brand-400 hover:underline truncate"
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          {meta.url}
        </a>
      )}
    </div>
  )
}

export function InspirationCard({ meta }: { meta: InspirationCardMeta }) {
  const typeLabel = {
    concept: 'New Concept',
    improvement: 'Improvement',
    alternative: 'Alternative',
    expansion: 'Expansion',
  }
  const diffLabel = {
    easy: { text: 'Easy', color: 'text-emerald-400 bg-emerald-500/10' },
    medium: { text: 'Medium', color: 'text-amber-400 bg-amber-500/10' },
    hard: { text: 'Hard', color: 'text-red-400 bg-red-500/10' },
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {meta.ideaType && (
          <span className="flex items-center gap-0.5 rounded-full bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] text-fuchsia-400">
            <Lightbulb className="h-2.5 w-2.5" />
            {typeLabel[meta.ideaType] || meta.ideaType}
          </span>
        )}
        {meta.difficulty && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] ${diffLabel[meta.difficulty].color}`}
          >
            {diffLabel[meta.difficulty].text}
          </span>
        )}
      </div>
      {meta.body && <SimpleMarkdown content={meta.body} compact />}
      {meta.impact && (
        <div className="flex items-start gap-1.5">
          <Zap className="h-3 w-3 text-amber-400/60 shrink-0 mt-0.5" />
          <p className="text-[10px] text-zinc-400 leading-relaxed">{meta.impact}</p>
        </div>
      )}
    </div>
  )
}

export function TimelineCard({ meta }: { meta: TimelineCardMeta }) {
  const sigColors = {
    high: 'bg-amber-400 border-amber-400',
    medium: 'bg-blue-400 border-blue-400',
    low: 'bg-zinc-500 border-zinc-500',
  }
  return (
    <div className="space-y-0.5 relative">
      {meta.span && <p className="text-[9px] text-zinc-600 mb-1">{meta.span}</p>}
      {meta.events.slice(0, 5).map((ev, i) => (
        <div key={i} className="flex items-start gap-2 relative">
          {i < Math.min(meta.events.length, 5) - 1 && (
            <div className="absolute left-[5px] top-3 w-0.5 h-full bg-zinc-800" />
          )}
          <div
            className={`mt-1 h-2.5 w-2.5 rounded-full border shrink-0 ${sigColors[ev.significance || 'medium']}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[9px] font-bold text-zinc-400 shrink-0">{ev.date}</span>
              <span className="text-[10px] text-zinc-300 font-medium truncate">{ev.title}</span>
            </div>
            <p className="text-[9px] text-zinc-500 leading-relaxed line-clamp-2">{ev.detail}</p>
          </div>
        </div>
      ))}
      {meta.events.length > 5 && (
        <p className="text-[9px] text-zinc-600 pl-5">+{meta.events.length - 5} more events</p>
      )}
    </div>
  )
}
