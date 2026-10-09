# Paste-in for the `mainland-product-import` skill

Add after "Our marketplace model":

## Confirming swappable orders (after Mainland confirms)

A Mainland swap has no supply behind it. Once Matthew confirms the week's
order, each customer **swappable order line** on the delivering request is
"confirmed" by giving it real supply: a **new request line** on the request
plus a **grower offer** from Local Nursery (1053) at **Mainland unit cost ×
pack** (dollars per pack; stored in cents). The marketplace then matches the
customer's swap to the offer automatically and the line drops off
`GET /buyer/orders/{id}/swappable-details`; on the customer's order it shows
`corresponding_offer_exists: true`.

- Scope: admin. `/buyers/{id}/buyer-orders` is admin-only (sales gets 403).
  Buyer **318 is our own "Victorias Blossom Wholesale"** account that owns
  the weekly requests; customers are sub-buyers.
- Endpoints: `POST /buyers/orders/{buyerOrder}/details {product_id,
  parameter_card_id, quantity, is_standing:false}` then
  `POST /order-details/{buyerOrderDetail}/grower-offers {product_id,
  parameter_card_id, grower_id:1053, quantity, price, is_standing:false,
  draft:false}`. Both answer with an Inertia HTML redirect — read the page
  props back to confirm.
- Rules from Eduardo: always a **new** request line (never offer against an
  existing one); the **condition is Matthew's confirmation** — Thursday if it
  is in, Friday otherwise, alert if still missing Friday 10:00 Pacific; a line
  Mainland dropped or substituted is **reported, never confirmed**; several
  identical swaps match **randomly**, so verify by totals per product + pack.
- Never delete anything other than a detail/offer the same run created on a
  partial failure.
