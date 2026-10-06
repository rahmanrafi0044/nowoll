import { Column, Row, Section, Text } from '@react-email/components'
import { BRAND } from '../brand.js'
import { formatBdt, type Money } from '../format.js'

export interface EmailOrderLine {
  productName: string
  variantLabel: string // "M / Blue"
  quantity: number
  lineTotal: Money
}

const cell = { fontSize: '14px', lineHeight: '20px', margin: 0, color: BRAND.colors.foreground }
const muted = { ...cell, color: BRAND.colors.muted }

/** The items of an order (or of a return), one row each. */
export function OrderLines({
  lines,
  showPrices = true,
}: {
  lines: EmailOrderLine[]
  showPrices?: boolean
}) {
  return (
    <Section style={{ margin: '16px 0' }}>
      {lines.map((l, i) => (
        <Row key={i} style={{ borderBottom: `1px solid ${BRAND.colors.border}`, padding: '8px 0' }}>
          <Column>
            <Text style={cell}>{l.productName}</Text>
            <Text style={muted}>
              {l.variantLabel} · {l.quantity} ×
            </Text>
          </Column>
          {showPrices && (
            <Column align="right" style={{ verticalAlign: 'top' }}>
              <Text style={cell}>{formatBdt(l.lineTotal)}</Text>
            </Column>
          )}
        </Row>
      ))}
    </Section>
  )
}

export interface EmailTotals {
  subtotal: Money
  discount: Money
  discountCode: string | null
  shippingFee: Money
  vatRate: Money
  vatAmount: Money
  total: Money
}

/** Subtotal → discount → delivery → VAT (only when above 0%) → total, like the receipt page. */
export function Totals({ totals }: { totals: EmailTotals }) {
  const rows: [string, string][] = [['Subtotal', formatBdt(totals.subtotal)]]
  if (Number(totals.discount) > 0)
    rows.push([
      `Discount${totals.discountCode ? ` (${totals.discountCode})` : ''}`,
      `−${formatBdt(totals.discount)}`,
    ])
  rows.push(['Delivery', Number(totals.shippingFee) === 0 ? 'Free' : formatBdt(totals.shippingFee)])
  if (Number(totals.vatRate) > 0)
    rows.push([`VAT (${Number(totals.vatRate)}%)`, formatBdt(totals.vatAmount)])
  return (
    <Section>
      {rows.map(([label, value]) => (
        <Row key={label}>
          <Column>
            <Text style={muted}>{label}</Text>
          </Column>
          <Column align="right">
            <Text style={cell}>{value}</Text>
          </Column>
        </Row>
      ))}
      <Row>
        <Column>
          <Text style={{ ...cell, fontWeight: 700, fontSize: '16px', paddingTop: '8px' }}>
            Total
          </Text>
        </Column>
        <Column align="right">
          <Text style={{ ...cell, fontWeight: 700, fontSize: '16px', paddingTop: '8px' }}>
            {formatBdt(totals.total)}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}
