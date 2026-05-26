import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal(props: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <section className="modalPanel">
        <header>
          <h2>{props.title}</h2>
          <button type="button" className="iconButton" onClick={props.onClose} title="关闭">
            <X />
          </button>
        </header>
        <div className="modalBody">{props.children}</div>
      </section>
    </div>
  )
}
