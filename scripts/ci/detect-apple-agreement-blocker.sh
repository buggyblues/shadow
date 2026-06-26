#!/usr/bin/env bash
set -euo pipefail

log_file="${1:?Usage: detect-apple-agreement-blocker.sh <log-file>}"

grep -Eiq \
  '(required agreement is missing|required agreement[^[:cntrl:]]*expired|in-effect agreement|agreement[^[:cntrl:]]*(missing|expired|signed)|legal agreements[^[:cntrl:]]*(signed|expired)|Sign the agreement)' \
  "$log_file"
