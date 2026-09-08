#!/usr/bin/env bash
# Read-only Kudu VFS GET with bounded retry for transient failures.
#
# Contract:
#   stdout : the final HTTP status code (3 digits) when an HTTP response was
#            received — the caller classifies it per context.
#   stderr : KUDU_VFS_* diagnostics distinguishing transport failure,
#            retryable HTTP, true 404, and authorization failure.
#   exit 0 : an HTTP response was received (status on stdout, body at OUT).
#   exit 1 : transport failure persisted after all attempts (fail-closed).
#
# Usage: KUDU_READ_TOKEN=... kudu-vfs-readonly-get.sh <vfs-url> <output-file>
#
# Optional env:
#   KUDU_VFS_MAX_ATTEMPTS   default 4
#   KUDU_VFS_BACKOFF_SECONDS  space-separated per-retry sleeps, default "2 4 8"

set -uo pipefail

URL="${1:?usage: kudu-vfs-readonly-get.sh <vfs-url> <output-file>}"
OUT="${2:?usage: kudu-vfs-readonly-get.sh <vfs-url> <output-file>}"
TOKEN="${KUDU_READ_TOKEN:?KUDU_READ_TOKEN is required}"
MAX_ATTEMPTS="${KUDU_VFS_MAX_ATTEMPTS:-4}"
BACKOFF="${KUDU_VFS_BACKOFF_SECONDS:-2 4 8}"

attempt=0
while [ "$attempt" -lt "$MAX_ATTEMPTS" ]; do
  attempt=$((attempt + 1))
  attempt_file="$(mktemp)"

  # curl transport status is captured separately from the HTTP status.
  # A failing curl must not fall back to a synthesized status code — that
  # conflated transport failure with an HTTP response and produced 000000.
  http_code="$(curl -sS -m 30 -H "Authorization: Bearer ${TOKEN}" "${URL}" -o "$attempt_file" -w '%{http_code}')"
  curl_rc=$?

  if [ "$curl_rc" -ne 0 ]; then
    rm -f "$attempt_file"
    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      sleep_s="$(echo "$BACKOFF" | cut -d' ' -f"$attempt")"
      sleep_s="${sleep_s:-8}"
      echo "KUDU_VFS_TRANSPORT_RETRY=attempt ${attempt}/${MAX_ATTEMPTS} curl_exit=${curl_rc} backoff=${sleep_s}s url=${URL}" >&2
      sleep "$sleep_s"
      continue
    fi
    echo "KUDU_VFS_TRANSPORT_EXHAUSTED=YES" >&2
    echo "KUDU_VFS_READ_ATTEMPTS=${attempt}" >&2
    echo "Kudu VFS read failed at transport level after ${attempt} attempts (curl exit ${curl_rc}): ${URL}. STOP." >&2
    exit 1
  fi

  case "$http_code" in
    408|429|5??)
      if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
        rm -f "$attempt_file"
        sleep_s="$(echo "$BACKOFF" | cut -d' ' -f"$attempt")"
        sleep_s="${sleep_s:-8}"
        echo "KUDU_VFS_TRANSIENT_HTTP_RETRY=attempt ${attempt}/${MAX_ATTEMPTS} http=${http_code} backoff=${sleep_s}s url=${URL}" >&2
        sleep "$sleep_s"
        continue
      fi
      ;;
  esac

  # Final attempt reached — only this attempt's body is preserved.
  mv -f "$attempt_file" "$OUT"
  case "$http_code" in
    404) echo "KUDU_VFS_HTTP_404_CONFIRMED=YES url=${URL}" >&2 ;;
    401|403) echo "KUDU_VFS_AUTH_FAILURE=YES http=${http_code} url=${URL}" >&2 ;;
    408|429|5??) echo "KUDU_VFS_TRANSIENT_HTTP_EXHAUSTED=YES http=${http_code} url=${URL}" >&2 ;;
    2??) : ;;
    *) echo "KUDU_VFS_UNEXPECTED_HTTP=${http_code} url=${URL}" >&2 ;;
  esac
  echo "KUDU_VFS_READ_ATTEMPTS=${attempt}" >&2
  printf '%s' "$http_code"
  exit 0
done
