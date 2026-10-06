// Where an email's "View your order" button goes (step 26 decision #5):
//   signed-in customer → their order page (needs their sign-in anyway)
//   guest              → the public "Track your order" page — the email shows
//                        the order number to type in. We never put the private
//                        confirmation link (the order's id) in an email:
//                        emails get forwarded.
export function orderLink(siteUrl: string, order: { number: string; signedIn: boolean }) {
  const site = siteUrl.replace(/\/+$/, '')
  return order.signedIn
    ? {
        url: `${site}/account/orders/${encodeURIComponent(order.number)}`,
        label: 'View your order',
      }
    : { url: `${site}/orders/track`, label: 'Track your order' }
}
