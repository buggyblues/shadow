import { forwardRef, type ImgHTMLAttributes } from 'react'

export type ContentImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
  alt: string
}

export const ContentImage = forwardRef<HTMLImageElement, ContentImageProps>(
  ({ alt, ...props }, ref) => <img ref={ref} {...props} alt={alt} />,
)
ContentImage.displayName = 'ContentImage'

export type DecorativeImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'aria-hidden' | 'role'
>

export const DecorativeImage = forwardRef<HTMLImageElement, DecorativeImageProps>((props, ref) => (
  <img ref={ref} {...props} alt="" aria-hidden="true" role="presentation" />
))
DecorativeImage.displayName = 'DecorativeImage'
