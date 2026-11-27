/** A promise that stays pending until `release` is called, to test what happens while a request runs. */
export function deferred() {
  let resolve: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, release: () => resolve() }
}
