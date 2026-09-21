# Phase 5: Workload Management

A workload represents a meaningful AI-powered business process (e.g., `Support Triage`, `Sales Research`, `Invoice Extraction`).
Workloads are the primary business-level dimension by which costs are grouped and reported.

## Design Constraints
* **Workloads are not implementation details:** They are explicitly completely distinct from providers, models, individual API keys, or raw requests. 
* **Organization-Scoped:** Workloads and their associated attribution rules belong securely to a single organization.

## Application Architecture
The Workload Service encapsulates domain logic purely around CRUD operations, ensuring:
* Clean Next.js route handlers simply passing data to `WorkloadService`.
* Complete separation from the underlying attribution matching.
* Automatic foreign-key cascades enforced purely via the database (deleting a workload purges its attribution rules and un-attributes its usage).

## Attribution Rules
V0 implements explicit attribution via API Keys (rule type: `<provider>_api_key`).
The service enforces uniqueness by letting the database throw `23505` (unique constraint violation) avoiding complex optimistic locking.
