#!/bin/sh
# Per-container setup for the Mainland plant purchases routine.
#
# The runner container is rebuilt from the environment setup script on every run,
# so both of these steps have to happen again each time. Add ONE line to the
# environment setup script:
#
#     sh /home/user/victorias-blossom-automation/setup.sh
#
# Idempotent: safe to run repeatedly, and never fails the run.

set -u

REPO="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# 1. Dependencies for login.mjs.
#
# login.mjs imports playwright-core. The setup script does not run `npm install`,
# so without this the working directory has no node_modules and login.mjs dies with
# "Cannot find package 'playwright-core'" - which silently disables self-login and
# turns every expired Mainland login into a manual sign-in.
#
# playwright-core already ships in the image, so link it rather than downloading it.
if [ -d /opt/node-tools/node_modules ]; then
    ln -sfn /opt/node-tools/node_modules "$REPO/node_modules"
    echo "setup: linked node_modules -> /opt/node-tools/node_modules"
else
    echo "setup: WARNING /opt/node-tools/node_modules is missing; trying npm install"
    (cd "$REPO" && npm install --no-audit --no-fund) \
        || echo "setup: WARNING npm install failed - self-login will not work this run"
fi

# 2. Driver hardening (optional, never blocking).
#
# Adds try/finally socket release, a loud reminder that stop still has to run after a
# failure, and the `cookies [domain]` command used to check remember-me longevity.
if [ -f "$REPO/harden-driver.sh" ] && [ -f /opt/mlb/mlb.mjs ]; then
    sh "$REPO/harden-driver.sh" /opt/mlb/mlb.mjs \
        || echo "setup: harden skipped - continuing with stock driver"
else
    echo "setup: harden skipped - harden-driver.sh or /opt/mlb/mlb.mjs not found"
fi

echo "setup: done"
exit 0
