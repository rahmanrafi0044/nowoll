import { buildCsp, createNonce } from './csp'

const policy = (csp: string) =>
  Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]))

describe('buildCsp', () => {
  const prod = buildCsp({ nonce: 'abc', isDev: false, connectSrc: ['https://api.nowoll.com'] })

  it('only allows scripts carrying this request’s nonce', () => {
    expect(policy(prod)['script-src']).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"])
  })

  it('never allows eval or unsafe-inline scripts in production', () => {
    expect(prod).not.toContain('unsafe-eval')
    expect(prod).not.toContain('unsafe-inline')
  })

  it('blocks framing, plugins and foreign form targets', () => {
    const p = policy(prod)
    expect(p['frame-ancestors']).toEqual(["'none'"])
    expect(p['object-src']).toEqual(["'none'"])
    expect(p['form-action']).toEqual(["'self'"])
  })

  it('lets the browser talk to our API', () => {
    expect(policy(prod)['connect-src']).toContain('https://api.nowoll.com')
  })

  it('allows product photos from the given hosts only — they cannot be fetched by scripts', () => {
    const csp = buildCsp({
      nonce: 'abc',
      isDev: false,
      connectSrc: ['https://api.nowoll.com'],
      imgSrc: ['https://abc.supabase.co'],
    })
    expect(policy(csp)['img-src']).toEqual([
      "'self'",
      'blob:',
      'data:',
      'https://api.nowoll.com',
      'https://abc.supabase.co',
    ])
    expect(policy(csp)['connect-src']).not.toContain('https://abc.supabase.co')
  })

  it('adds unsafe-eval and websockets only in development (React dev tooling)', () => {
    const dev = buildCsp({ nonce: 'abc', isDev: true, connectSrc: [] })
    expect(policy(dev)['script-src']).toContain("'unsafe-eval'")
    expect(policy(dev)['connect-src']).toContain('ws:')
    expect(dev).not.toContain('upgrade-insecure-requests')
  })
})

describe('createNonce', () => {
  it('is different every time', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce))
    expect(nonces.size).toBe(50)
  })
})
