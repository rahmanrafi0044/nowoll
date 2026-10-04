// Focused unit test for the "clean up the file if the database fails" path,
// which is hard to trigger through the real database.
import type { PrismaService } from '../../prisma/prisma.service.js'
import { MemoryImageStorage } from '../../../test/utils/memory-image-storage.js'
import { jpegWithGps } from '../../../test/utils/images.js'
import { ImagesService } from './images.service.js'

describe('ImagesService.upload — compensation', () => {
  it('removes the uploaded file when saving the database row fails', async () => {
    const storage = new MemoryImageStorage()
    const prisma = {
      product: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) },
      productImage: {
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
        create: vi.fn().mockRejectedValue(new Error('database down')),
      },
    }
    const service = new ImagesService(prisma as unknown as PrismaService, storage)

    await expect(
      service.upload('p1', { buffer: await jpegWithGps() }, { altText: 'Front' }),
    ).rejects.toThrow('database down')
    expect(storage.files.size).toBe(0)
  })
})
