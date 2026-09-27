/**
 * Test-only shim for `Blob.prototype.stream`, which jsdom does not implement.
 *
 * `client-zip` reads each entry's bytes through `stream()`. That method exists in
 * every browser this ships to and in Node, but not in jsdom, so without this the
 * entries reach client-zip as something it cannot stream and the archive comes out
 * holding the text "[object Blob]". That is a gap in the test environment rather
 * than in the writer — filling it in means tests still drive the real Blob branch.
 *
 * It is defined as an own property, unconditionally, so it shadows whatever the
 * prototype happens to offer. Checking first made this order-dependent: the
 * prototype gains `stream` partway through a run, so whether a given blob was
 * patched depended on which test had already executed.
 */
export function withBlobStream<T extends Blob>(blob: T): T {
  Object.defineProperty(blob, 'stream', {
    // Configurable, so the same blob can be handed to more than one entry.
    configurable: true,
    writable: true,
    value: () =>
      new ReadableStream({
        async start(controller) {
          controller.enqueue(new Uint8Array(await blob.arrayBuffer()))
          controller.close()
        },
      }),
  })
  return blob
}
