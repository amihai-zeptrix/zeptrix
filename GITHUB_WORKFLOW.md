# GitHub Workflow Notes

Use the `amihai-zeptrix` GitHub account for this repository.

Before pushing, especially after a reconnect or a new shell session, verify the active account:

```bash
gh auth status
```

If another account is active, switch before running `git push`:

```bash
gh auth switch -u amihai-zeptrix
gh auth status
```

Expected push target:

```bash
git remote -v
git push origin main
```

If push fails with `Permission to amihai-zeptrix/zeptrix.git denied to ahadarbioa`, the active GitHub account is wrong. Switch to `amihai-zeptrix` and retry the push.

Current CloudPrune deployment rule: deploy to the existing `zeptrix-web-1` EC2 instance through SSM. Do not create new AWS infrastructure without explicit approval.
