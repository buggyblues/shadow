import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

export function EmptyState({
  title,
  body,
  actionLabel,
  actionTo,
}: {
  title: string
  body: string
  actionLabel?: string
  actionTo?: '/upload' | '/profile' | '/people'
}) {
  return (
    <section className="emptyState">
      <h2>{title}</h2>
      <p>{body}</p>
      {actionTo && actionLabel ? (
        <Link to={actionTo}>
          <ArrowRight />
          {actionLabel}
        </Link>
      ) : null}
    </section>
  )
}
