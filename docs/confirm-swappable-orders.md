# Confirm swappable orders (Mainland) — recorded workflow

Status: **recorded, not yet automated.** Steps are Eduardo's own, given on
2026-10-09 while confirming the Vernon Flower Shop line on request 3138.
Open questions at the bottom must be answered before this runs unattended.

## What this step is

Mainland plants are published as **no-inventory swaps**. A customer order on
one of those is a *swappable order line*: there is no real supply behind it.
"Confirming" a swappable line means putting real supply behind it — a request
for the product plus an offer from the Mainland grower (Local Nursery, 1053) —
so the marketplace can match the customer's swap to that offer.

Once Mainland has confirmed the plant order, every swappable line on that
delivery's request is confirmed this way, one line at a time.

## Rules (from Eduardo)

- **Scope:** each swappable order line individually. Not the request as a whole.
- **Precondition:** Matthew's **final** confirmation of the order email must
  have been received. No confirmation, no confirming.
- **Deadline / alert:** if Matthew's final confirmation has not arrived by
  **Friday 10:00 Pacific**, alert Eduardo instead of proceeding.
- **When it runs:** at the **end of the routine, once all confirmations have
  been sent** — i.e. after the CLOSE cycle's FINAL email has gone and Matthew
  has answered it.
- **Matching is random:** if several identical swaps exist (same product, same
  pack) the system matches each new offer to *any* available one. Verification
  therefore has to be by totals per product/pack, not per line.

## The steps, as performed by hand

Example: Vernon Flower Shop, product *Assorted 4" African Violet*, colour
Bicolor, grower Local Nursery, swappable quantity 1, pack 15.

1. Open the buyer's orders page for the request:
   `https://victoriasblossom.net/buyers/318/buyer-orders?__month=10&__year=2026&buyer_order_id=3138&grower_id=&orders_from=2026-9-28&orders_to=2026-11-1&page=1&query=`
   (318 is the buyer id Eduardo used for Vernon Flower Shop.)
2. On the swappable line, use the **three-dots menu** and **create a new
   request** for that product, with **quantity = the swappable quantity** (1).
3. Select the **pack** (15).
4. **Create the request.**
5. **Make the offer** for the request just created, from **Local Nursery**
   (the grower we use for Mainland).
6. Price the offer at **"the price of the grower"** (see open question 1).
7. **Create the offer.**
8. Open the customer order, e.g.
   `https://victoriasblossom.net/buyer/sub-buyer-orders/BO-0018243/details`
9. Confirm the swap was **automatically matched**.
10. Remember the random-matching caveat above when there are several
    identical swaps.

## What the server shows (read-only probe, 2026-10-09)

- Request **3138**, delivery 2026-10-09, status `packing load`.
- `GET /buyer/orders/3138/swappable-details` →
  `props.subBuyerOrderDetails.data`: 27 lines, all grower 1053.
- Line fields: `id` (e.g. `VIC-0025611`), `sub_buyer_order_id`,
  `warehouse_id`, `grower_id`, `product_id`, `parameter_card_id`, `quantity`,
  `price`, `sale_tax_rate`, `meta`, `team_id`, `display_order`, `created_at`,
  `updated_at`, `deleted_at`, `sku`, `product`, `parameter_card`,
  `sub_buyer_order`, `grower`.
- There is **no `status` field on a line**. "Confirmed" is not a flag on the
  swappable line; it is the existence of a matched request + offer. Detecting
  lines already confirmed by hand therefore needs the match to be read from
  somewhere else (see open question 3).

## Open questions — block automation until answered

1. **"Price of the grower."** Which number: the price we published for the
   product on the request (Mainland cost × pack ÷ 0.8), or Mainland's unit
   cost, or something shown on the offer form? This is money; it must not be
   guessed.
2. **Lines Mainland did not fill as ordered.** On this very delivery Matthew
   dropped a Tillandsia and added two items. If a line was dropped or
   substituted, should it still be confirmed, or skipped and reported?
3. **Lines already confirmed by hand.** How does the automation recognise a
   line that already has a matched offer, so it is left alone and not
   double-confirmed? (Where does the "automatically matched" state in step 9
   live on the server?)
4. **Endpoints.** The steps above are UI clicks. To run unattended the exact
   backoffice calls behind "create request", "create offer" and the match
   check must be captured — most safely by replicating the ten steps once, on
   one line, with request recording on, and reading the result back. That
   replication has not been done.
5. **Partial failure.** If request creation succeeds but the offer fails, is
   the orphan request to be deleted, left for Eduardo, or retried?

## Where this must also be recorded once the questions are answered

- The `mainland-product-import` skill (account-level copy; the synced local
  directory is rebuilt every run, so edits there do not persist).
- The "Mainland plant purchases" scheduled prompt, as a step at the end of the
  routine gated on Matthew's final confirmation, with the Friday 10:00 Pacific
  alert.

## Read-only findings, 2026-10-09 afternoon (ADMIN context)

- `/buyers/{id}/buyer-orders` is **admin scope**: the SALES login gets
  `403 THIS ACTION IS UNAUTHORIZED`. The ADMIN context's backoffice login had
  expired; `login.mjs backoffice --role admin` restored it (remember-me ticked,
  `PERSISTS_OK`, 400-day `remember_web_*` cookie).
- **Buyer 318 is "Victorias Blossom Wholesale" — our own account**, owner of
  request 3138. It is not the customer. Customers are `sub_buyer`s (Vernon
  Flower Shop is sub_buyer 472).
- Request 3138 is a `BuyerOrder`. Its `details` (paginated, 50 per page) are
  the **request lines**: `id, product_id, parameter_card_id, grower_id,
  quantity, is_standing, buyer_order_id, grower_offers[]`.
- An **offer** hangs off a request line: `id, product_id, parameter_card_id,
  grower_id, quantity, price` (cents), `is_standing, draft,
  buyer_order_detail_id, meta{grower_invoice_number, visible_in_marketplace},
  cost_analysis_id`.
- **Ground truth from Eduardo's hand-done Vernon line:** request line 667395
  (Assorted 4" African Violet, product 73892, card 5390 = PACK-15, qty 1)
  carrying offer 1549133 from grower 1053 at **3210 cents = $32.10/pack**.
  Ledger Mainland cost for 1-10-030 is 2.09/unit x 15 = $31.35 — does not
  match; which number was typed needs confirming.
- **Request lines already exist on 3138 for the Mainland swappable items**,
  with quantity equal to the packs ordered and no offer: Ming Stump 667378
  (qty 1), Chinese Money Plant 667377 (qty 2) and 667394 (qty 1), Premium
  Assorted 4" 667376, and an older African Violet line 667375 (qty 2, no
  offer) next to the new 667395. So step 2 ("create a new request") may be
  duplicating a line the system already made from the customer order; it may
  be that only the offer is needed, against the existing line.
- Boston Fern line 667265 already carries a 1053 offer and is absent from the
  swappable list — consistent with rule 2 (matched lines drop off).
- **New request form** (modal): product-name search, subcategory filter,
  quantity, Standing order / Open market select; buttons "Create and close",
  "Create and new".
- **New offer form** (inline on a request line): subcategory filter, grower
  filter, "Search requests...", quantity, Standing/Open market, price, two
  checkboxes, grower invoice number, one more select, and a text field that
  defaults to "1". Inputs are Vue-bound with no `name` attributes, so the
  endpoints were not captured. **No write was attempted.**

## Answers from Eduardo (2026-10-09, later)

- **Price of the grower = Mainland unit cost × pack size**, in dollars per
  pack. The $32.10 on the hand-done African Violet was a typo; $31.35
  (2.09 × 15) is right. Ming Stump: 14.58 × 4 = **$58.32**.
- **Always create a new request line**; never offer against a line that is
  already there, even when one exists with no offer.
- Dropped or substituted lines: **report to Eduardo**, do not confirm.
- Timing: **the condition is Matthew's confirmation.** If it is in on
  Thursday, run Thursday; otherwise Friday; if still missing at Friday 10:00
  Pacific, alert.

## Mechanics (discovered read-only; verified against Laravel validation)

All on the **ADMIN context**, from inside a logged-in backoffice page, with
the usual headers (`X-XSRF-TOKEN` = decoded `XSRF-TOKEN` cookie,
`X-Requested-With: XMLHttpRequest`, `Accept: application/json`).

1. **New request line** on the delivering request:
   `POST /buyers/orders/{buyerOrderId}/details`
   `{ product_id, parameter_card_id, quantity, is_standing: false }`
   (quantity = the swappable line's packs; product/card = the swappable
   line's `product_id` / `parameter_card_id`.)
2. Re-read `GET /buyers/318/buyer-orders?buyer_order_id={id}` →
   `props.selectedBuyerOrder.details.data` (paginated, 50/page) and take the
   newest line for that product/card with no offers — that is the new line.
3. **Offer** on it from Local Nursery:
   `POST /order-details/{buyerOrderDetailId}/grower-offers`
   `{ product_id, parameter_card_id, grower_id: 1053, quantity, price,
   is_standing: false, draft: false }` — `price` in **dollars per pack**
   (= Mainland unit cost × pack); the DB stores cents (hand-done offer shows
   `3210` for $32.10). Confirm on first live run that `58.32` lands as `5832`;
   `PUT /grower-offers/{id}` exists to correct it if not.
4. **Verify the match** on the SALES context: the swappable line must be
   gone from `GET /buyer/orders/{id}/swappable-details`. Totals per
   product+pack are the unit of verification, never individual lines
   (random matching when several identical swaps exist).

Both store endpoints answer `422` with the field list above on an empty body
and create nothing — that is how the fields were confirmed. Other routes of
interest: `PUT buyer/sub-buyer-orders/details/{id}/swap` (the match itself,
sales scope), `DELETE buyers/orders/{bo}/details/{d}` and
`DELETE grower-offers/{id}` (cleanup of a partial failure — only on the
line/offer this run created, never anything else).

## Status

- The single supervised run on Ming Stump (product 74011, card 5563, qty 1,
  $58.32, sub-buyer line VIC-0025503 / The Painted Daisy) was prepared and
  **blocked by the session's permission mode** before any call was made.
  Nothing was created. The exact module is ready to re-run with approval.

## Supervised run, 2026-10-09 ~14:10 Pacific — approved by Eduardo

- `POST /buyers/orders/3138/details {product_id 74011, parameter_card_id
  5563, quantity 1, is_standing false}` → request line **667396**.
- `POST /order-details/667396/grower-offers {grower_id 1053, quantity 1,
  price 58.32, is_standing false, draft false, …}` → offer **1549143**,
  stored `price: 5832`. **Confirmed: the endpoint takes dollars per pack and
  the DB stores cents.**
- Both calls answer `200` with an HTML (Inertia redirect) body, not JSON;
  success is confirmed by reading the page props back, not from the response.
- The pre-existing no-offer line 667378 for the same product was left alone,
  per "always create a new line".

### Verification (SALES context, same afternoon)

- `GET /buyer/orders/3138/swappable-details`: **25 → 24 lines**;
  VIC-0025503 (Ming Stump, The Painted Daisy) is gone. Matching was
  immediate — no delay between the offer and the line dropping off.
- `GET /buyer/sub-buyer-orders/VIC-0001232/details` (the customer's order):
  that line now carries **`corresponding_offer_exists: true`**, grower 1053,
  customer price 7290 ($72.90 = Mainland 14.58 × 4 ÷ 0.8). This field is the
  per-line "confirmed" signal on the customer side; the swappable list is the
  to-do list.

Paste-in drafts: `docs/routine-block-confirm.md` (the scheduled prompt) and
`docs/skill-section-confirm.md` (the skill).

## Full run on request 3138, 2026-10-09 ~14:40 Pacific — "do the rest"

Gate: Matthew's reply to the FINAL email (Thu 3:43pm, plain acknowledgement). Plan built from the swappable list × today's ledger, totals per code cross-checked against the FINAL email (all 18 codes matched). Two chunks (20 + 3) on ADMIN with a stop/start between, verification on SALES.

| Swappable line | Code | Packs | Offer $/pack | Request line | Offer |
|---|---|---|---|---|---|
| VIC-0025989 | 1-15-050 | 2 | 66.00 | 667397 | 1549144 |
| VIC-0025517 | 5-10-002 | 1 | 45.30 | 667398 | 1549145 |
| VIC-0025612 | 5-10-882 | 1 | 57.75 | 667399 | 1549146 |
| VIC-0026020 | 5-10-882 | 1 | 57.75 | 667400 | 1549147 |
| VIC-0025490 | 5-15-009 | 1 | 38.64 | 667401 | 1549148 |
| VIC-0025615 | 5-15-009 | 1 | 38.64 | 667402 | 1549149 |
| VIC-0025744 | 5-15-009 | 1 | 38.64 | 667403 | 1549150 |
| VIC-0025958 | 5-25-372 | 1 | 34.10 | 667404 | 1549151 |
| VIC-0025617 | 5-25-423 | 2 | 30.80 | 667405 | 1549152 |
| VIC-0026034 | 5-25-932 | 1 | 39.60 | 667406 | 1549153 |
| VIC-0025497 | 6-20-328 | 1 | 24.75 | 667407 | 1549154 |
| VIC-0026018 | 6-20-328 | 1 | 24.75 | 667408 | 1549155 |
| VIC-0026019 | 6-20-930 | 1 | 42.36 | 667409 | 1549156 |
| VIC-0025743 | 6-25-130 | 1 | 10.45 | 667410 | 1549157 |
| VIC-0025741 | 6-25-870 | 1 | 10.45 | 667411 | 1549158 |
| VIC-0025740 | 6-25-910 | 4 | 10.45 | 667412 | 1549159 |
| VIC-0025742 | 6-25-930 | 1 | 10.45 | 667413 | 1549160 |
| VIC-0025616 | 7-00-295 | 1 | 46.20 | 667414 | 1549161 |
| VIC-0025629 | 9-00-790 | 1 | 10.72 | 667415 | 1549162 |
| VIC-0025484 | 5-15-120 | 1 | 45.24 | 667416 | 1549163 |
| VIC-0025739 | 7-15-340 | 1 | 125.40 | 667417 | 1549164 |
| VIC-0025630 | 7-15-465 | 1 | 132.00 | 667418 | 1549165 |
| VIC-0025518 | 7-00-590 | 1 | 94.56 | 667419 | 1549166 |

Confirmed: 23 lines, 28 packs, offers total $1163.15. Failures: 0.

Plus Ming Stump VIC-0025503 from the supervised run (667396 / 1549143): **24 of 25 lines confirmed.**

- 7-00-590 (Clay Pot, VIC-0025518) is `dropped` in the ledger because Mainland de-listed it on Oct 8, but it is on the confirmed FINAL email, so it was confirmed at 11.82 × 8. The plan builder must map by product+card regardless of ledger status and use the emailed order, not today's catalogue, as the source of truth.
- **Held back: VIC-0026072, Flower Chix Calgary, Large Flowering 6" (5-15-960), 2 packs.** Never on any order email to Matthew, so not confirmed. Needs Eduardo: order it from Mainland or tell the customer.
- Verification: swappable list 25 → 1 (only the held-back line); customer orders VIC-0001234 and VIC-0001244 show `corresponding_offer_exists: true` on every Mainland line.
