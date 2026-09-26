import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-5 px-4 py-24 sm:px-6">
      <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">404</p>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
        We couldn&apos;t find that page
      </h1>
      <p className="text-muted-foreground text-lg leading-relaxed">
        The event link may have changed, or the page may have been removed.
      </p>
      <Button asChild>
        <Link href="/">Back to EventKit</Link>
      </Button>
    </div>
  )
}
