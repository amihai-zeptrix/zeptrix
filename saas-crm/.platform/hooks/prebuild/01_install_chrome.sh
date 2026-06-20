#!/bin/bash
set -euo pipefail

if command -v google-chrome >/dev/null 2>&1; then
  mkdir -p /var/app/linkedin-profiles
  chown -R webapp:webapp /var/app/linkedin-profiles || true
  chmod 700 /var/app/linkedin-profiles || true
  exit 0
fi

cat >/etc/yum.repos.d/google-chrome.repo <<'REPO'
[google-chrome]
name=google-chrome
baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
REPO

dnf install -y google-chrome-stable

mkdir -p /var/app/linkedin-profiles
chown -R webapp:webapp /var/app/linkedin-profiles || true
chmod 700 /var/app/linkedin-profiles || true
