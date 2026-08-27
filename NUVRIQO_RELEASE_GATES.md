# Nuvriqo Release Gates

This repository follows the standard Nuvriqo app-factory release process.

## Gates

1. **Build** — dependency install, Custom UI build and `forge lint` pass.
2. **Functional** — core use cases and configuration verified on the Nuvriqo test site.
3. **QA** — automated smoke/regression tests pass with no release-blocking defects.
4. **Security** — minimum scopes, permission/admin guards, secret hygiene and tenant isolation verified.
5. **Documentation** — setup, admin/user docs, support, privacy/security and release notes complete.
6. **Marketplace** — listing answers, copy, pricing, logos, screenshots/highlights and upload assets complete.
7. **Commercial** — positioning, onboarding, product page/cross-sell plan and launch measurement ready.

A release candidate should not progress to production/Marketplace release until every applicable gate is GREEN.

## Standard pipeline

Code change -> build -> Forge lint -> automated tests -> development deploy -> installation upgrade -> smoke/Playwright QA -> release gate result -> production candidate.

Production deployment remains controlled. A version already submitted to Atlassian Marketplace should remain frozen while under review.
