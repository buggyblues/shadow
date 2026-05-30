import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'

export function RegisterPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }

  useEffect(() => {
    void navigate({
      to: '/login',
      replace: true,
      search: search.redirect ? { redirect: search.redirect } : {},
    })
  }, [navigate, search.redirect])

  return null
}
