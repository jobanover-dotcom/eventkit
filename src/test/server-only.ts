/**
 * Test stub for the `server-only` package.
 *
 * `server-only` throws when a module is pulled into a client bundle. That is the
 * behaviour we want in the app, but it means a unit test cannot import a service
 * that declares it — and testing those services is exactly what we want to do.
 *
 * Vitest aliases the package to this file, so the guard is neutralised under
 * test while staying enforced in a real build.
 */
export {}
