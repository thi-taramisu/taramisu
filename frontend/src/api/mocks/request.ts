/** Runs `fn` like a request: async, with a copy of the result, errors as rejections. */
export function run<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(structuredClone(fn()))
  } catch (error) {
    return Promise.reject(error)
  }
}
