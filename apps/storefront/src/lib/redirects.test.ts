import { redirectRules, resetRedirectCache } from './redirects'

const RULES = [{ from: '/old', to: '/shop', permanent: true }]

beforeEach(() => resetRedirectCache())

describe('redirect rules in the shop (step 43c)', () => {
  it('loaded once a minute at most', async () => {
    const load = vi.fn(async () => RULES)
    expect(await redirectRules(0, load)).toEqual(RULES)
    await redirectRules(59_000, load)
    expect(load).toHaveBeenCalledTimes(1)
    await redirectRules(61_000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('the API down → the last rules are kept (or none) — never an error', async () => {
    expect(await redirectRules(0, async () => null)).toEqual([])
    resetRedirectCache()
    await redirectRules(0, async () => RULES)
    expect(await redirectRules(61_000, async () => Promise.reject(new Error('down')))).toEqual(
      RULES,
    )
  })
})
