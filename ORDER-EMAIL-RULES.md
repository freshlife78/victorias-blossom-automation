# Order email rules — Mainland plant purchases

Replacement text for the **MODE ORDERS** section of the "Mainland plant purchases"
routine, plus the incident that made it necessary.

Paste the block under [Drop-in replacement](#drop-in-replacement) into the routine
prompt in place of the existing MODE ORDERS section. The rules also apply to the
ORDERS steps that MODE CLOSE runs on Thursday.

---

## Why this exists — incident 30 Sep / 1 Oct 2026

The routine emailed Mainland Floral an order for plants that no customer had placed.
Mainland acknowledged it, built the Friday truck from it, and almost none of the real
order was on board.

Each order email audited against what was actually on request 3135 at the moment it
was sent:

| Email sent (Pacific)  | Actually on the request | Email claimed      | Verdict             |
| --------------------- | ----------------------- | ------------------ | ------------------- |
| Wed 30 Sep 12:19pm    | 0 lines, 0 plants       | 11 codes, 134      | invented 134        |
| Wed 30 Sep 12:22pm    | 0 lines, 0 plants       | 11 codes, 134      | invented 134        |
| Thu 1 Oct 12:15pm     | 8 lines, 78 plants      | 15 codes, 137      | overstated by 59    |
| Thu 1 Oct 3:12pm      | 31 lines, 287 plants    | 30 codes, 287      | correct             |

The first genuine plant order on that delivery was placed **Wed 30 Sep 12:29pm** —
seven minutes after the second Wednesday email went out. The "Ordered Tue 29 Sep"
dates in that email were invented along with the lines.

Thursday noon then carried 59 of the phantom plants forward and added the 8 real ones
(78 + 59 = the 137 it claimed). Those 59 were the seven items the Thursday 3pm email
went on to ask Mainland to "hold, do not cancel" — followed by a promise of a
confirming email that evening, which no run was scheduled to send and none did.

Consequences: acknowledgement 376175 carried 134 plants nobody ordered and omitted
286 of the 287 that were real, across nine flower shops.

Only the Thursday 3pm run read the live data correctly.

## The four failures to design against

1. Composing an order email without reading the live request.
2. Carrying content from a previous email into a later one instead of re-deriving it.
3. Reporting totals that were never reconciled against the source rows.
4. Promising a supplier an action the routine had no run scheduled to perform.

---

## Drop-in replacement

```text
MODE ORDERS (Monday to Thursday 12pm) — forward the CLOSEST request's orders to Matthew

THE ORDER EMAIL MAY CONTAIN ONLY WHAT THE SERVER RETURNED IN THIS RUN.
On 30 Sep and 1 Oct 2026 this routine emailed Mainland 134 plants that no customer had
ordered, then 59 more, because the email was composed without reading the live request.
Mainland packed the wrong truck for nine shops. The rules below make that impossible.
None of them may be skipped to save time, and none may be satisfied from memory.

1. FETCH (SALES context). GET
   https://victoriasblossom.net/buyer/orders/{closestRequestId}/swappable-details
   and read props.subBuyerOrderDetails.data (up to 500 lines). Each line carries
   quantity, created_at, grower_id, product (id, name, subcategory), parameterCard
   (id, unit), subBuyerOrder.subBuyer and the sub-buyer reference VIC-xxxxxxx.
   Keep only lines with grower_id 1053.
   Save the raw fetched JSON to the Drive ledger folder as
   orders_{requestId}_{YYYY-MM-DD_HHmm}.json BEFORE composing anything. That file is
   the audit trail and is what makes a bad run reconstructable afterwards.
   If the page lands on /login, the fetch errors, or props.subBuyerOrderDetails is
   absent: send NOTHING to Mainland, alert Eduardo, stop. Never substitute anything
   remembered, inferred, or carried over from an earlier run or email.

2. ZERO IS A VALID ANSWER. If the fetch succeeds and returns no grower-1053 lines,
   there is no order. Send NOTHING to Mainland and say so in the run summary. An empty
   delivery early in the week is normal and is never a reason to reach for an earlier
   list.

3. EVERY ROW MUST TRACE TO A FETCHED RECORD. Build the table by iterating the fetched
   rows and nothing else. Each row carries values taken verbatim from its record: the
   VIC-xxxxxxx reference, the Mainland code, the Mainland name, packs (= quantity),
   total units (= quantity x pack size) and the Pacific date from that record's
   created_at. If you cannot point at the fetched record a row came from, that row does
   not go in the email. Never invent, estimate or recall a line, a quantity or an order
   date.

4. REBUILD FROM SCRATCH EVERY RUN. Never carry a line, quantity, code or date forward
   from a previous email, a previous run, the ledger, or the conversation. The previous
   email is read only to decide whether anything changed (rule 7) — never as a source
   of content.

5. MAPPING. Map each line to its Mainland code through the ledger by
   product_id + parameter_card_id ONLY. If that lookup fails, do not guess from the
   name or subcategory: list the line under "Unmapped" with its VIC reference and
   product id, and alert Eduardo. A near-match by name is how 6" Potmum becomes
   4" Potmum and 8" HB Philo becomes 10" HB Philo.

6. RECONCILE BEFORE SENDING. Recompute from the fetched rows: lines kept, distinct
   codes, total packs, total units. Compare against the table about to be sent. If any
   figure differs, do not send — alert Eduardo with both sets of figures and stop.
   Print the verified counts at the top of the email:
   "Built from N order lines on request {id}, fetched {time} Pacific: N codes,
   N packs, N plants."

7. DUPLICATE GUARD. Before sending, Gmail search_threads
   {query:"in:sent to:operations@mainlandfloral.ca subject:(plant order delivery)
   newer_than:14d"}, keep the threads whose subject carries this delivery date, and
   read the latest with get_thread (PLAIN_TEXT). If the recomputed totals are identical
   to that email's, send NOTHING. If an order email for this delivery was sent less
   than 30 minutes ago, send NOTHING and note it in the run summary — the run has
   fired twice. (On 30 Sep two identical emails went out three minutes apart.)

8. SEND. Gmail send_message to operations@mainlandfloral.ca. Subject:
   "Victoria's Blossom plant order - delivery <deliver date> - running total as of
   <weekday time>". First sentence: this list is the COMPLETE total for that delivery
   so far and REPLACES any earlier email, not an addition. Then the verified counts
   from rule 6, the lines table, the totals table per Mainland code, and a request to
   reply to confirm. Mark lines NEW by comparing codes against the previous email —
   the content of every line still comes from this run's fetch. No customer names.
   Send as a new message, not a reply. Also pass a plain-text body.

9. NEVER PROMISE WHAT THE ROUTINE WILL NOT DO. Do not ask Mainland to hold items and
   do not promise a later email. If something was on an earlier email but is not in
   this run's fetch, say plainly that it is no longer on the order — the fetch is the
   source of truth. The routine has no evening run and cannot keep such a promise.
```

## Also change

In **SAFETY RULES**, add:

```text
- Never send Mainland a line that is not in the current run's fetch of
  /buyer/orders/{requestId}/swappable-details. No order email is ever composed from
  memory, from a previous email, or from the ledger. The ledger maps codes to products;
  it is never evidence that an order exists.
```

In **MODE CLOSE**, the ORDERS steps it runs are bound by every rule above, including
the reconcile gate and the ban on hold instructions and promised follow-ups.

## Verifying a past run

The saved `orders_{requestId}_{timestamp}.json` files make the audit above repeatable:
filter to `grower_id == 1053`, compare each line's `created_at` against the send time of
the email, and any line claimed before its order existed is fabricated.
