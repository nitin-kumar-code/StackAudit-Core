# Security & Compliance

## Data Protection & Access Control

### ⚠️ Row Level Security (RLS) & DPDP Compliance
For the V0 open-source release, **Row Level Security (RLS)** is intentionally deferred. Access is currently gated entirely by the server-side API layer using a service role key, as V0 acts as a local-first/single-tenant developer tool without a formalized Identity Provider (IdP) or Role-Based Access Control (RBAC).

**Compliance Deadline (Hard Gate)**
This deferral MUST be resolved prior to the **13 May 2027 DPDP (Digital Personal Data Protection) Rules compliance deadline** (India), which mandates strict access control and logging. 

**Pre-Production/Commercial Requirements:**
Before transitioning this project to a multi-tenant commercial cloud environment or accepting real customer data, the following must be implemented:
1. **Authentication**: Integration with a formal Identity Provider (e.g., Supabase Auth, Clerk, Auth0).
2. **RLS Policies**: All tables must have `ENABLE ROW LEVEL SECURITY` with policies strictly scoped to the `organization_id` of the authenticated user.
3. **Audit Logging**: One-year retention of access logs per DPDP requirements.

This is a tracked, critical blocker for the commercial phase.
