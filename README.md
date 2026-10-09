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

### `setup.sh`
Per-container prerequisites, in one idempotent script that always exits 0:

1. links `node_modules` to the `playwright-core` already shipped in the runner image
   (falls back to `npm install`), so `login.mjs` can load;
2. runs `harden-driver.sh` against `/opt/mlb/mlb.mjs`.

The runner container is rebuilt on every run, so this has to happen every time. Add
this ONE line to the environment's setup script (cloud environment menu > Edit >
Setup script):

```sh
sh /home/user/victorias-blossom-automation/setup.sh
```

Until that line is in place, every run where a login has lapsed fails to self-heal
with `Cannot find package 'playwright-core'` and sends an ACTION NEEDED alert instead.

### `package.json` / `package-lock.json`
Declare and pin `playwright-core`, which `login.mjs` needs. `node_modules` is
git-ignored: it is recreated by `setup.sh` at container start.
