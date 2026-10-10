import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Unmount rendered components between tests so they can't affect each other.
afterEach(() => {
  cleanup()
})

// jsdom (the test "browser") has no <dialog> showModal()/close() yet — real
// browsers all do. A minimal stand-in, TESTS ONLY: open/close + the "close" event.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

// next/font only works inside the Next.js compiler — a stand-in for tests.
vi.mock('next/font/google', () => {
  const font = (name: string) => () => ({ className: name, variable: `font-${name}`, style: {} })
  return { Inter: font('inter'), Poppins: font('poppins'), Hind_Siliguri: font('hind-siliguri') }
})
