import type { PublicRule } from '@/features/info/types'

/**
 * Guideline sections.
 *
 * `rules.content` is plain text up to 4000 characters, rendered with
 * `whitespace-pre-wrap` so an organizer's own line breaks survive. No markdown,
 * no HTML: the column is text, and pretending otherwise would mean sanitizing
 * user input to render it.
 */
export function RulesList({ rules }: { rules: readonly PublicRule[] }) {
  return (
    <ol className="flex flex-col gap-5">
      {rules.map((rule) => (
        <li key={rule.id} className="flex flex-col gap-2">
          <h2 className="font-heading text-lg leading-snug font-bold">{rule.title}</h2>
          <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
            {rule.content}
          </p>
        </li>
      ))}
    </ol>
  )
}
