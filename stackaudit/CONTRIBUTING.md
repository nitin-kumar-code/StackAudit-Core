# Contributing

Thanks for helping improve StackAudit. Keep changes focused on correctness, maintainability, security, and making local self-hosting easier. Do not add provider-specific cost formulas outside the shared pricing engine.

## Development

1. Install Node.js 20+, npm dependencies, and the Supabase CLI.
2. Follow the local setup in [README.md](README.md).
3. For changes that affect schema, add a new migration; do not rewrite migration history.
4. Add or update behavioral tests for changed domain behavior.
5. Run `npm run typecheck`, `npm run lint`, `npm test`, and relevant integration checks.

## Pull requests

Describe the problem, the behavior change, and verification performed. Include migration and configuration notes when relevant. Never include credentials, production data, or generated secrets in a pull request.

## Security reports

Please follow the private reporting guidance in [SECURITY.md](SECURITY.md) for suspected vulnerabilities. Do not file exploitable details in a public issue.

## License and contributions

StackAudit is licensed under the Apache License, Version 2.0. See the root [`LICENSE`](LICENSE) file. Under Section 5 of Apache-2.0, contributions intentionally submitted for inclusion are licensed under Apache-2.0 unless a contributor explicitly states otherwise; separate license agreements, if any, remain unaffected. Contributors retain their copyright in their contributions. Please identify third-party code or assets and their applicable license or attribution requirements when proposing them; do not submit material you are not authorized to contribute.
