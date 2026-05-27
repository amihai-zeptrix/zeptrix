#!/bin/bash
set -euxo pipefail

dnf update -y
dnf install -y nginx

cat > /usr/share/nginx/html/index.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zeptrix.io</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #101418;
      color: #f6f7f8;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #101418 0%, #16352f 45%, #4d3821 100%);
    }

    main {
      width: min(680px, calc(100vw - 48px));
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(44px, 7vw, 88px);
      line-height: 1;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      max-width: 52ch;
      color: #dce4e2;
      font-size: 18px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <h1>zeptrix.io</h1>
    <p>The server is online. Deployment pipeline and domain routing are next.</p>
  </main>
</body>
</html>
HTML

systemctl enable nginx
systemctl restart nginx
