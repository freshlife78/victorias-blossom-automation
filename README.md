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
