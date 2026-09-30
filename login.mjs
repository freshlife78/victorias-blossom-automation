#!/usr/bin/env node
/**
 * login.mjs - self-login for the "Mainland plant purchases" routine.
 *
 *   node login.mjs mainland
 *   node login.mjs backoffice --role admin
 *   node login.mjs backoffice --role sales
 *
 * Signs in inside a Browserbase session on the correct saved context, ticks
 * remember-me where the site offers it, verifies the result, and releases the
 * session cleanly so the cookies are written back to the context.
 *
 * CREDENTIAL HANDLING - the point of this file
 *   Secrets are read from 1Password (Service Account) or from env vars, and go
 *   straight into Playwright's locator.fill(). They are never printed, never
 *   put in argv, never written to disk, and never returned to the caller, so
 *   they do not pass through the model or the run transcript. Debug env that
 *   would make Playwright echo call arguments is deleted before Playwright is
 *   imported, and anything this script prints is passed through redact().
 *
 *   Session recording is deliberately left at the project default. Password
 *   inputs are type=password so they render masked in a replay. Turning
 *   recording off is an audit decision for the account owner, not for this
 *   script, and it is set at the Browserbase project level.
 *
 * EXIT CODES  0 ok | 2 usage/config | 3 credentials | 4 login failed | 5 verify failed
 */

// Delete anything that would make Playwright log call arguments (which include
// fill() text). Must happen BEFORE playwright-core is imported.
for (const k of ['DEBUG', 'PWDEBUG', 'PLAYWRIGHT_DEBUG', 'PLAYWRIGHT_LOG', 'VERBOSE']) delete process.env[k];

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

const API = 'https://api.browserbase.com/v1';
const KEY = process.env.BROWSERBASE_API_KEY;
const PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || 'f61bf67f-9636-4c96-8016-4680891d4615';
const STATE = process.env.MLB_STATE || '/tmp/mlb-state.json';

const CONTEXTS = {
  admin: 'd214a757-48a0-403e-a99c-c1653d04f1f7',
  sales: 'b8738a88-b99d-49d3-a16f-37823ea6891c',
};

const die = (code, msg) => { console.error('login: ' + msg); process.exit(code); };

/* ---------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const target = argv[0];
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes('--' + name);

if (!['mainland', 'backoffice'].includes(target)) {
  console.error('usage: node login.mjs <mainland|backoffice> [--role admin|sales] [--dry-run] [--force] [--timeout <s>]');
  process.exit(2);
}
const roleFlag = flag('role', null);
if (target === 'mainland' && roleFlag && roleFlag !== 'admin') {
  die(2, 'mainland always lives on the ADMIN context; drop --role');
}
const role = target === 'mainland' ? 'admin' : (roleFlag || 'admin');
if (!CONTEXTS[role]) die(2, `unknown --role "${roleFlag}" (expected admin or sales)`);
if (!KEY) die(2, 'BROWSERBASE_API_KEY is not set');

const CONTEXT_ID = CONTEXTS[role];
const NAV_TIMEOUT = Number(flag('timeout', 60)) * 1000;

/* -------------------------------------------------------------- credentials */

/** Replace secret values with a marker in anything we are about to print. */
let SECRETS = [];
const redact = (s) => {
  let out = String(s);
  for (const v of SECRETS) if (v && v.length > 3) out = out.split(v).join('[redacted]');
  return out;
};

const opRead = (ref) => new Promise((res, rej) => {
  // execFile, not a shell: the reference goes in argv (not secret), the secret
  // comes back on stdout and is never echoed.
  execFile('op', ['read', '--no-newline', ref], { timeout: 30000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
    if (err) return rej(new Error(`op read failed for ${ref}: ${String(stderr || err.message).trim().slice(0, 200)}`));
    const v = String(stdout).trim();
    if (!v) return rej(new Error(`op read returned nothing for ${ref}`));
    res(v);
  });
});

const opAvailable = () => new Promise((res) => execFile('op', ['--version'], (e) => res(!e)));

/**
 * Resolve {user, pass} for the target. Env vars win (useful for a one-off or
 * where 1Password is not reachable); otherwise 1Password Service Account.
 */
async function credentials() {
  const spec = {
    mainland:  { userEnv: 'MAINLAND_USERNAME', passEnv: 'MAINLAND_PASSWORD',
                 item: process.env.OP_MAINLAND_ITEM || 'Mainland Floral',
                 refUser: process.env.OP_REF_MAINLAND_USERNAME, refPass: process.env.OP_REF_MAINLAND_PASSWORD },
    admin:     { userEnv: 'VB_ADMIN_EMAIL', passEnv: 'VB_ADMIN_PASSWORD',
                 item: process.env.OP_VB_ADMIN_ITEM || 'Victorias Blossom Backoffice admin',
                 refUser: process.env.OP_REF_VB_ADMIN_EMAIL, refPass: process.env.OP_REF_VB_ADMIN_PASSWORD },
    sales:     { userEnv: 'VB_SALES_EMAIL', passEnv: 'VB_SALES_PASSWORD',
                 item: process.env.OP_VB_SALES_ITEM || 'Victorias Blossom Backoffice sales',
                 refUser: process.env.OP_REF_VB_SALES_EMAIL, refPass: process.env.OP_REF_VB_SALES_PASSWORD },
  }[target === 'mainland' ? 'mainland' : role];

  if (process.env[spec.userEnv] && process.env[spec.passEnv]) {
    console.log(`credentials: from env (${spec.userEnv} / ${spec.passEnv})`);
    return { user: process.env[spec.userEnv], pass: process.env[spec.passEnv], source: 'env' };
  }

  if (!process.env.OP_SERVICE_ACCOUNT_TOKEN) {
    die(3, `no credentials. Set ${spec.userEnv} and ${spec.passEnv}, or set OP_SERVICE_ACCOUNT_TOKEN for 1Password.`);
  }
  if (!(await opAvailable())) {
    die(3, 'OP_SERVICE_ACCOUNT_TOKEN is set but the `op` CLI is not installed (see setup script notes).');
  }

  const vault = process.env.OP_VAULT || 'Automation';
  const refUser = spec.refUser || `op://${vault}/${spec.item}/username`;
  const refPass = spec.refPass || `op://${vault}/${spec.item}/password`;
  console.log(`credentials: from 1Password (${refUser.replace(/\/[^/]*$/, '/…')})`);
  try {
    const [user, pass] = await Promise.all([opRead(refUser), opRead(refPass)]);
    return { user, pass, source: '1password' };
  } catch (e) {
    die(3, redact(e.message));
  }
}

/* ------------------------------------------------------- browserbase session */

const api = async (path, opts = {}) => {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'X-BB-API-Key': KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

/* --------------------------------------------------------------- per-target */

const TARGETS = {
  mainland: {
    loginUrl: 'https://mainlandfloral.com/user/login',
    verifyUrl: 'https://mainlandfloral.com/',
    form: 'form[action*="/user/login"]',
    user: 'input[name="login_username"]',
    pass: 'input[name="login_password"]',
    submit: 'button[name="send"]',
    remember: null,        // Mainland's form offers no remember-me checkbox
    async verify(page) {
      const text = await page.locator('body').innerText();
      const account = /24077|VICTORIA'?S BLOSSOM/i.test(text);
      const logout = await page.locator('a', { hasText: /^\s*log\s?out\s*$/i }).count() > 0;
      const guest = /Welcome\s+Guest/i.test(text);
      return { ok: account && logout && !guest, detail: `account=${account} logout=${logout} guest=${guest}` };
    },
  },
  backoffice: {
    loginUrl: 'https://victoriasblossom.net/login',
    verifyUrl: 'https://victoriasblossom.net/buyer/orders',
    form: 'form',
    user: '#email',
    pass: '#password',
    submit: 'button[type="submit"]',
    remember: 'input[name="remember"]',
    async verify(page) {
      const url = page.url();
      const onLogin = /\/login/.test(url);
      return { ok: !onLogin, detail: `landed on ${url}` };
    },
  },
}[target];

/* -------------------------------------------------------------------- main */

// Refuse to run beside the routine's own session: two sessions on one context
// can clobber each other's cookies on save.
try {
  await access(STATE);
  if (!has('force')) {
    die(2, `an active driver session exists (${STATE}). Run \`mlb.mjs stop\` first, or pass --force.`);
  }
  console.log('login: WARNING --force given with an active driver session; cookies may clobber');
} catch { /* no state file: good */ }

const DRY = has('dry-run');
const creds = DRY ? { user: '', pass: '', source: 'dry-run' } : await credentials();
SECRETS = creds.pass ? [creds.pass] : [];
if (DRY) console.log('login: DRY RUN - selectors are checked, nothing is typed and nothing is submitted');

let session, browser, exitCode = 0;
try {
  session = await api('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      projectId: PROJECT_ID,
      keepAlive: true,
      timeout: Number(process.env.MLB_SESSION_TIMEOUT || 3600),
      browserSettings: { context: { id: CONTEXT_ID, persist: true } },
    }),
  });
  console.log(`session   ${session.id}`);
  console.log(`replay    https://www.browserbase.com/sessions/${session.id}`);
  console.log(`context   ${role.toUpperCase()} ${CONTEXT_ID}`);

  const { chromium } = await import('playwright-core');
  browser = await chromium.connectOverCDP(session.connectUrl, { timeout: NAV_TIMEOUT });
  const ctx = browser.contexts()[0] ?? await browser.newContext();
  const page = ctx.pages()[0] ?? await ctx.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);

  // Already signed in? Then do nothing - re-submitting a form needlessly is
  // how you trip rate limits and lockouts.
  await page.goto(TARGETS.verifyUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  const pre = await TARGETS.verify(page);
  if (pre.ok) {
    console.log(`login: already signed in (${pre.detail}) - nothing to do`);
  } else {
    await page.goto(TARGETS.loginUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    const form = page.locator(TARGETS.form).filter({ has: page.locator(TARGETS.pass) }).first();
    await form.locator(TARGETS.user).waitFor({ state: 'visible', timeout: NAV_TIMEOUT });

    if (DRY) {
      console.log(`dry-run:  form matched          ${await form.count()}`);
      console.log(`dry-run:  username field        ${await form.locator(TARGETS.user).count()}`);
      console.log(`dry-run:  password field        ${await form.locator(TARGETS.pass).count()}`);
      console.log(`dry-run:  submit button         ${await form.locator(TARGETS.submit).count()}`);
      console.log(`dry-run:  remember-me checkbox  ${TARGETS.remember ? await form.locator(TARGETS.remember).count() : 'n/a (site has none)'}`);
      console.log('dry-run:  not submitting');
    } else {
    // The two lines where the secret is used. Values go straight from the
    // credential source into the page; nothing is logged or returned.
    await form.locator(TARGETS.user).fill(creds.user);
    await form.locator(TARGETS.pass).fill(creds.pass);

    if (TARGETS.remember) {
      const box = form.locator(TARGETS.remember);
      if (await box.count()) {
        await box.first().check();
        console.log('login: remember-me ticked');
      } else {
        console.log('login: WARNING remember-me checkbox not found where expected');
      }
    } else {
      console.log('login: this site offers no remember-me checkbox; its session is server-limited');
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {}),
      form.locator(TARGETS.submit).first().click(),
    ]);
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});

    await page.goto(TARGETS.verifyUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    const post = await TARGETS.verify(page);
    if (!post.ok) {
      console.error(`login: FAILED verification after submit (${post.detail})`);
      exitCode = 5;
    } else {
      console.log(`login: OK (${post.detail})`);
    }
    }
  }

  // Cookie longevity report - names and expiries only, never values.
  const host = new URL(TARGETS.verifyUrl).hostname.replace(/^www\./, '');
  const cookies = (await ctx.cookies()).filter(c => (c.domain || '').includes(host.split('.').slice(-2).join('.')));
  const now = Date.now() / 1000;
  let longest = 0;
  for (const c of cookies) {
    const days = c.expires > 0 ? (c.expires - now) / 86400 : null;
    if (days && days > longest) longest = days;
    console.log(`cookie    ${days === null ? 'session   ' : days.toFixed(1).padStart(8) + 'd'}  ${c.domain}  ${c.name}`);
  }
  console.log(longest > 7
    ? `cookies:  PERSISTS_OK (longest ${longest.toFixed(1)} days)`
    : `cookies:  SHORT_LIVED (longest ${longest ? longest.toFixed(1) + ' days' : 'session-only'}) - expect to sign in again soon`);

} catch (e) {
  console.error('login: ERROR ' + redact(e && e.message ? e.message : String(e)));
  exitCode = exitCode || 4;
} finally {
  // Close the CDP connection, then RELEASE. Only a clean release saves the
  // context cookies, so this must happen on every path.
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  if (session) {
    try {
      await api(`/sessions/${session.id}`, {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT_ID, status: 'REQUEST_RELEASE' }),
      });
      console.log(`released  ${session.id}`);
    } catch (e) {
      console.error('login: WARNING could not release session: ' + redact(e.message));
      console.error('login: cookies may not have been saved - check before relying on this login');
      exitCode = exitCode || 4;
    }
  }
  SECRETS = [];
  process.exit(exitCode);
}
