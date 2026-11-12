# StackAudit public release hygiene report

**Review date:** 2026-11-05  
**Scope:** Current working tree and Git index for StackAudit. This is a repository-state review, not a complete legal opinion or history-wide secret audit.

## Executive status

The working tree contains an Apache-2.0 license text, and `package.json` declares `Apache-2.0`. README and CONTRIBUTING refer to that license consistently. The `LICENSE` file is staged as a new file, however, and is not in the current `HEAD`; a fresh checkout of the current commit therefore does not yet contain the license those documents refer to. Commit the existing staged license before describing the current commit as Apache-2.0 licensed.

Five tracked SVGs in `public/` resemble the default Next.js starter assets. No source, copyright holder, or license is recorded for them, and code search found no references to them. This resemblance is a lead, not proof of provenance or a grant of rights. `app/favicon.ico` is referenced by the application metadata but has no provenance record. No assets were removed.

No `NOTICE` file exists. No `node_modules`, `.next`, coverage, environment, or common build-output paths are tracked in the current Git index. The current worktree has `node_modules/` and `.next/` directories, which are ignored. The dependency graph has not received a complete direct and transitive license compatibility scan; the package lock is not a substitute for that inventory.

## License consistency

- `LICENSE` contains the Apache License, Version 2.0 heading, Sections 1–9, end-of-terms marker, and application appendix. Its text is consistent with the official Apache-2.0 text linked by the Apache Software Foundation: [official license text](https://www.apache.org/licenses/LICENSE-2.0.txt).
- `package.json` uses the exact SPDX identifier `Apache-2.0`.
- `README.md` identifies Apache License 2.0 and links to `LICENSE`.
- `CONTRIBUTING.md` identifies Apache-2.0 contribution terms and asks contributors to identify third-party materials.
- `SECURITY.md` does not add a conflicting license statement.
- The template appendix still contains the standard `[yyyy] [name of copyright owner]` placeholders. No project copyright owner or year has been established from the reviewed files; none is invented here.
- No `NOTICE` file is present. No separate third-party notice inventory was found in the reviewed release files. Apache-2.0 requires preserving applicable upstream attribution and notice material when redistributing included third-party works; the project should add required notices once each asset and dependency is inventoried.
- `package.json` also has `"private": true`. That prevents ordinary npm publication and does not itself contradict the license field, but maintainers should decide whether that is intended for this distribution model.

### License publication state

At the start of this review, Git status showed `LICENSE` staged as a new addition, not included in `HEAD`. Other pre-existing staged additions (`DISTRIBUTION_AND_MONETIZATION_PLAN.md` and `OSS_RELEASE_ASSESSMENT.md`) and pre-existing README/setup edits were left untouched. `docs/SELF_HOSTING.md` was also already untracked. This report is a new working-tree file. A final `git status` recheck did not complete in the available command window; no staging, commit, or cleanup command was run during this audit.

## Public assets and provenance

Repository reference scan covered application and documentation source while excluding generated dependencies/build output. The only match among the named SVGs was in this report context; the application does not reference them. The favicon is referenced from `app/layout.tsx`.

| File | Purpose/reference | Provenance finding | License/attribution | Recommendation |
|---|---|---|---|---|
| `public/window.svg` | No application reference found. Small generic window glyph. | Shape and compact Next starter-style SVG form resemble scaffold artwork; no in-repository source record establishes origin. | Unknown from repository evidence. | Keep for now; confirm against the exact scaffold source/license or remove in a separately reviewed cleanup. |
| `public/globe.svg` | No application reference found. Small globe glyph. | Shape and SVG form resemble scaffold artwork; origin is not recorded. | Unknown from repository evidence. | Keep for now; confirm provenance or remove in a separately reviewed cleanup. |
| `public/file.svg` | No application reference found. Small document glyph. | Shape and SVG form resemble scaffold artwork; origin is not recorded. | Unknown from repository evidence. | Keep for now; confirm provenance or remove in a separately reviewed cleanup. |
| `public/next.svg` | No application reference found. Contains Next.js wordmark artwork. | Next.js branding is visible in the SVG; inclusion appears scaffold-related, but the exact source and applicable brand/artwork terms are not recorded here. | Not established by this repository. Trademark and logo usage should not be inferred from the project license. | Remove if not part of the product, or retain only after verifying source and permitted use. |
| `public/vercel.svg` | No application reference found. Contains Vercel triangle artwork. | Vercel branding is visible; exact source and applicable terms are not recorded here. | Not established by this repository. Trademark and logo usage should not be inferred from the project license. | Remove if not part of the product, or retain only after verifying source and permitted use. |
| `app/favicon.ico` | Referenced by `app/layout.tsx` as icon and shortcut. | Binary ICO; no source, author, or generation record was found in the inspected files. | Unknown from repository evidence. | Keep because it is functional; identify its source or replace it with a documented original icon. |
| `public/samples/stackaudit-usage.csv` | Downloaded from the Usage page as the CSV import sample. | Product sample data/schema fixture, not decorative artwork. | No third-party attribution identified; ensure its sample values remain synthetic. | Keep; it is part of the documented user workflow. |

No separate font files or vendored source trees were found under `public/`. Icons are otherwise provided by the `lucide-react` dependency rather than committed as individual assets; the dependency license still needs inclusion in the full dependency inventory.

## Dependencies and third-party notices

The committed `package-lock.json` records resolved package versions and integrity metadata. It does not provide a complete, human-readable license notice bundle. This review did not produce a full license report for all direct and transitive npm dependencies, validate all license expressions, or prepare a `THIRD_PARTY_NOTICES` file. Direct and transitive dependency obligations remain a release task. In particular, preserve package notices for distributed dependencies and review any non-permissive, source-available, dual-license, or attribution-required entries before bundling or redistributing them.

The Apache-2.0 project license does not relicense dependencies, logos, fonts, sample data sourced from elsewhere, or other third-party works. The README correctly notes that third-party components may have separate terms, but a concrete inventory and notices are not yet present.

## Generated, temporary, and tracked files

### Ignore/tracking findings

- `.gitignore` excludes `/node_modules`, `/.next`, `/out`, `/build`, `/coverage`, `.vercel`, `.env*` (with `.env.example` explicitly allowed), common npm/yarn/pnpm logs, `.DS_Store`, and TypeScript build artifacts.
- The tracked-file scan found no `.env`/`.env.local`, `node_modules`, `.next`, coverage, `dist`, build output, log, or `.DS_Store` path.
- The current working tree contains `node_modules/` and `.next/`; these are ignored and are not tracked.
- `.env.example` is tracked intentionally. No personal environment file is tracked in the inspected index.
- SQL migrations, `supabase/tests/analytics_reconciliation.test.sql`, and `fixtures/pricing/reference-pricing-v1.json` are intentional source/test data and should not be treated as generated junk.
- `full_setup.sql` is a retained historical schema snapshot. The setup documentation identifies migrations as canonical and says not to apply the snapshot with migrations. It is not an accidental duplicate installer based on current documented usage; retain it unless maintainers make and document a separate retirement decision.

### Maintainer review list

The repository also contains planning, audit, and development documents such as `DEVLOG.md`, `task.md`, `implementation_plan.md`, `hardening_report.md`, `AUDIT_REPORT.md`, `CLAUDE.md`, `DISTRIBUTION_AND_MONETIZATION_PLAN.md`, and `OSS_RELEASE_ASSESSMENT.md`. Their presence alone does not establish that they are personal or temporary. No removal was made. Maintainers should decide whether each is intended for public distribution and check it for internal-only content before release.

## Credentials and history boundary

The tracked-file inventory found no `.env`/`.env.local` path or common build/output path. A limited current-tree pattern scan for common private-key and provider-token formats was attempted but did not complete within the available command window; no clean-scan result is claimed. Such a scan can also miss formats, encoded values, deleted files, or secrets in Git history. This report makes no claim that Git history is clear. No history rewrite was performed. The asset-origin history traversal did not complete in this environment, so provenance statements above are based on current file contents and reference scans only.

## Files removed and remaining questions

- **Files removed:** none. Uncertain assets were preserved, consistent with the audit safety requirements.
- **Release concerns:** commit the staged `LICENSE`; establish ownership/permission and attribution for the starter-style SVGs and favicon; decide whether branded starter logos should ship; generate and review the direct/transitive dependency license and notice inventory; review internal planning/audit docs for intended public release; and run a dedicated history-aware secret scan before publication.
- **Unverified:** exact origin/license for the six listed graphics; all dependency license terms and redistribution notices; copyright ownership/year for original project content; and history-wide credential clearance.
