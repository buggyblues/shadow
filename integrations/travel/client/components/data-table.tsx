import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface DataTableColumn {
  className?: string
  id: string
  label?: ReactNode
}

interface DataTableProps {
  children: ReactNode
  columns: DataTableColumn[]
  footer?: ReactNode
  minWidthClassName?: string
}

export function DataTable({
  children,
  columns,
  footer,
  minWidthClassName = 'min-w-[780px]',
}: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-left text-[12px]', minWidthClassName)}>
          <thead className="bg-white text-muted">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn('border-line border-b px-3 py-3 font-extrabold', column.className)}
                  key={column.id}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}
