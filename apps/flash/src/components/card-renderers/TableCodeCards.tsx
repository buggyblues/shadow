import type { CodeCardMeta, TableCardMeta } from '../../types'

export function TableCard({ meta }: { meta: TableCardMeta }) {
  const hasColumns = meta.columns && meta.columns.length > 0
  const columnKeys = hasColumns ? meta.columns.map((c) => c.key) : meta.headers || []
  const columnLabels = hasColumns ? meta.columns.map((c) => c.label) : meta.headers || []

  return (
    <div className="overflow-x-auto">
      {meta.caption && <p className="text-[10px] text-zinc-500 mb-1 font-medium">{meta.caption}</p>}
      <table className="w-full text-[10px]">
        <thead>
          <tr>
            {columnLabels.map((h, i) => (
              <th
                key={i}
                className="border-b border-border/40 px-1.5 py-1 text-left font-medium text-zinc-400 whitespace-nowrap"
              >
                {h}
                {hasColumns && meta.columns[i]?.unit && (
                  <span className="text-zinc-600 ml-0.5">({meta.columns[i].unit})</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meta.rows.slice(0, 5).map((row, ri) => (
            <tr
              key={ri}
              className={`${
                meta.highlightRow === ri ? 'bg-brand-500/5' : ''
              } hover:bg-surface-hover/50`}
            >
              {hasColumns
                ? columnKeys.map((key, ci) => (
                    <td
                      key={ci}
                      className="border-b border-border/20 px-1.5 py-1 text-zinc-300 whitespace-nowrap"
                    >
                      {(row as Record<string, string | number>)[key] ?? ''}
                    </td>
                  ))
                : Array.isArray(row)
                  ? (row as (string | number)[]).map((cell, ci) => (
                      <td
                        key={ci}
                        className="border-b border-border/20 px-1.5 py-1 text-zinc-300 whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ))
                  : null}
            </tr>
          ))}
        </tbody>
      </table>
      {meta.rows.length > 5 && (
        <p className="mt-1 text-[9px] text-zinc-600 text-right">+{meta.rows.length - 5} rows</p>
      )}
    </div>
  )
}

export function CodeCard({ meta }: { meta: CodeCardMeta }) {
  const lines = meta.code.split('\n').slice(0, 8)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-lime-500/10 px-1.5 py-0.5 text-[9px] font-mono text-lime-400">
          {meta.language}
        </span>
        {meta.filename && (
          <span className="text-[9px] text-zinc-600 font-mono truncate">{meta.filename}</span>
        )}
      </div>
      {meta.description && <p className="text-[9px] text-zinc-500">{meta.description}</p>}
      <pre className="rounded-md bg-[#0d1117] border border-border/20 px-2.5 py-2 text-[10px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`${meta.highlight?.includes(i + 1) ? 'bg-amber-500/10 -mx-2.5 px-2.5' : ''}`}
          >
            <span className="inline-block w-5 text-right text-zinc-700 mr-2 select-none">
              {i + 1}
            </span>
            {line}
          </div>
        ))}
        {meta.code.split('\n').length > 8 && (
          <div className="text-zinc-600 mt-1">... +{meta.code.split('\n').length - 8} lines</div>
        )}
      </pre>
    </div>
  )
}
