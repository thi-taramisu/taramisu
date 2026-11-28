import { useMutation, useQuery } from '@tanstack/react-query'
import { useApi } from '../ApiProvider'
import type { components } from '../schema'

// REAL: AI assistant prototype (#229) on the generated client.

export type AssistantMessage = components['schemas']['AssistantMessage']
export type AssistantAnswer = components['schemas']['AssistantOutputBody']

/** Projects of the signed-in user from the real backend, `GET /api/v1/projects`. */
export function useRealProjects(enabled: boolean) {
  const { client } = useApi()
  return useQuery({
    queryKey: ['assistant', 'projects'],
    enabled,
    queryFn: async () => {
      const { data, error } = await client.GET('/api/v1/projects')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Error of an assistant request with the HTTP status, so the panel can explain 429 and 503. */
export class AssistantError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Asks the assistant, `POST /api/v1/projects/{project_id}/assistant`; nothing is stored on the server. */
export function useAskAssistant() {
  const { client } = useApi()
  return useMutation({
    mutationFn: async ({ projectId, messages }: { projectId: string; messages: AssistantMessage[] }) => {
      const { data, error, response } = await client.POST('/api/v1/projects/{project_id}/assistant', {
        params: { path: { project_id: projectId } },
        body: { messages },
      })
      if (error || !data) throw new AssistantError(response.status, error?.detail ?? 'The assistant did not answer.')
      return data
    },
  })
}
