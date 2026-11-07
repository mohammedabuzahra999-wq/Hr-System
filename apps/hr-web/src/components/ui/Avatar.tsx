import { cn } from '@/lib/cn'
import { initialsOf } from '@/lib/initials'

interface AvatarProps {
  name: string
  src?: string
  size?: 'md' | 'lg'
  /** White circle with blue letters, for use on blue backgrounds. */
  inverted?: boolean
  className?: string
}

/** Shows the photo when there is one, otherwise the person's initials. */
export function Avatar({ name, src, size = 'md', inverted = false, className }: AvatarProps) {
  const dims = size === 'lg' ? 'size-20 text-2xl' : 'size-9 text-sm'
  if (src) {
    return <img src={src} alt={name} className={cn('shrink-0 rounded-full object-cover', dims, className)} />
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        inverted ? 'bg-white text-brand' : 'bg-brand text-white',
        dims,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}
