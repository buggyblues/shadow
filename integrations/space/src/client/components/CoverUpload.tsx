import { useMutation } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import { uploadCover } from '../api.js'
import { useInvalidateSpace } from '../hooks.js'

export function CoverUpload(props: {
  targetType: 'profile' | 'artwork'
  artworkId?: string
  label: string
}) {
  const invalidate = useInvalidateSpace()
  const mutation = useMutation({
    mutationFn: (file: File) =>
      uploadCover({ file, targetType: props.targetType, artworkId: props.artworkId }),
    onSuccess: () => {
      void invalidate()
    },
  })

  return (
    <label className="coverUpload">
      <ImagePlus />
      <span>{mutation.isPending ? '更换中' : props.label}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) mutation.mutate(file)
          event.currentTarget.value = ''
        }}
      />
      {mutation.error ? <em>{mutation.error.message}</em> : null}
    </label>
  )
}
