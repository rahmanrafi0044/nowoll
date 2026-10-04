import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount rendered components and clear storage between tests so they can't affect each other.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
