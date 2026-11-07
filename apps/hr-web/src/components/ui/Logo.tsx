import markBlue from '@/assets/brand/mark-blue.png'
import markWhite from '@/assets/brand/mark-white.png'
import wordmarkNavy from '@/assets/brand/wordmark-navy.png'
import wordmarkWhite from '@/assets/brand/wordmark-white.png'
import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  /** "light" = white logo for blue backgrounds, "dark" = brand colors for white backgrounds. */
  tone?: 'light' | 'dark'
  size?: 'md' | 'lg'
}

export function Logo({ className, tone = 'light', size = 'md' }: LogoProps) {
  const light = tone === 'light'
  return (
    <span className={cn('flex items-center', size === 'lg' ? 'gap-3.5' : 'gap-2.5', className)}>
      <img
        src={light ? markWhite : markBlue}
        alt=""
        className={cn('w-auto shrink-0', size === 'lg' ? 'h-11' : 'h-8')}
      />
      <img
        src={light ? wordmarkWhite : wordmarkNavy}
        alt="menaitech"
        className={cn('w-auto', size === 'lg' ? 'h-6' : 'h-[18px]')}
      />
    </span>
  )
}
