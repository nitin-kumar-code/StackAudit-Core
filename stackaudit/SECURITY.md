# Security

StackAudit is an early preview and is not currently a hardened multi-tenant service. Many route and service queries include organization checks. Because the API uses a server-side Supabase client that can use the service-role key, every route must validate the caller and scope database access correctly.

## Current limitations

- Row Level Security policies and production-ready identity/role management are not complete.
- In development only, API requests without an Authorization header can use `DEMO_ORG_ID` (or fall back to the first organization if that variable is unset). Do not expose this development server to untrusted networks.
- Do not use production or sensitive personal data with this preview until authorization, database policies, logging, and operational controls have been reviewed for your deployment.
- This project makes no compliance certification or legal-compliance claim. Applicable privacy obligations depend on deployment and data use; seek qualified advice for those decisions.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting for this repository if it is enabled. Otherwise, contact the repository owner privately before public disclosure. No response-time guarantee is currently published.

Never include API keys, service-role credentials, customer data, or unredacted logs in a report.
