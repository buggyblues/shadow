import type { ImgHTMLAttributes } from 'react'
import { usePageData } from 'rspress/runtime'
import { type SpaceIconName, spaceIconPath } from '../../data/spaceIcons'

type SpaceStickerIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  base?: string
  name: SpaceIconName
}

export function SpaceStickerIcon({
  alt = '',
  base,
  className,
  draggable = false,
  name,
  ...props
}: SpaceStickerIconProps) {
  const { siteData } = usePageData()
  const resolvedBase = base ?? (siteData.base || '/').replace(/\/$/, '')

  return (
    <img
      {...props}
      alt={alt}
      className={className}
      decoding={props.decoding ?? 'async'}
      draggable={draggable}
      loading={props.loading ?? 'lazy'}
      src={spaceIconPath(name, resolvedBase)}
    />
  )
}
