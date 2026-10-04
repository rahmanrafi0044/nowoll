import sharp from 'sharp'
import { jpegWithGps, png, webp } from '../../../test/utils/images.js'
import { detectImageKind, processImage } from './image-processing.js'

describe('detectImageKind', () => {
  it('recognizes real JPEG, PNG and WebP files by their bytes', async () => {
    expect(detectImageKind(await jpegWithGps())).toBe('jpeg')
    expect(detectImageKind(await png())).toBe('png')
    expect(detectImageKind(await webp())).toBe('webp')
  })

  it.each([
    ['PHP script', Buffer.from('<?php system($_GET["c"]); ?>')],
    [
      'SVG (can contain scripts)',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['GIF', Buffer.from('GIF89a......')],
    ['HTML', Buffer.from('<!doctype html><html>')],
    ['RIFF that is not WebP (WAV audio)', Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ')],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_label, bytes) => {
    expect(detectImageKind(bytes)).toBeNull()
  })
})

describe('processImage', () => {
  it('strips EXIF metadata, including GPS location', async () => {
    const input = await jpegWithGps()
    expect((await sharp(input).metadata()).exif).toBeDefined() // the test photo really has GPS

    const out = await processImage(input, 'jpeg')
    const meta = await sharp(out.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(out.data.includes(Buffer.from('TestPhone'))).toBe(false)
    expect(out).toMatchObject({
      contentType: 'image/jpeg',
      extension: 'jpg',
      width: 64,
      height: 48,
    })
  })

  it('shrinks very large images to 2400px on the longest side', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#888' },
    })
      .jpeg()
      .toBuffer()
    const out = await processImage(big, 'jpeg')
    expect([out.width, out.height]).toEqual([2400, 1800])
  })

  it('never enlarges small images', async () => {
    const out = await processImage(await png(32, 32), 'png')
    expect([out.width, out.height]).toEqual([32, 32])
  })

  it('applies the phone orientation flag so photos are not sideways', async () => {
    // 60×40 landscape pixels, flagged "rotate 90°" like a portrait phone photo
    const rotated = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#f00' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const out = await processImage(rotated, 'jpeg')
    expect([out.width, out.height]).toEqual([40, 60])
  })

  it('throws for corrupt data that only LOOKS like a JPEG', async () => {
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('not really a jpeg'),
    ])
    await expect(processImage(fake, 'jpeg')).rejects.toThrow()
  })
})
