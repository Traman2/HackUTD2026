import axios from 'axios'
import { z } from 'zod'
import { databaseName, spacetimeHost } from './spacetime'
import { loginSchema, type LoginValues } from './validation/login'
import { signupSchema, type SignupValues } from './validation/signup'

const reducerResponseSchema = z.object({
  status: z.literal(200),
  data: z.literal(''),
})
const reducerErrorSchema = z.string().max(4096)

export async function login(values: LoginValues, token: string): Promise<void> {
  const { username, password } = loginSchema.parse(values)
  await callAuthReducer('login', [username, password], token)
}

export async function signup(values: SignupValues, token: string): Promise<void> {
  const { username, password, displayName } = signupSchema.parse(values)
  await callAuthReducer('signup', [username, password, displayName], token)
}

async function callAuthReducer(reducer: 'login' | 'signup', args: string[], token: string): Promise<void> {
  const host = new URL(spacetimeHost)
  // The React SDK also accepts WebSocket URLs; Axios needs their HTTP equivalent.
  if (host.protocol === 'ws:') host.protocol = 'http:'
  if (host.protocol === 'wss:') host.protocol = 'https:'
  const response = await axios.post<unknown>(
    new URL(`/v1/database/${encodeURIComponent(databaseName)}/call/${reducer}`, host).href,
    args,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
      responseType: 'text',
    },
  )
  // Reducers return HTTP 200 with an empty body, rather than a JSON user object.
  if (!reducerResponseSchema.safeParse(response).success) {
    throw new Error('The authentication service returned an unexpected response. Please try again.')
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

export function signupErrorMessage(error: unknown): string {
  if (axios.isAxiosError<unknown>(error)) {
    const body = reducerErrorSchema.safeParse(error.response?.data)
    if (body.success && body.data.includes('Username is already taken')) {
      return 'Username is already taken.'
    }
  }
  return loginErrorMessage(error)
    .replace('Sign-in timed out', 'Account creation timed out')
    .replace('sign-in service', 'signup service')
    .replace('Unable to sign in', 'Unable to create your account')
}
