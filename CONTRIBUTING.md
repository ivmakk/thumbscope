# Contributing

Thanks for your interest in improving Thumbscope. Bug reports, fixes, new format support, and docs are all welcome.

## Getting started

- Node 24 (`.nvmrc`). On nvm-windows run `nvm use 24` manually.
- `npm install`, then `npm run dev` for the app, `npm test` for the suite, `npm run typecheck` before opening a PR.
- See `CLAUDE.md` for architecture, the parser/format domain knowledge, and commands.

## License of your contributions

This project is licensed under **GPL-3.0-only** (see `LICENSE`). By submitting a contribution (pull request, patch, or any code/docs/assets) you agree to the following, so the project's licensing stays clean and flexible:

1. **Inbound = outbound.** Your contribution is provided under the same license as the project, **GPL-3.0-only**.
2. **Relicensing grant.** You also grant the project maintainer(s) a perpetual, worldwide, irrevocable, royalty-free right to **relicense your contribution under other terms** (including a commercial/proprietary license). This lets the project be dual-licensed or relicensed in the future without having to track down every contributor. You keep the copyright to your contribution.
3. **Developer Certificate of Origin (DCO).** You certify the [DCO 1.1](https://developercertificate.org/) - i.e. you wrote the contribution or otherwise have the right to submit it under the above terms. Sign off each commit with:

   ```
   git commit -s
   ```

   which appends a `Signed-off-by: Your Name <you@example.com>` line.

If you cannot agree to the relicensing grant, please open an issue to discuss before sending code.

## Privacy (public repository)

This is a public repo. **Never include real local filesystem paths, IP addresses, personal names, or other personal/location-revealing data** in code, docs, comments, fixtures, or commit messages - use neutral placeholders (`<corpus>`, `/path/to/sample`, `192.0.2.0`, `Example User`). Real sample `Thumbs.db`-family files contain personal photos and must never be committed; keep them in the gitignored `tests/fixtures/real/`. Review your diff before opening a PR. See the privacy rule in `CLAUDE.md` for the full policy.
