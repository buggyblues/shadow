import { getCatAvatarByUserId } from '@shadowob/shared'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserAvatar } from './avatar'
import { AvatarEditor } from './avatar-editor'

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('UserAvatar', () => {
  it('falls back to the deterministic user avatar when the configured image fails', () => {
    const brokenAvatarUrl = 'https://cdn.example.com/missing-avatar.png'
    const fallback = getCatAvatarByUserId('admin-user')

    const { getByAltText } = render(
      <UserAvatar
        userId="admin-user"
        avatarUrl={brokenAvatarUrl}
        displayName="Admin"
        loading="eager"
      />,
    )

    const image = getByAltText('Admin') as HTMLImageElement
    expect(image.getAttribute('src')).toBe(brokenAvatarUrl)

    fireEvent.error(image)

    expect(image.getAttribute('src')).toBe(fallback)
  })
})

describe('AvatarEditor', () => {
  it('uses the same deterministic fallback in its preview when the configured image fails', async () => {
    const brokenAvatarUrl = 'https://cdn.example.com/missing-profile-avatar.png'
    const fallback = getCatAvatarByUserId('admin-user')

    const { container } = render(
      <AvatarEditor value={brokenAvatarUrl} userId="admin-user" onChange={vi.fn()} />,
    )

    const image = container.querySelector('button img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe(brokenAvatarUrl)

    fireEvent.error(image)

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe(fallback)
    })
  })
})
