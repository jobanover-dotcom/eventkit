const UNSAFE_PATH_CHARACTERS = /[\\/:*?"<>|]+/g

/**
 * Strips C0 controls and DEL. Written as a loop rather than a regex literal so
 * the source file stays plain ASCII.
 */
function stripControlCharacters(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    result += char
  }
  return result
}

/**
 * Keeps a download name safe on every platform: no directory separators, no
 * control characters, and a length cap.
 *
 * Both callers build names from participant names, which arrive from a public
 * registration form, so this is a real trust boundary rather than a developer
 * convenience.
 */
export function sanitizeFilename(value: string, extension: string): string {
  const base = stripControlCharacters(value)
    .normalize('NFKD')
    .replace(UNSAFE_PATH_CHARACTERS, '-')
    // Collapse dot runs so a crafted name cannot leave `..` in the result.
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)

  const safeBase = base.length > 0 ? base : 'design'
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  return `${safeBase}.${safeExtension}`
}
