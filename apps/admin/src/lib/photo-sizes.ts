// ============================================================================
// The best size for every photo in the shop, shown under each upload field.
// ONE place, so the admin and docs/photo-guide.md say the same thing.
// The shapes come from the shop's own frames (it crops — never stretches — a
// photo of another shape, so the important part should be in the middle).
// ============================================================================
export const PHOTO_HINT = {
  product:
    'Best: 3:4 upright, 1500 × 2000 (at least 1200 × 1600) — a phone camera’s normal shape. Photo 1: the front on a plain background; photo 2 shows when the mouse is on the card.',
  category: 'Best: 3:4 upright, 1200 × 1600. Keep the garment in the middle.',
  hero: 'Best: wide 16:9, 2400 × 1350 (at least 1920 × 1080). Phones show only the middle — keep the person centred; the heading sits bottom-left.',
  banner: 'Best: wide 16:9, 1920 × 1080. Any text sits along the bottom.',
  split: 'Best: 4:5 upright, 1200 × 1500.',
  circle: 'Best: square, 800 × 800 — shown as a circle, so keep the subject in the middle.',
  story: 'Best: 4:5 upright, 1200 × 1500.',
  lookbook: 'Best: 4:5 upright, 1200 × 1500.',
  tile: 'Best: normal tile 2:3 (1200 × 1800), wide tile 4:3 (2000 × 1500). The edges may be cropped; the heading sits bottom-left.',
  blog: 'Best: 3:2 landscape, 1800 × 1200 — the blog page and Facebook link previews use it.',
  logo: 'Best: about 4:1 wide, 600 × 150, a PNG with a see-through background. Shown only 36–44 px tall — keep it simple.',
  favicon: 'Best: square, 512 × 512 (the centre square is used).',
  share: 'Best: 1200 × 630 (cut to that from the centre). Facebook / WhatsApp link previews.',
} as const
