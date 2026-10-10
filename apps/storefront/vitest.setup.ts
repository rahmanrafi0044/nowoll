import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Unmount rendered components and clear storage between tests so they can't affect each other.
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

// jsdom (the fake browser used in tests) doesn't implement <dialog>.showModal()
// fully — add a minimal stand-in so components using native dialogs can be tested.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}
if (typeof HTMLDialogElement !== 'undefined') {
  const realClose = HTMLDialogElement.prototype.close
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (realClose && this.open) return realClose.call(this)
    this.removeAttribute('open')
  }
}

// next/font only works inside the Next.js compiler — in tests, a stand-in
// that gives each font its CSS variable class (no files are downloaded).
vi.mock('next/font/google', () => {
  const font = (name: string) => () => ({ className: name, variable: `font-${name}`, style: {} })
  return { Inter: font('inter'), Poppins: font('poppins'), Hind_Siliguri: font('hind-siliguri') }
})
