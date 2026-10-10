import { Column, Row, Section, Text } from '@react-email/components'
import { BRAND } from '../brand.js'
import { CallToAction, Heading, Layout, P } from '../layout.js'
import type { EmailContent } from '../render.js'

// ---- 10. Low stock (to the admin) ---------------------------------------------
export interface LowStockLine {
  productName: string
  variantLabel: string
  sku: string
  stock: number
  threshold: number
}

const cell = { fontSize: '14px', margin: 0, color: BRAND.colors.foreground }

export function lowStockEmail(d: { items: LowStockLine[]; inventoryUrl: string }): EmailContent {
  const n = d.items.length
  const first = d.items[0]
  return {
    tag: 'low-stock',
    subject:
      n === 1 && first
        ? `Low stock: ${first.productName} (${first.variantLabel}) — ${first.stock} left`
        : `Low stock: ${n} items`,
    element: (
      <Layout preview="Time to restock." footer="Sent to the admin email set in Admin → Settings.">
        <Heading>Low stock</Heading>
        <P>{n === 1 ? 'This item has' : 'These items have'} reached the low-stock level:</P>
        <Section>
          {d.items.map((i) => (
            <Row
              key={i.sku}
              style={{ borderBottom: `1px solid ${BRAND.colors.border}`, padding: '6px 0' }}
            >
              <Column>
                <Text style={cell}>
                  {i.productName} ({i.variantLabel})
                </Text>
                <Text style={{ ...cell, color: BRAND.colors.muted }}>SKU {i.sku}</Text>
              </Column>
              <Column align="right">
                <Text style={{ ...cell, fontWeight: 700 }}>
                  {i.stock === 0 ? 'Sold out' : `${i.stock} left`}
                </Text>
                <Text style={{ ...cell, color: BRAND.colors.muted }}>alert at {i.threshold}</Text>
              </Column>
            </Row>
          ))}
        </Section>
        <CallToAction href={d.inventoryUrl}>Open inventory</CallToAction>
      </Layout>
    ),
  }
}
