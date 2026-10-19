import { Input } from '@nowoll/ui'
import { fireEvent, render, screen } from '@testing-library/react'
import { type FormEvent, useState } from 'react'
import { useFocusFirstError } from './use-focus-first-error'

/** A small form like the shop's: two fields, errors shown on submit. */
function Form() {
  const { formRef, focusFirstError } = useFocusFirstError()
  const [values, setValues] = useState({ name: '', phone: '' })
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  function submit(e: FormEvent) {
    e.preventDefault()
    const found = {
      name: values.name ? undefined : 'Enter your name',
      phone: values.phone ? undefined : 'Enter your phone',
    }
    setErrors(found)
    if (found.name || found.phone) return focusFirstError()
  }
  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      <Input
        label="Name"
        value={values.name}
        error={errors.name}
        onChange={(e) => setValues({ ...values, name: e.target.value })}
      />
      <Input
        label="Phone"
        value={values.phone}
        error={errors.phone}
        onChange={(e) => setValues({ ...values, phone: e.target.value })}
      />
      <button type="submit">Continue</button>
    </form>
  )
}

describe('useFocusFirstError (step 52)', () => {
  it('a failed submit moves focus to the first wrong field', () => {
    render(<Form />)
    const button = screen.getByRole('button', { name: 'Continue' })
    button.focus()
    fireEvent.click(button)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter your name')
  })

  it('skips fields that are right: the first WRONG one gets focus', () => {
    render(<Form />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rafi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Phone')).toHaveFocus()
  })

  it('never moves focus while typing — only after a submit', () => {
    render(<Form />)
    const phone = screen.getByLabelText('Phone')
    phone.focus()
    fireEvent.change(phone, { target: { value: '0171' } })
    expect(phone).toHaveFocus()
  })
})
