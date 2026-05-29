#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-https://zeptrix.io}"
base_url="${base_url%/}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fetch() {
  local path="$1"
  local out="$2"
  curl -fsSL --max-time 20 "$base_url$path" -o "$out"
}

assert_contains() {
  local file="$1"
  local text="$2"
  if ! grep -Fq "$text" "$file"; then
    echo "Expected $file to contain: $text" >&2
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local text="$2"
  if grep -Fq "$text" "$file"; then
    echo "Expected $file not to contain: $text" >&2
    exit 1
  fi
}

fetch "/" "$tmp_dir/home.html"
assert_contains "$tmp_dir/home.html" "<title>Zeptrix | AI AWS Cost Reduction</title>"
assert_contains "$tmp_dir/home.html" 'href="/styles.css"'

fetch "/siteops" "$tmp_dir/siteops.html"
assert_contains "$tmp_dir/siteops.html" '<link rel="canonical" href="https://zeptrix.io/siteops">'
assert_contains "$tmp_dir/siteops.html" "<title>Zeptrix SiteOps | Managed Website Team</title>"
assert_contains "$tmp_dir/siteops.html" 'href="/styles.css"'

fetch "/mbh/" "$tmp_dir/mbh.html"
assert_contains "$tmp_dir/mbh.html" '<html lang="he" dir="rtl">'
assert_contains "$tmp_dir/mbh.html" "052-314-1458"
assert_contains "$tmp_dir/mbh.html" 'href="styles.css"'
assert_not_contains "$tmp_dir/mbh.html" "<title>Zeptrix | AI AWS Cost Reduction</title>"

curl -fsSI --max-time 20 "$base_url/mbh/styles.css" | grep -Fiq "content-type: text/css"
curl -fsSI --max-time 20 "$base_url/mbh/script.js" | grep -Fiq "content-type: application/javascript"

old_location="$(curl -fsSI --max-time 20 "$base_url/wordpress-to-modern-websites/" | awk 'tolower($1) == "location:" {print $2}' | tr -d '\r')"
if [[ "$old_location" != "$base_url/siteops" ]]; then
  echo "Expected old managed-site URL to redirect to $base_url/siteops, got: $old_location" >&2
  exit 1
fi

fast_site_location="$(curl -fsSI --max-time 20 "$base_url/fast-site" | awk 'tolower($1) == "location:" {print $2}' | tr -d '\r')"
if [[ "$fast_site_location" != "$base_url/siteops" ]]; then
  echo "Expected /fast-site to redirect to $base_url/siteops, got: $fast_site_location" >&2
  exit 1
fi

echo "Route verification passed for $base_url"
