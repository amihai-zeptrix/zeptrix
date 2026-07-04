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

assert_content_type() {
  local path="$1"
  shift
  local headers
  headers="$(curl -fsSI --max-time 20 "$base_url$path")"

  local content_type
  content_type="$(printf "%s" "$headers" | awk 'tolower($1) == "content-type:" {print tolower($2)}' | tr -d '\r' | cut -d ';' -f 1)"

  for expected in "$@"; do
    if [[ "$content_type" == "$expected" ]]; then
      return 0
    fi
  done

  echo "Expected $path to have one of these content types: $*. Got: $content_type" >&2
  exit 1
}

fetch "/" "$tmp_dir/home.html"
assert_contains "$tmp_dir/home.html" "<title>Zeptrix | AI AWS Cost Reduction</title>"
assert_contains "$tmp_dir/home.html" 'href="/styles.css"'

fetch "/siteops" "$tmp_dir/siteops.html"
assert_contains "$tmp_dir/siteops.html" '<link rel="canonical" href="https://zeptrix.io/siteops">'
assert_contains "$tmp_dir/siteops.html" "<title>Zeptrix SiteOps | Modern Website Hosting and WordPress Care</title>"
assert_contains "$tmp_dir/siteops.html" 'href="/styles.css"'
assert_contains "$tmp_dir/siteops.html" "Join this month, evaluate for free"

fetch "/ai-power-site" "$tmp_dir/ai-power-site.html"
assert_contains "$tmp_dir/ai-power-site.html" '<link rel="canonical" href="https://zeptrix.io/ai-power-site">'
assert_contains "$tmp_dir/ai-power-site.html" "<title>Zeptrix AI Power Site | Managed Website Modernization for Wix Customers</title>"
assert_contains "$tmp_dir/ai-power-site.html" 'href="/styles.css"'
assert_contains "$tmp_dir/ai-power-site.html" "For Wix-powered websites"

fetch "/privacy" "$tmp_dir/privacy.html"
assert_contains "$tmp_dir/privacy.html" '<link rel="canonical" href="https://zeptrix.io/privacy">'
assert_contains "$tmp_dir/privacy.html" "<title>Zeptrix Privacy Policy</title>"
assert_contains "$tmp_dir/privacy.html" "Google User Data"

fetch "/terms" "$tmp_dir/terms.html"
assert_contains "$tmp_dir/terms.html" '<link rel="canonical" href="https://zeptrix.io/terms">'
assert_contains "$tmp_dir/terms.html" "<title>Zeptrix Terms of Service</title>"
assert_contains "$tmp_dir/terms.html" "Integrations"

fetch "/mbh/" "$tmp_dir/mbh.html"
assert_contains "$tmp_dir/mbh.html" '<html lang="he" dir="rtl">'
assert_contains "$tmp_dir/mbh.html" "052-314-1458"
assert_contains "$tmp_dir/mbh.html" 'href="styles.css"'
assert_not_contains "$tmp_dir/mbh.html" "<title>Zeptrix | AI AWS Cost Reduction</title>"

fetch "/internal-crm/" "$tmp_dir/internal-crm.html"
assert_contains "$tmp_dir/internal-crm.html" "<title>Zeptrix CRM</title>"
assert_contains "$tmp_dir/internal-crm.html" '<div id="root"></div>'

fetch "/your-new-crm/" "$tmp_dir/your-new-crm.html"
assert_contains "$tmp_dir/your-new-crm.html" "<title>Zeptrix CRM | Sales Pipeline</title>"
assert_contains "$tmp_dir/your-new-crm.html" '<div id="app"></div>'
assert_contains "$tmp_dir/your-new-crm.html" 'href="./styles.css"'
assert_contains "$tmp_dir/your-new-crm.html" 'src="./app.js"'

fetch "/your-new-crm.html" "$tmp_dir/your-new-crm-promo.html"
assert_contains "$tmp_dir/your-new-crm-promo.html" "<title>Zeptrix CRM | A Sales Workspace That Drives Action</title>"
assert_contains "$tmp_dir/your-new-crm-promo.html" 'href="/your-new-crm/"'

fetch "/cloudprune/" "$tmp_dir/cloudprune.html"
assert_contains "$tmp_dir/cloudprune.html" "<title>CloudPrune | Cloud Cost Workspace</title>"
assert_contains "$tmp_dir/cloudprune.html" '<div id="app"></div>'
assert_contains "$tmp_dir/cloudprune.html" 'href="/cloudprune/styles.css"'
assert_contains "$tmp_dir/cloudprune.html" 'src="/cloudprune/app.js"'

fetch "/cloudprune/demo" "$tmp_dir/cloudprune-demo.html"
assert_contains "$tmp_dir/cloudprune-demo.html" "<title>CloudPrune | Cloud Cost Workspace</title>"
assert_contains "$tmp_dir/cloudprune-demo.html" '<div id="app"></div>'
assert_contains "$tmp_dir/cloudprune-demo.html" 'href="/cloudprune/styles.css"'

fetch "/cloudprune/resources/" "$tmp_dir/cloudprune-resources.html"
assert_contains "$tmp_dir/cloudprune-resources.html" "<title>CloudPrune AWS Cost Resources</title>"
assert_contains "$tmp_dir/cloudprune-resources.html" 'resourceSlug":"cloudprune-resources"'
assert_contains "$tmp_dir/cloudprune-resources.html" 'data-resource-cta href="/cloudprune/"'

fetch "/cloudprune/resources/unattached-ebs-volumes-still-cost-money-how-to-find-and-safely-remove-them" "$tmp_dir/cloudprune-resource-ebs.html"
assert_contains "$tmp_dir/cloudprune-resource-ebs.html" "<title>Unattached EBS Volumes Cost Money | CloudPrune</title>"
assert_contains "$tmp_dir/cloudprune-resource-ebs.html" "<h1>Unattached EBS Volumes Still Cost Money: How to Find and Safely Remove Them</h1>"
assert_contains "$tmp_dir/cloudprune-resource-ebs.html" 'resource_page_view'
assert_contains "$tmp_dir/cloudprune-resource-ebs.html" 'resource_cta_click'

fetch "/cp/" "$tmp_dir/cp.html"
assert_contains "$tmp_dir/cp.html" "<title>CloudPrune | Cloud Cost Workspace</title>"
assert_contains "$tmp_dir/cp.html" '<div id="app"></div>'
assert_contains "$tmp_dir/cp.html" 'href="/cloudprune/styles.css"'

fetch "/cp/demo" "$tmp_dir/cp-demo.html"
assert_contains "$tmp_dir/cp-demo.html" "<title>CloudPrune | Cloud Cost Workspace</title>"
assert_contains "$tmp_dir/cp-demo.html" '<div id="app"></div>'

assert_content_type "/mbh/styles.css" "text/css"
assert_content_type "/mbh/script.js" "application/javascript" "text/javascript"
assert_content_type "/your-new-crm/styles.css" "text/css"
assert_content_type "/your-new-crm/app.js" "application/javascript" "text/javascript"
assert_content_type "/cloudprune/styles.css" "text/css"
assert_content_type "/cloudprune/app.js" "application/javascript" "text/javascript"
assert_content_type "/cp/app.js" "application/javascript" "text/javascript"

fetch "/sitemap.xml" "$tmp_dir/sitemap.xml"
assert_contains "$tmp_dir/sitemap.xml" "https://zeptrix.io/cloudprune/resources/"
assert_contains "$tmp_dir/sitemap.xml" "https://zeptrix.io/cloudprune/resources/unattached-ebs-volumes-still-cost-money-how-to-find-and-safely-remove-them"

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
