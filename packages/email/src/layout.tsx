import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { type ReactNode, useContext } from 'react'
import { BRAND, StoreContext } from './brand.js'

const c = BRAND.colors

/** What every email shares: header, body, footer. Mobile-first: one 560px column. */
export function Layout({
  preview,
  children,
  footer,
}: {
  preview: string
  children: ReactNode
  footer?: ReactNode
}) {
  const store = useContext(StoreContext)
  return (
    <Html lang="en">
      <Head />
      {/* The grey line inbox apps show next to the subject. */}
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: c.surfaceMuted,
          fontFamily: BRAND.font,
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            maxWidth: '560px',
            padding: '32px 24px',
            borderRadius: '8px',
          }}
        >
          <Text
            style={{
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              margin: 0,
              color: c.foreground,
            }}
          >
            {store.name}
          </Text>
          <Text style={{ fontSize: '13px', color: c.muted, margin: '0 0 24px' }}>
            {store.tagline || '\u00a0'}
          </Text>
          {children}
          <Hr style={{ borderColor: c.border, margin: '32px 0 16px' }} />
          <Text style={{ fontSize: '12px', color: c.muted, margin: 0 }}>
            {footer ??
              `You're receiving this because you shopped at ${store.name}. Reply to this email if you need help.`}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: '20px', fontWeight: 600, color: c.foreground, margin: '0 0 12px' }}>
      {children}
    </Text>
  )
}

export function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        fontSize: '15px',
        lineHeight: '24px',
        color: muted ? c.muted : c.foreground,
        margin: '0 0 12px',
      }}
    >
      {children}
    </Text>
  )
}

export function CallToAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0' }}>
      <Button
        href={href}
        style={{
          backgroundColor: c.brand,
          color: c.brandForeground,
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 20px',
          borderRadius: '6px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/** A boxed note — e.g. the order number, or the admin's instructions. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: c.surfaceMuted,
        borderRadius: '6px',
        padding: '12px 16px',
        margin: '12px 0',
      }}
    >
      <Text style={{ fontSize: '15px', lineHeight: '22px', margin: 0, color: c.foreground }}>
        {children}
      </Text>
    </Section>
  )
}
