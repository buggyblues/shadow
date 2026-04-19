import { Hash, Quote } from 'lucide-react'
import type {
  DefinitionCardMeta,
  KeypointCardMeta,
  QuoteCardMeta,
  SummaryCardMeta,
} from '../../types'
import { SimpleMarkdown } from './MarkdownRenderer'

export function QuoteBlock({ meta }: { meta: QuoteCardMeta }) {
  return (
    <div className="relative">
      <Quote className="absolute -left-0.5 -top-0.5 h-5 w-5 text-pink-500/20" />
      <blockquote className="pl-4 border-l-2 border-pink-500/30">
        <p className="text-[11px] text-zinc-200 leading-relaxed italic">"{meta.text}"</p>
        {(meta.author || meta.source) && (
          <footer className="mt-1.5 text-[10px] text-zinc-500">
            {meta.author && <span className="font-medium text-zinc-400">— {meta.author}</span>}
            {meta.role && <span className="ml-1 text-zinc-600">({meta.role})</span>}
            {meta.source && <span className="ml-1">《{meta.source}》</span>}
          </footer>
        )}
        {meta.emphasis && meta.emphasis.length > 0 && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            {meta.emphasis.map((word, i) => (
              <span key={i} className="rounded bg-pink-500/10 px-1 py-0.5 text-[8px] text-pink-400">
                {word}
              </span>
            ))}
          </div>
        )}
      </blockquote>
    </div>
  )
}

export function DefinitionCard({ meta }: { meta: DefinitionCardMeta }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Hash className="h-3 w-3 text-violet-400 shrink-0" />
        <span className="text-xs font-bold text-violet-300">{meta.term}</span>
        {meta.abbreviation && (
          <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-400/80">
            {meta.abbreviation}
          </span>
        )}
      </div>
      {meta.fullName && <p className="text-[9px] text-zinc-600">{meta.fullName}</p>}
      {meta.category && (
        <span className="inline-block rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[9px] text-zinc-500">
          {meta.category}
        </span>
      )}
      <p className="text-[11px] text-zinc-300 leading-relaxed">{meta.definition}</p>
      {meta.formula && (
        <div className="rounded-md bg-surface/80 border border-border/30 px-2 py-1.5 text-[11px] text-amber-300 font-mono text-center">
          {meta.formula}
        </div>
      )}
      {meta.example && (
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-600">e.g.:</span> {meta.example}
        </p>
      )}
      {meta.relatedTerms && meta.relatedTerms.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-zinc-600">Related:</span>
          {meta.relatedTerms.map((t, i) => (
            <span key={i} className="text-[9px] text-zinc-500 underline decoration-dotted">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function KeypointCard({ meta }: { meta: KeypointCardMeta }) {
  return (
    <div className="space-y-1">
      {meta.context && (
        <p className="text-[10px] text-zinc-500 leading-relaxed mb-1">{meta.context}</p>
      )}
      {meta.points.slice(0, 5).map((point, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-[10px] shrink-0 mt-0.5">{point.icon || '•'}</span>
          <div className="flex-1">
            <span className="text-[11px] font-medium text-zinc-300">{point.label}</span>
            {point.detail && (
              <span className="text-[10px] text-zinc-500 ml-1">— {point.detail}</span>
            )}
          </div>
        </div>
      ))}
      {meta.points.length > 5 && (
        <p className="text-[9px] text-zinc-600">+{meta.points.length - 5} more points</p>
      )}
    </div>
  )
}

export function SummaryCard({ meta }: { meta: SummaryCardMeta }) {
  return (
    <div className="space-y-1.5">
      <SimpleMarkdown content={meta.body} compact />
    </div>
  )
}
