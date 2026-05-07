## Day 1 — 2026-05-06

**Hours worked:** 2.5

**What I did:**
- Read through the full assignment and broke the project into MVP vs stretch features
- Sketched the main user flow from landing page → audit form → results page → lead capture
- Decided to use Next.js App Router with TypeScript and TailwindCSS
- Initialized the repository and configured the base project structure
- Set up reusable UI foundations and shared component organization
- Started building the landing page with a modular marketing section approach instead of one large page component
- Added initial SEO metadata structure and responsive layout foundations

**What I learned:**
The hardest part initially was narrowing the MVP scope. My first instinct was to build live integrations and automatic spend syncing, but that would have added a lot of complexity for a 7-day project. I decided to focus on a strong manual audit flow first and make the recommendations engine believable.

I also realized the assignment is evaluating product thinking just as much as frontend implementation, especially around explainability and tradeoffs.

**Blockers / what I'm stuck on:**
Still deciding how detailed the audit recommendation engine should be without overcomplicating the pricing logic. Need to balance realistic recommendations with implementation speed.

I'm also thinking through the cleanest structure for shareable audit result pages and public metadata generation.

**Plan for tomorrow:**
- Build a multi-step form
- Improve its persistence + validation
- Improve the UX Polish

```md id="74z7lx"
## Day 2 — 2026-05-07

**Hours worked:** 6

**What I did:**
- Built the initial multi-step audit workflow
- Added form validation using Zod and react-hook-form
- Created a centralized schema for audit data including tools, plans, seat counts, and monthly spend
- Split the audit flow into modular step components instead of one large form component
- Implemented tool selection flow for supported AI products (ChatGPT, Claude, Cursor, Copilot, Gemini, etc.)
- Added dynamic form rendering for selected tools
- Implemented localStorage persistence so partially completed audits survive refreshes
- Added a dedicated `/audit` route and connected the landing page CTA to the audit flow
- Continued refining the landing page accessibility and metadata structure

**What I learned:**
The biggest realization today was that the audit experience matters more than just collecting form inputs. The form structure itself influences how believable the audit feels. I initially considered using a single-page form, but the multi-step flow made the experience feel less overwhelming and easier to reason about.

I also spent time thinking about how to structure pricing data centrally so recommendations can stay maintainable instead of scattering pricing logic throughout components.

**Blockers / what I'm stuck on:**
The audit recommendation engine is still the hardest part conceptually. I need recommendations to feel financially defensible rather than arbitrary. Right now I’m trying to balance realistic optimization logic with keeping the implementation manageable within the project timeline.

I’m also still deciding how detailed the shareable results page should be versus keeping it lightweight and screenshot-friendly.

**Plan for tomorrow:**
- Start implementing the audit engine and savings calculations
- Add centralized pricing configuration
- Generate recommendation reasoning for each tool
- Build the audit results page
- Begin preparing test coverage for pricing logic
```
