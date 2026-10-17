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

## License status

The repository has not selected a license yet. Contributions are welcome for discussion, but the project owner must resolve licensing before public reuse or distribution terms can be represented as settled.
