import type {
  AnyDesignData,
  BadgeData,
  CertificateData,
  DesignKind,
  PhotoFrameData,
  PosterData,
} from '@/features/design/types'
import type { DesignImages, DesignTemplate, DrawContext } from '@/features/design/lib/types'
import { BADGE_TEMPLATES } from '@/features/design/lib/templates/badge'
import { CERTIFICATE_TEMPLATES } from '@/features/design/lib/templates/certificate'
import { POSTER_TEMPLATES } from '@/features/design/lib/templates/poster'
import { PHOTO_FRAME_TEMPLATES } from '@/features/design/lib/templates/photoFrame'

/**
 * The template catalogue.
 *
 * Static TypeScript, eight templates, no admin UI and no template table. A
 * third template for any kind is one more entry in the array below — the
 * generators, the picker, and the export pipeline all read from here and need
 * no change.
 */

/**
 * A template of any kind, with the data type erased.
 *
 * `draw` takes its data contravariantly, so a heterogeneous array cannot be
 * typed as `DesignTemplate<AnyDesignData>[]`. `never` is the one parameter type
 * every concrete `draw` accepts, which is what makes the union assignable. Use
 * `templatesFor(kind)` to get the correctly typed list back.
 */
export type AnyTemplate = Omit<DesignTemplate<AnyDesignData>, 'draw'> & {
  draw: (ctx: DrawContext, data: never, images: DesignImages) => void
}

const REGISTRY: readonly AnyTemplate[] = [
  ...BADGE_TEMPLATES,
  ...CERTIFICATE_TEMPLATES,
  ...POSTER_TEMPLATES,
  ...PHOTO_FRAME_TEMPLATES,
]

export const ALL_TEMPLATES: readonly AnyTemplate[] = REGISTRY

export function templatesFor<TData extends AnyDesignData>(
  kind: DesignKind
): readonly DesignTemplate<TData>[] {
  const matches = REGISTRY.filter((template) => template.kind === kind)
  return matches as unknown as readonly DesignTemplate<TData>[]
}

export function templateCountFor(kind: DesignKind): number {
  return REGISTRY.filter((template) => template.kind === kind).length
}

export function findTemplateById(id: string): AnyTemplate | undefined {
  return REGISTRY.find((template) => template.id === id)
}

export {
  BADGE_TEMPLATES,
  CERTIFICATE_TEMPLATES,
  PHOTO_FRAME_TEMPLATES,
  POSTER_TEMPLATES,
  type DesignTemplate,
}

export type { BadgeData, CertificateData, PhotoFrameData, PosterData }
