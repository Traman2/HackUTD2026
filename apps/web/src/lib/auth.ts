import axios from 'axios'
import { z } from 'zod'
import { databaseName, spacetimeHost } from './spacetime'
import { loginSchema, type LoginValues } from './validation/login'

const reducerResponseSchema = z.object({
  status: z.literal(200),
  data: z.literal(''),
})
const reducerErrorSchema = z.string().max(4096)

export async function login(values: LoginValues, token: string): Promise<void> {
  const { username, password } = loginSchema.parse(values)
  const host = new URL(spacetimeHost)
  // The React SDK also accepts WebSocket URLs; Axios needs their HTTP equivalent.
  if (host.protocol === 'ws:') host.protocol = 'http:'
  if (host.protocol === 'wss:') host.protocol = 'https:'
  const response = await axios.post<unknown>(
    new URL(`/v1/database/${encodeURIComponent(databaseName)}/call/login`, host).href,
    [username, password],
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
      responseType: 'text',
    },
  )
  // Reducers return HTTP 200 with an empty body, rather than a JSON user object.
  if (!reducerResponseSchema.safeParse(response).success) {
    throw new Error('The sign-in service returned an unexpected response. Please try again.')
  }
}

export function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError<unknown>(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Sign-in timed out. Please try again.'
    }
    if (!error.response) return 'Unable to reach the sign-in service. Please try again.'
    const body = reducerErrorSchema.safeParse(error.response.data)
    if (body.success && body.data.includes('Invalid username or password')) {
      return 'Invalid username or password.'
    }
    if (error.response.status === 401 || error.response.status === 403) {
      return 'Your connection could not be authenticated. Refresh the page and try again.'
    }
    if (error.response.status === 429) return 'Too many attempts. Please try again shortly.'
    return 'Unable to sign in. Please try again.'
  }
  return error instanceof Error ? error.message : 'Unable to sign in. Please try again.'
}
