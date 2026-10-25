# Photo guide — the right size for every picture

The shop shows each kind of photo in a fixed **shape** (its frame). A photo of another shape is **cropped to
fit — never stretched**, so keep the important part in the **middle**. The admin shows the same advice under
every upload (`apps/admin/src/lib/photo-sizes.ts` — change both together).

## For every photo

- **JPEG** for photos; **PNG** only when you need a see-through background (the logo). WebP is accepted too
  (saved as JPEG — Meta's catalogue and many email apps don't take WebP).
- **Up to 5 MB.** Bigger than **2400 px** on the longest side is shrunk anyway, and the shop makes small
  versions for phones itself — so 2400 px is plenty.
- **The same shape for every photo of one kind**, so grids line up.
- **Location data (GPS) is removed** from phone photos on upload.
- **Always "Describe the photo"** (e.g. "Sage lawn three-piece, front") — Google and blind visitors use it.

## Every slot

| Where it appears | Shape (width : height) | Upload size | Notes |
|---|---|---|---|
| **Product photos** (cards, product page) | **3:4** upright | **1500 × 2000** (min 1200 × 1600) | A phone camera's normal shape. Photo 1 = front on a plain background; photo 2 shows when the mouse is on a card (back, detail or worn). Cards use up to 4. |
| **Category photo** (homepage, big menu) | **3:4** | **1200 × 1600** | The phone menu shows it a little shorter (4:5) — keep the garment centred. |
| **Hero slides** (top of the homepage) | wide **16:9** | **2400 × 1350** (min 1920 × 1080) | Phones show only a tall **middle strip** — keep the person in the centre. The heading sits **bottom-left** on a dark shade. |
| **Promo banners** | **16:9** | **1920 × 1080** | Text you add sits along the bottom. |
| **Photo and text** | **4:5** | **1200 × 1500** | |
| **Round photo links** | **1:1** square | **800 × 800** | Shown as a circle — the corners are cut off. |
| **Brand story** | **4:5** | **1200 × 1500** | |
| **Lookbook ("Spotted")** | **4:5** | **1200 × 1500** | Only with the person's permission. |
| **Category photo tiles** (in a product list) | normal ≈ **2:3**, wide ≈ **4:3** | **1200 × 1800** / **2000 × 1500** | They fill a grid space next to product cards; edges may be cropped; heading bottom-left. |
| **Blog cover** | **3:2** | **1800 × 1200** | Also the Facebook link preview of the post. |
| **Logo** (Settings → Look) | about **4:1** | **600 × 150**, PNG see-through | Shown only 36–44 px tall — must read clearly when small. |
| **Browser-tab icon** (favicon) | **1:1** | **512 × 512** | The centre square is used. |
| **Share image** (WhatsApp / Facebook previews) | **1.91:1** | **1200 × 630** | Cut to that from the centre. |

## Taking product photos with a phone

- Daylight from a window, no flash; a plain light background (white wall or sheet).
- Hold the phone **upright** (it then takes 3:4) and keep the same distance for every product.
- The garment centred with a little space around it.
- The same background and light for every product — that's what makes a shop look premium.
