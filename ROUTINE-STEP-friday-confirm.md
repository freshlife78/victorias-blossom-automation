# Draft: new Friday step for the "Mainland plant purchases" routine

Status: **DRAFT — the read/review half is ready; the write half needs Eduardo's sign-off
before it goes into the routine prompt.** Nothing in here has been run.

## What I found in the live backoffice (read-only probe, 9 Oct 2026)

The weekly cycle is a `BuyerOrder`. Two separate sides hang off it:

- **Purchases:** `BuyerOrderDetail` -> `GrowerOffer`. Route: `grower-offers.store` =
  `POST order-details/{buyerOrderDetail}/grower-offers`. An offer is created **under a
  BuyerOrderDetail** — there is no standalone "create offer" route. A GrowerOffer is what
  carries real marketplace stock.
- **Sales:** `SubBuyerOrder` -> `SubBuyerOrderDetail` (the customers' lines).
  Route: `sub-buyer-order-details.swap` = `PUT buyer/sub-buyer-orders/details/{id}/swap`,
  with `GET .../swap` returning the list of candidates a line may be swapped onto.

Other relevant routes: `pos.sub-buyer-orders.approve` = `POST pos/sub-buyer-orders/{subBuyerOrder}/approve`;
`grower-offers-marketplace-visibility.update` = `PUT grower-offers/{growerOffer}/marketplace-visibility`;
`reports.requests-vs-offers` = `GET reports/requests-vs-offers/{buyerOrder}`.

Observed on request 3138 (delivery Fri 9 Oct, status "packing load"):
27 customer order lines, all grower 1053. Line prices are in **cents** (3919 = $39.19);
each line carries a `sku` of `product_id-parameter_card_id-grower_id`. The swappable-details
page renders a **SWAP** and a **DELETE** button per row.

**The finding that blocks a safe guess:** `GET /buyer/sub-buyer-orders/details/VIC-0025611/swap`
returns an empty list today. So "change the swaps to offers" is *not* simply clicking SWAP —
a line can only be swapped onto an offer that already exists. The offers have to be created
first, which means money-touching writes (`grower-offers.store`), and the quantity to put on
each offer has to come from the acknowledgement PDF.

## The acknowledgement email

Mainland sends one email per order number from `sales@mainlandfloral.ca`, subject
`Mainland Floral <order#>` (e.g. `Mainland Floral 376580`), with the detail in a PDF
attachment named `MainlandFloral-<order#>.PDF`. The body is a fixed template and carries no
line items. It is **re-sent on every amendment** — there were 8 copies of order 376580 across
7-8 Oct — so only the latest matters. Separately, `donotreply@mainlandfloral.ca` sends
invoices (`Mainland Floral 315295`) and `AccountsReceivable@` sends statements; neither is
the acknowledgement.

---

## Proposed step (ready to paste once the write half is confirmed)

### MODE CONFIRM — Friday, hour 7-9 Pacific
Runs in the same Friday-morning fire, after MODE REVIEW's work.

**Delivering request** = the AVAILABLE request whose delivery date is TODAY (Pacific). Its
cutoff passed yesterday at 3pm, so it is CLOSED for plants: never publish, reprice or
unpublish on it in this mode. If there is no such request, skip this mode and say so.

**1. Find the acknowledgement.**
`search_threads {query:"from:sales@mainlandfloral.ca subject:\"Mainland Floral\" newer_than:7d"}`.
Take the LATEST message whose order covers today's delivery, and read its PDF attachment.
If no acknowledgement exists for this delivery, alert
"ACTION NEEDED: Mainland plant purchases - no acknowledgement for <date> delivery" and STOP.
Change nothing.

**2. Review it.** Compare the PDF line by line against the FINAL order email we sent to
operations@mainlandfloral.ca for this delivery. For every Mainland code compare packs ordered
vs packs acknowledged. Also re-read the thread for any message from mainlandfloral.ca that
changes the order (out of stock, substitution, "not available in time for Friday",
"ready for Saturday pick-up").

- **EVERYTHING CONFIRMED** = every code we ordered appears on the acknowledgement with the
  same pack count, and no reply contradicts it.
- **Otherwise it is a DISCREPANCY.** List every differing code with ordered vs acknowledged
  vs what the reply says, alert Eduardo, and make NO writes. Partial confirmation is never
  converted silently.

**3. Only if everything is confirmed, convert.**  <-- NEEDS SIGN-OFF, see questions below
Proposed sequence per Mainland product with customer demand on this request:
  a. ensure a `BuyerOrderDetail` exists on the request for that SKU;
  b. `POST order-details/{buyerOrderDetail}/grower-offers` with grower 1053, the acknowledged
     quantity, and our cost — this is what creates real marketplace stock;
  c. `PUT buyer/sub-buyer-orders/details/{detail}/swap` for each customer line, onto that offer;
  d. (if required) `POST pos/sub-buyer-orders/{subBuyerOrder}/approve` per customer order.
Chunk at 50 writes per run call, checkpoint between phases, and verify from the server that
every customer line is confirmed and no line is left half-converted.

**4. Report** in the run summary: order number, acknowledgement timestamp, lines checked,
confirmed vs discrepancy, what was converted per customer, and anything left untouched.

---

## Questions that must be answered before step 3 is enabled

1. **Is there an existing UI flow for this?** The SWAP button plus the empty candidate list
   suggests the intended flow may be "create the offers, then swap", exactly as above — but if
   there is a single button or a closing step that already does the whole conversion, the
   routine should drive that instead of assembling the records itself.
2. **Who creates the `BuyerOrderDetail`?** I found no route for creating one. If they are
   created earlier in the week (or by hand), the routine should attach offers to the existing
   ones and alert when one is missing, rather than create them.
3. **What exactly goes on the GrowerOffer?** `quantity` is in units (packs), not stems — please
   confirm. Price: our Mainland cost per pack, or the customer sell price? In cents.
4. **Does "confirmed orders for the clients" mean an approve call, an email to the customer, or
   both?** If customers get notified, I want that confirmed explicitly before a routine sends
   it unattended.
5. **Partial confirmation:** if Matthew confirms 25 of 27 lines, convert the 25 and alert on 2,
   or convert nothing until you have looked? My default above is convert nothing.
6. **Today (9 Oct):** the Friday run already fired at 8:20am without this step, and order 376580
   is being delivered today. Do you want this applied to 3138 now, by hand, once we agree the
   mechanism?
