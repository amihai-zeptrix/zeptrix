# Deployment Lessons

This repo deploys multiple public paths from one nginx web root. Treat every live path as part of the deploy bundle before using `rsync --delete`.

## What Went Wrong

On May 29, 2026, `/mbh/` started serving the Zeptrix home page instead of Michal's site.

Root cause:
- The deploy synced `web-site/` to `/usr/share/nginx/html/` with `rsync --delete`.
- Michal's page existed on the server under `/usr/share/nginx/html/mbh/`, but it was not included in the deploy bundle.
- `rsync --delete` removed `/usr/share/nginx/html/mbh/`.
- nginx then fell through to the generic fallback:

```nginx
location / {
    try_files $uri $uri/ $uri.html /index.html;
}
```

Because `/mbh/` no longer existed, nginx served `/index.html`, the Zeptrix home page.

## Current Required Deploy Shape

The deployed static bundle must include:

- `/index.html` for the Zeptrix home page
- `/siteops.html` for `https://zeptrix.io/siteops`
- `/mbh/index.html` for `https://zeptrix.io/mbh/`
- `/mbh/styles.css`
- `/mbh/script.js`
- `/mbh/assets/`
- `/your-new-crm/index.html`
- `/your-new-crm/styles.css`
- `/your-new-crm/app.js`
- `/your-new-crm/favicon.svg`
- shared Zeptrix files such as `/styles.css`, `/app.js`, `/assets/`, `/sitemap.xml`, and `/robots.txt`

Do not deploy only the root Zeptrix files unless `/mbh/` is intentionally excluded and nginx is changed accordingly.

## nginx Expectations

The nginx config must keep explicit handling for Michal's site:

```nginx
location = /mbh {
    return 301 /mbh/;
}

location ^~ /mbh/ {
    try_files $uri $uri/ /mbh/index.html;
}
```

This prevents `/mbh/` from falling through to the Zeptrix home page.

The old managed-site URLs should redirect to the new URL:

```nginx
location = /fast-site {
    return 301 /siteops;
}

location = /fast-site/ {
    return 301 /siteops;
}

location = /wordpress-to-modern-websites {
    return 301 /siteops;
}

location = /wordpress-to-modern-websites/ {
    return 301 /siteops;
}
```

## Verification Before and After Deploy

Run local deploy invariant tests before commit:

```bash
./scripts/test.sh
```

This is also wired into the tracked pre-commit hook at `.githooks/pre-commit`.

For a fresh clone or new session, enable the tracked hooks once:

```bash
git config core.hooksPath .githooks
```

Run the production route test after every deploy:

```bash
./scripts/verify-routes.sh https://zeptrix.io
```

The test verifies:

- `/` serves the Zeptrix home page.
- `/siteops` serves the managed website page.
- `/fast-site` redirects to `/siteops`.
- `/wordpress-to-modern-websites/` redirects to `/siteops`.
- `/mbh/` serves Michal's Hebrew page, not the Zeptrix home page.
- `/mbh/styles.css` is reachable as CSS.
- `/mbh/script.js` is reachable as JavaScript.
- `/your-new-crm/` serves the customizable sales pipeline.
- `/your-new-crm/styles.css` and `/your-new-crm/app.js` are reachable.

If this test fails, do not consider the deploy complete.

If `./scripts/test.sh` fails, do not commit.

## Deployment Rule

When using `rsync --delete`, first assemble the full desired public web root in a temporary directory and confirm it contains `mbh/`.

Example check:

```bash
find /tmp/zeptrix-public -maxdepth 2 -type f | sort
test -f /tmp/zeptrix-public/mbh/index.html
test -f /tmp/zeptrix-public/mbh/styles.css
test -f /tmp/zeptrix-public/mbh/script.js
```

Then sync the complete bundle to the server.

Never use `rsync --delete` against `/usr/share/nginx/html/` from a partial source directory.
