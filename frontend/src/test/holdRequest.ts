/** Wraps an API method so its request only runs once `release` is called, to test the form while a save is pending. */
export function holdRequest<Args extends unknown[], Result>(request: (...args: Args) => Promise<Result>) {
  let pending: (() => Promise<void>) | undefined
  let calls = 0
  return {
    held: (...args: Args) => {
      calls += 1
      return new Promise<Result>((resolve, reject) => {
        pending = () => request(...args).then(resolve, reject)
      })
    },
    /** Runs the held request; await it inside `act`. */
    release: () => pending?.() ?? Promise.resolve(),
    get calls() {
      return calls
    },
  }
}
