#!/bin/sh
# Harden /opt/mlb/mlb.mjs in place. Idempotent - safe to run at the start of every run.
# The container is rebuilt from the environment setup script each session, so the driver
# arrives unpatched every time and this re-applies the three fixes.
#   1. session cap 1500s -> 3600s  (25 min reaped long REVIEW runs before a clean release)
#   2. `run` wraps the batch module in try/finally so the CDP socket always closes, and any
#      failure prints a loud reminder that `stop` still has to run (only a clean release
#      saves the context login cookies)
#   3. new `cookies [domain]` command - lists cookie expiries via CDP, so a sign-in can be
#      checked for a long-lived remember-me cookie. HttpOnly cookies are invisible to
#      document.cookie, so this cannot be done from inside the page.
set -e
DRV="${1:-/opt/mlb/mlb.mjs}"
[ -f "$DRV" ] || { echo "harden: $DRV not found"; exit 1; }

python3 - "$DRV" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
orig = s

if "MLB_SESSION_TIMEOUT || 1500" in s:
    s = s.replace("MLB_SESSION_TIMEOUT || 1500", "MLB_SESSION_TIMEOUT || 3600")

old_run = """    const out = await mod.default({ open, js, log: (...a) => console.log(...a) });
    if (out !== undefined) print(out);
    cdp.close();
"""
new_run = """    // Session is deliberately left ALIVE on failure: keepAlive means a later
    // `stop` can still release it cleanly, the only path that saves the cookies.
    try {
      const out = await mod.default({ open, js, log: (...a) => console.log(...a) });
      if (out !== undefined) print(out);
    } finally {
      cdp.close();
    }
"""
if old_run in s:
    s = s.replace(old_run, new_run)

if "cmd === 'cookies'" not in s:
    anchor = "  } else if (cmd === 'url') {"
    cookies = """  } else if (cmd === 'cookies') {
    const filter = (args[0] || '').toLowerCase();
    const { cdp, sessionId } = await attach();
    const { cookies } = await cdp.send('Network.getAllCookies', {}, sessionId);
    const now = Date.now() / 1000;
    const rows = cookies
      .filter(c => !filter || (c.domain || '').toLowerCase().includes(filter))
      .map(c => {
        const persistent = typeof c.expires === 'number' && c.expires > 0;
        return { name: c.name, domain: c.domain, persistent,
                 days: persistent ? (c.expires - now) / 86400 : null, httpOnly: !!c.httpOnly };
      })
      .sort((a, b) => (b.days || -1) - (a.days || -1));
    for (const r of rows) {
      console.log([
        r.persistent ? 'PERSISTENT' : 'session   ',
        r.persistent ? (r.days >= 0 ? r.days.toFixed(1).padStart(8) + 'd' : ' EXPIRED ') : '         -',
        r.httpOnly ? 'httpOnly' : '        ', r.domain, r.name,
      ].join('  '));
    }
    const longest = rows.filter(r => r.persistent && r.days > 7).length;
    console.log(`\\ntotal ${rows.length} cookie(s); ${longest} persistent beyond 7 days`);
    console.log(longest ? 'PERSISTS_OK'
      : 'NO_LONG_LIVED_COOKIE - this sign-in will not survive; tick "Remember me"');
    cdp.close();

  } else if (cmd === 'url') {"""
    if anchor in s:
        s = s.replace(anchor, cookies, 1)

s = s.replace("run <file> | url | stop", "run <file> | cookies [domain] | url | stop")

old_catch = """} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exit(1);
}"""
new_catch = """} catch (e) {
  console.error('ERROR: ' + e.message);
  if (cmd !== 'stop') {
    console.error('WARNING: the Browserbase session may still be ACTIVE. Run `mlb.mjs stop`');
    console.error('         before anything else - a session reaped by timeout instead of');
    console.error('         released does not reliably save the context login cookies.');
  }
  process.exit(1);
}"""
if old_catch in s:
    s = s.replace(old_catch, new_catch)

if s != orig:
    open(p, 'w').write(s)
    print("harden: patched " + p)
else:
    print("harden: already patched, nothing to do")
PY

node --check "$DRV" || { echo "harden: FAILED syntax check - driver left unusable, stop and alert"; exit 1; }
echo "harden: syntax OK"
