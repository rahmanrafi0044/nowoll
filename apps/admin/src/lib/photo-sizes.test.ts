import { PHOTO_HINT } from './photo-sizes'

describe('photo size hints (docs/photo-guide.md)', () => {
  it('every slot names its best size in pixels', () => {
    for (const [slot, hint] of Object.entries(PHOTO_HINT)) {
      expect(hint, slot).toMatch(/^Best: /)
      expect(hint, slot).toMatch(/\d{3,4} × \d{3,4}/)
    }
  })

  it('product photos are 3:4 — the shape of the shop’s product frames', () => {
    expect(PHOTO_HINT.product).toContain('3:4')
    expect(PHOTO_HINT.category).toContain('3:4')
  })
})
