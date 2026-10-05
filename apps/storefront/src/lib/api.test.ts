import { apiGet } from './api'

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )

describe('apiGet', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns data on success, and asks Next.js to cache it for 60 seconds', async () => {
    const fetchMock = vi.fn(() => json(200, { success: true, data: { hello: 'world' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiGet('/x')).resolves.toEqual({ hello: 'world' })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/v1/x', {
      next: { revalidate: 60 },
    })
  })

  it('returns null quietly for 404 (e.g. a switched-off section)', async () => {
    vi.stubGlobal('fetch', () => json(404, { success: false, error: 'NOT_FOUND', message: 'nope' }))
    await expect(apiGet('/x')).resolves.toBeNull()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns null and logs when the API errors or is unreachable', async () => {
    vi.stubGlobal('fetch', () =>
      json(500, { success: false, error: 'INTERNAL_SERVER_ERROR', message: 'boom' }),
    )
    await expect(apiGet('/x')).resolves.toBeNull()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    await expect(apiGet('/x')).resolves.toBeNull()
    expect(console.error).toHaveBeenCalledTimes(2)
  })
})
