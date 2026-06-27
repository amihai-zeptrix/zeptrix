#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

fail() {
  echo "Test failed: $*" >&2
  exit 1
}

assert_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing required file: $file"
}

assert_contains() {
  local file="$1"
  local text="$2"
  grep -Fq "$text" "$file" || fail "$file does not contain: $text"
}

assert_not_exists() {
  local path="$1"
  [[ ! -e "$path" ]] || fail "unexpected legacy path exists: $path"
}

assert_file index.html
assert_file siteops.html
assert_file ai-power-site.html
assert_file privacy.html
assert_file terms.html
assert_file styles.css
assert_file app.js
assert_file assets/wordpress-logotype-wmark.png
assert_file nginx-zeptrix.conf
assert_file scripts/verify-routes.sh

assert_file mbh/index.html
assert_file mbh/styles.css
assert_file mbh/script.js
assert_file mbh/assets/profile.jpg
assert_file mbh/assets/portrait.jpg

assert_file your-new-crm/index.html
assert_file your-new-crm/styles.css
assert_file your-new-crm/app.js
assert_file your-new-crm/favicon.svg
assert_file your-new-crm.html
assert_file cloudprune/cloudprune/index.html
assert_file cloudprune/cloudprune/styles.css
assert_file cloudprune/cloudprune/app.js
assert_file cloudprune/cloudprune/favicon.svg
assert_file saas-crm/cloudprune/index.html
assert_file saas-crm/cloudprune/styles.css
assert_file saas-crm/cloudprune/app.js
assert_file saas-crm/cloudprune/favicon.svg

assert_not_exists wordpress-to-modern-websites.html

assert_contains index.html "<title>Zeptrix | AI AWS Cost Reduction</title>"
assert_contains index.html 'href="/styles.css"'
assert_contains index.html 'src="/app.js"'

assert_contains siteops.html '<link rel="canonical" href="https://zeptrix.io/siteops">'
assert_contains siteops.html "<title>Zeptrix SiteOps | Modern Website Hosting and WordPress Care</title>"
assert_contains siteops.html 'href="/styles.css"'
assert_contains siteops.html 'src="/app.js"'

assert_contains ai-power-site.html '<link rel="canonical" href="https://zeptrix.io/ai-power-site">'
assert_contains ai-power-site.html "<title>Zeptrix AI Power Site | Managed Website Modernization for Wix Customers</title>"
assert_contains ai-power-site.html 'href="/styles.css"'
assert_contains ai-power-site.html 'src="/app.js"'

assert_contains privacy.html '<link rel="canonical" href="https://zeptrix.io/privacy">'
assert_contains privacy.html "<title>Zeptrix Privacy Policy</title>"
assert_contains privacy.html "Google User Data"
assert_contains privacy.html 'href="/styles.css"'

assert_contains terms.html '<link rel="canonical" href="https://zeptrix.io/terms">'
assert_contains terms.html "<title>Zeptrix Terms of Service</title>"
assert_contains terms.html "Integrations"
assert_contains terms.html 'href="/styles.css"'

assert_contains mbh/index.html '<html lang="he" dir="rtl">'
assert_contains mbh/index.html "<title>מיכל בן חיון</title>"
assert_contains mbh/index.html 'href="styles.css"'
assert_contains mbh/index.html 'src="script.js"'
assert_contains mbh/index.html "052-314-1458"

assert_contains your-new-crm/index.html "<title>Zeptrix CRM | Sales Pipeline</title>"
assert_contains your-new-crm/index.html 'href="./styles.css"'
assert_contains your-new-crm/index.html 'src="./app.js"'
assert_contains your-new-crm.html "<title>Zeptrix CRM | A Sales Workspace That Drives Action</title>"
assert_contains your-new-crm.html 'href="/your-new-crm/"'
assert_contains cloudprune/cloudprune/index.html "<title>CloudPrune | Cloud Cost Workspace</title>"
assert_contains cloudprune/cloudprune/index.html 'href="/cloudprune/styles.css"'
assert_contains cloudprune/cloudprune/index.html 'src="/cloudprune/app.js"'
assert_contains saas-crm/cloudprune/index.html "<title>CloudPrune | Cloud Cost Workspace</title>"

assert_contains nginx-zeptrix.conf "location = /mbh"
assert_contains nginx-zeptrix.conf "return 301 /mbh/;"
assert_contains nginx-zeptrix.conf "location ^~ /mbh/"
assert_contains nginx-zeptrix.conf "try_files \$uri \$uri/ /mbh/index.html;"
assert_contains nginx-zeptrix.conf "location = /wordpress-to-modern-websites"
assert_contains nginx-zeptrix.conf "location = /fast-site"
assert_contains nginx-zeptrix.conf "return 301 /siteops;"
assert_contains nginx-zeptrix.conf "location = /internal-crm"
assert_contains nginx-zeptrix.conf "location ^~ /internal-crm/"
assert_contains nginx-zeptrix.conf "proxy_pass http://127.0.0.1:8008;"
assert_contains nginx-zeptrix.conf "location = /cloudprune"
assert_contains nginx-zeptrix.conf "location ^~ /cloudprune/"

if rg -n 'href="styles\.css"|src="app\.js"|url\("assets/' --glob '*.html' --glob '*.css' . \
  | rg -v '^./mbh/'; then
  fail "root Zeptrix pages must use absolute /styles.css, /app.js, and /assets/... paths"
fi

if git ls-files | grep -E '(^|/)__pycache__/|\.pyc$' >/dev/null; then
  fail "generated Python cache files must not be tracked or deployed"
fi

echo "Local deploy invariant tests passed"
