// Must stay in sync with the --font-* values in src/app/globals.css.
// Canvas renderers cannot read CSS variables, so they compose their `font`
// shorthand from these family names.
export const FONT_SANS = "'Inter Variable', ui-sans-serif, system-ui, sans-serif"

export const FONT_HEADING =
  "'Plus Jakarta Sans Variable', 'Inter Variable', ui-sans-serif, system-ui, sans-serif"

/**
 * Fonts an organizer can pick from on a custom certificate.
 *
 * Every entry is bundled through `@fontsource-variable/*`, never a system font.
 * That is the whole constraint behind this list: a family the browser may not
 * have renders differently on the organizer's machine than on a reviewer's, and
 * a certificate is a printed artefact that has to look the same everywhere.
 *
 * The list is deliberately small. Adding a family means adding the npm package
 * and the import in `globals.css` — there is no runtime font discovery, by
 * design.
 *
 * `pdf` matters because the PDF is a rasterised canvas rather than embedded
 * text: there is no font file to embed, so a font needs to be loadable by the
 * browser at render time and that is sufficient. Preview and export therefore
 * cannot diverge on type.
 */
export const CERTIFICATE_FONTS = [
  {
    key: 'inter',
    label: 'Inter',
    category: 'Sans',
    family: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  },
  {
    key: 'jakarta',
    label: 'Plus Jakarta Sans',
    category: 'Sans',
    family: "'Plus Jakarta Sans Variable', 'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  },
  {
    key: 'lora',
    label: 'Lora',
    category: 'Serif',
    family: "'Lora Variable', ui-serif, Georgia, serif",
  },
  {
    key: 'jetbrains',
    label: 'JetBrains Mono',
    category: 'Mono',
    family: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace",
  },
] as const

export type CertificateFontKey = (typeof CERTIFICATE_FONTS)[number]['key']

export const CERTIFICATE_FONT_KEYS = CERTIFICATE_FONTS.map((font) => font.key)

export function isCertificateFontKey(value: unknown): value is CertificateFontKey {
  return CERTIFICATE_FONT_KEYS.includes(value as CertificateFontKey)
}

/**
 * Resolves a key to its CSS family stack.
 *
 * Falls back to the sans stack for an unrecognised key rather than emitting
 * `font: 42px undefined`, which would silently render at a default size.
 */
export function certificateFontFamily(key: unknown): string {
  const match = CERTIFICATE_FONTS.find((font) => font.key === key)
  return match?.family ?? FONT_SANS
}
