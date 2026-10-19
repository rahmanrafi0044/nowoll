'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * After a form is sent with mistakes, move the keyboard focus to the first
 * wrong field (accessibility audit, step 52 — WCAG 3.3.1 / 4.1.3).
 *
 * WHY: the fields already show their error and are marked aria-invalid, but
 * focus stayed on the button — a screen-reader user heard nothing and didn't
 * know why "Continue" did nothing. On the field, the reader says its label,
 * "invalid entry" and the error text; a sighted keyboard user lands on it too.
 *
 * Usage:  const { formRef, focusFirstError } = useFocusFirstError()
 *         <form ref={formRef} …>   …in submit, after setErrors(…): focusFirstError()
 *
 * It runs after React has drawn the new errors (an effect), and only after a
 * failed submit — never while the customer is typing.
 */
export function useFocusFirstError<T extends HTMLElement = HTMLFormElement>() {
  const formRef = useRef<T>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (attempt === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempt])
  return { formRef, focusFirstError: () => setAttempt((n) => n + 1) }
}
