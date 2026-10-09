# Paste-in for the "Mainland plant purchases" scheduled prompt — MODE CONFIRM

Verified end to end on 2026-10-09 (request 3138, line VIC-0025503).

## 1. Add two fires to the schedule

- Thursday ~17:10 Pacific (early confirm, if Matthew has already answered)
- Friday ~10:10 Pacific (deadline confirm / alert)

## 2. Add to STEP 0 — WHICH MODE, before the "anything else" line

```
Thursday, hour 17-18 -> MODE CONFIRM
Friday, hour 10 -> MODE CONFIRM (deadline fire)
```

(REVIEW stays Monday-Friday 7-9; KEEPALIVE keeps Friday noon and 3pm.)

## 3. New mode section

```
MODE CONFIRM (Thursday 5pm and Friday 10am) — put real supply behind the
delivering request's swappable orders, once Mainland has confirmed

The CONDITION is Matthew's confirmation. Nothing in this mode runs without it.

TARGET request = the AVAILABLE request with the nearest delivery date (on
Thursday evening and Friday morning that is the request delivering Friday).
State its id and delivery date in the summary.

GATE 1 — confirmation (Gmail only):
  a. Find the latest order email sent to operations@mainlandfloral.ca whose
     subject carries the TARGET's delivery date (the FINAL one if it exists,
     otherwise the last running total). If none exists, alert and stop.
  b. Find a message from mainlandfloral.ca dated AFTER it (same thread or a
     new one). None -> on the Thursday fire do nothing and say "waiting for
     Matthew"; on the Friday fire send the alert "ACTION NEEDED: Mainland
     plant purchases - no confirmation from Matthew by Friday 10am for
     delivery <date>" listing the unconfirmed swappable lines, and stop.
  c. Read the reply. If it is a plain acknowledgement, continue. If it
     mentions anything not filled as ordered (out of stock, short, dropped,
     substitute, can't, replace, question), do NOT confirm any line: alert
     Eduardo with Matthew's words and the full swappable list, and stop.
     Eduardo decides; a dropped or substituted line is never confirmed by
     the routine.

GATE 2 — the lines (SALES context):
  GET /buyer/orders/{target}/swappable-details -> props.subBuyerOrderDetails
  .data, keep grower_id 1053. These are the unconfirmed lines: a line
  drops off this list the moment an offer matches it. Empty list -> say so
  and stop. Map each line to its ledger row by product_id +
  parameter_card_id; take Mainland unit cost (cost) and pack. Unmapped ->
  list under "Unmapped", do not confirm it. Skip any line id named in an
  earlier "confirm swappables mismatch" alert for this request (search
  sent mail for that subject) — those are Eduardo's to resolve.
  Also run the ledger/price sanity: a null or zero cost means stop and alert,
  exactly like the scrape gate.

WRITES (ADMIN context — /buyers/... is admin scope; the sales login gets
403), from inside the logged-in page with fetch(), the usual headers:
  For EACH line, in this order, chunked at 20 lines per run call,
  checkpointing stop/start between chunks:
  1. before = max detail id on the request, from
     GET /buyers/318/buyer-orders?buyer_order_id={target} ->
     props.selectedBuyerOrder.details.data (paginated, 50 per page;
     page through).
  2. POST /buyers/orders/{target}/details
     {product_id, parameter_card_id, quantity: <line quantity>,
      is_standing: false}
     ALWAYS a new line, even when a no-offer line for the product already
     exists (Eduardo's rule). The reply is a 200 with an HTML redirect, not
     JSON: success is read back from the page, never from the response.
  3. Re-read; the new line = the detail with id > before, same product and
     card, zero offers. Not found -> stop the mode, alert with the line.
  4. POST /order-details/{newDetailId}/grower-offers
     {product_id, parameter_card_id, grower_id: 1053,
      quantity: <line quantity>, price: <cost x pack, dollars, 2 dp>,
      is_standing: false, draft: false}
     Dollars in, cents stored (58.32 -> 5832). Same read-back rule.
  5. Re-read; require the offer on that line (grower 1053, quantity, price
     in cents). Missing -> stop the mode, alert with both ids.
  Record every created detail id and offer id for the summary.

VERIFY (SALES context, once, after all chunks):
  Re-read swappable-details. Every line processed must be gone. Verify by
  totals per product + pack, never per line: when several identical swaps
  exist the match is random. Any processed line still present -> alert
  "ACTION NEEDED: Mainland plant purchases - confirm swappables mismatch
  <request id>" naming the line ids and the created detail/offer ids, and
  never create for those lines again. Spot-check one customer order:
  GET /buyer/sub-buyer-orders/{sub_buyer_order_id}/details -> the line
  shows corresponding_offer_exists: true.

NEVER: reuse an existing request line; delete anything except, on a
partial failure, the detail or offer this run just created (DELETE
/buyers/orders/{bo}/details/{id} and DELETE /grower-offers/{id}); touch a
request other than the TARGET; confirm a line Matthew did not accept.
```

## 4. Summary line and safety rules

Add "confirmed" to the FINISH list: per request, lines confirmed with their
detail and offer ids, lines skipped (unmapped / mismatch / Matthew problem),
and whether the confirmation gate passed, waited, or alerted. Add to SAFETY
RULES: "Request lines and grower offers are created only in MODE CONFIRM,
only on the TARGET request, only after Matthew's confirmation."
