# victorias-blossom-automation

Support files for the "Mainland plant purchases" routine.

## Files

### `login.mjs`
Self-login for mainlandfloral.com and the victoriasblossom.net backoffice.

```sh
node login.mjs mainland
node login.mjs backoffice --role admin|sales
```

Add `--dry-run` to check the form selectors without typing or submitting anything.

Credentials come from environment variables (`MAINLAND_USERNAME`/`MAINLAND_PASSWORD`,
`VB_ADMIN_EMAIL`/`VB_ADMIN_PASSWORD`, `VB_SALES_EMAIL`/`VB_SALES_PASSWORD`) or from
1Password via `OP_SERVICE_ACCOUNT_TOKEN`. They go straight into Playwright's `fill()` and are
never logged. The Browserbase API key is read from `BROWSERBASE_API_KEY` at runtime.

### `harden-driver.sh`
Patches `/opt/mlb/mlb.mjs` in place: raises the Browserbase session cap to 3600s, always closes
the CDP socket on failure, and adds a `cookies` command.

```sh
sh harden-driver.sh /opt/mlb/mlb.mjs
```

### `package.json`
Declares `playwright-core`, which `login.mjs` needs.

## Mainland scrape: three selectors that do not match the live DOM

Use `scrape.mjs` (`node /opt/mlb/mlb.mjs run scrape.mjs`) rather than re-deriving the
scrape from the routine text. Re-confirmed against the live category page on
6 Oct 2026, measured over the first 100 tiles:

| Field | Routine text says | What the DOM does | Cost of getting it wrong |
|---|---|---|---|
| unit cost | "text containing CA$" | `<span class="product_pricetag">CA$</span>3.14` splits symbol from digits, so no leaf node holds both. Spec selector matched **0/100**; `.price-box` / `.regular-price` matched **100/100**. | All costs null, price gate trips, run halts for no reason |
| photo | read `img src` | Tiles lazy-load: **90/100** had `src=/assets/images/defaults/ajax-loader.gif` with the real URL in `data-src`. **14/100** placeholder items looked photographed. | Publishes Mainland's placeholder logo onto live listings |
| code | `.item-code` first text node | `.item-code` also holds the pack-size span, so `textContent` yields `"1-02-124  Pack Size: 20"` | Every code mismatches the ledger; whole catalogue looks new |

The code row is the routine text being *right* and easy to implement wrongly — it
explicitly says "first text node", and using `textContent` instead breaks every
ledger lookup. `scrape.mjs` takes the first text node and strips both the `Code:`
label and any trailing pack-size text.

Validated end to end: 224/224 items across 3 pages, 224 costs, 194 photos,
30 placeholders, all codes matching `N-NN-NNN`, no duplicates.
