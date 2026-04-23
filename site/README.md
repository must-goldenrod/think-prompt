# `site/` — Think-Prompt landing page

Single-page marketing site for https://think-prompt.dev (or whatever domain
we end up pointing at GitHub Pages).

## Stack

**Deliberately static.** Tailwind CDN + a tiny custom stylesheet + one
`copyInstall()` JS function. No bundler, no build step. This mirrors the
same philosophy as the local dashboard (D-012 in the decision log: "server-
rendered HTML + Tailwind CDN, no bundler").

- `index.html` — the whole page
- `style.css` — focus rings, font smoothing, scrollbar polish
- `README.md` — this file

## Local preview

Any HTTP server works. From the repo root:

```bash
cd site
python3 -m http.server 8000
# or
npx --yes http-server -p 8000 .
```

Then open http://localhost:8000.

## Deployment

GitHub Pages deploys automatically from `main` via
`.github/workflows/deploy-site.yml`. One-time setup by a maintainer:

1. Repo **Settings → Pages** → Source = `GitHub Actions`.
2. (Optional) Custom domain → add `think-prompt.dev`. Set CNAME in
   your DNS to `<user>.github.io`. GitHub auto-issues a Let's Encrypt cert.
3. Push to `main` — the workflow publishes `site/` as the root of the site.

## Content changes

Edit `index.html` directly. The file is kept as a single flat document on
purpose — easier to audit, easier to review in PRs, and fast to load for
visitors. If it grows past ~400 lines, consider splitting into an `index.html`
+ `components/` pattern, but only when the split pays for itself.

Keep the privacy promises (D-004 / D-028 / D-030 section) word-for-word
consistent with the decision log. If they ever diverge, the log wins and
the homepage gets a PR.

## Assets (TODO)

- [ ] Replace the placeholder demo block with a 30-second GIF before v0.1.0
      launch (see `docs/10-launch-strategy.md` §0).
- [x] Add favicon (`favicon.svg` — accent background + ascending-bar glyph,
      shared with the local dashboard).
- [ ] Add Open Graph image (1200×630 PNG).
- [ ] Custom domain DNS once it's purchased.
