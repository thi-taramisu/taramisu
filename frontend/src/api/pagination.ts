export interface PageRequest {
  limit: number
  offset: number
}

const PAGE_SIZE = 100

/** Collects a paginated collection for views that need the complete list, such as the workspace tree. */
export async function readAllPages<T>(readPage: (page: PageRequest) => Promise<T[]>): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await readPage({ limit: PAGE_SIZE, offset })
    result.push(...page)
    if (page.length < PAGE_SIZE) return result
  }
}
