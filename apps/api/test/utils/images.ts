import sharp from 'sharp'

/** A real JPEG with EXIF GPS coordinates — like a photo taken on a phone in Dhaka. */
export function jpegWithGps(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#1e3a8a' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'X1' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '23/1 48/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '90/1 24/1 0/1',
      },
    })
    .toBuffer()
}

export const png = (width = 32, height = 32) =>
  sharp({ create: { width, height, channels: 4, background: '#ffffff00' } })
    .png()
    .toBuffer()

export const webp = () =>
  sharp({ create: { width: 16, height: 16, channels: 3, background: '#000' } })
    .webp()
    .toBuffer()
