import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
  align?: 'start' | 'center'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'start',
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'items-center text-center' : 'items-start',
        className
      )}
    >
      <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">{eyebrow}</p>
      <h2 className="font-heading max-w-2xl text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed text-pretty">
          {description}
        </p>
      )}
    </div>
  )
}
