# RULES.md

**Stack:** Next.js + Supabase
**Platform:** web

> This file is a **lazy index** — `concern → playbook §`.
> Read only the § you need. Never load all playbooks eagerly.
> Detail lives in `playbooks/`. Concern files live in `playbooks/concerns/`.

---

## Always-on Invariants

| Concern               | Playbook                                        | Section                          |
| --------------------- | ----------------------------------------------- | -------------------------------- |
| `accessibility`       | `playbooks/universal/accessibility.md`          | Semantic Structure               |
| `accessibility`       | `playbooks/universal/accessibility.md`          | Keyboard and Focus               |
| `accessibility`       | `playbooks/universal/accessibility.md`          | Forms and Authentication         |
| `accessibility`       | `playbooks/universal/accessibility.md`          | Accessibility Testing            |
| `naming`              | `playbooks/universal/coding-rules.md`           | Naming                           |
| `naming`              | `playbooks/universal/coding-rules.md`           | Functions                        |
| `naming`              | `playbooks/universal/coding-rules.md`           | Imports                          |
| `naming`              | `playbooks/universal/coding-rules.md`           | Constants                        |
| `no-debug`            | `playbooks/universal/coding-rules.md`           | No Debug Code in Commits         |
| `no-debug`            | `playbooks/universal/coding-rules.md`           | One Thing Per File               |
| `errors`              | `playbooks/universal/error-handling.md`         | Error Contract                   |
| `errors`              | `playbooks/universal/error-handling.md`         | Boundary Handling                |
| `errors`              | `playbooks/universal/error-handling.md`         | Security Rules for Errors        |
| `git`                 | `playbooks/universal/git-conventions.md`        | Branch Structure                 |
| `git`                 | `playbooks/universal/git-conventions.md`        | Commit Convention                |
| `git`                 | `playbooks/universal/git-conventions.md`        | Daily Workflow                   |
| `observability`       | `playbooks/universal/observability.md`          | Structured Events                |
| `observability`       | `playbooks/universal/observability.md`          | Health and Readiness             |
| `observability`       | `playbooks/universal/observability.md`          | Errors and Traces                |
| `security-boundaries` | `playbooks/universal/security.md`               | Trust Boundaries                 |
| `security-boundaries` | `playbooks/universal/security.md`               | Authentication and Authorization |
| `secret-safety`       | `playbooks/universal/security.md`               | Secrets and Data                 |
| `secret-safety`       | `playbooks/universal/security.md`               | Failure Safety                   |
| `typescript-strict`   | `playbooks/universal/typescript.md`             | Strict Mode — Always On          |
| `typescript-strict`   | `playbooks/universal/typescript.md`             | Type vs Interface                |
| `web-platform`        | `playbooks/platform/web.md`                     | Browser Boundary                 |
| `web-platform`        | `playbooks/platform/web.md`                     | Navigation and Accessibility     |
| `architecture`        | `playbooks/stack/nextjs/architecture.md`        | Profiles                         |
| `architecture`        | `playbooks/stack/nextjs/architecture.md`        | Dependency Direction             |
| `structure`           | `playbooks/stack/nextjs/structure.md`           | Feature Ownership                |
| `structure`           | `playbooks/stack/nextjs/structure.md`           | Backend-Specific Boundaries      |
| `runtime`             | `playbooks/stack/nextjs/runtime.md`             | Server and Client                |
| `runtime`             | `playbooks/stack/nextjs/runtime.md`             | Caching and Mutations            |
| `stack-security`      | `playbooks/stack/nextjs/security.md`            | Authorization                    |
| `stack-security`      | `playbooks/stack/nextjs/security.md`            | Sessions                         |
| `stack-testing`       | `playbooks/stack/nextjs/testing.md`             | Test Layers                      |
| `supabase-runtime`    | `playbooks/capabilities/supabase/migrations.md` | Local and Hosted Flow            |
| `rls`                 | `playbooks/capabilities/supabase/rls.md`        | Grants and Policies              |
| `supabase-next`       | `playbooks/capabilities/supabase/nextjs.md`     | Clients and Proxy                |
| `styling`             | `playbooks/styling/tailwind-extensions.md`      | Responsive — Mobile First Always |
| `makefile`            | `playbooks/devops/makefile.md`                  | Core Rules                       |
| `ci`                  | `playbooks/capabilities/ci/github-actions.md`   | Frontend CI                      |
| `ci`                  | `playbooks/capabilities/ci/github-actions.md`   | Backend CI (Spring Boot)         |
| `ci`                  | `playbooks/capabilities/ci/github-actions.md`   | Next.js CI                       |
| `pr`                  | `playbooks/devops/pr-template.md`               | Template                         |

---

## Optional Concerns

| Concern       | Playbook                                 | Section                    | When                                          |
| ------------- | ---------------------------------------- | -------------------------- | --------------------------------------------- |
| `validation`  | `playbooks/universal/typescript.md`      | Zod for Runtime Validation | Project validates external/runtime input      |
| `query`       | `playbooks/concerns/tanstack-query.md`   | § 3 Read Hook              | Client needs cached server state              |
| `query`       | `playbooks/concerns/tanstack-query.md`   | § 4 Mutation Hook          | Client needs cached server state              |
| `state`       | `playbooks/concerns/zustand.md`          | § 2 Store Setup            | Shared non-server UI state                    |
| `env`         | `playbooks/concerns/t3-env.md`           | Setup                      | Validating env vars at build time             |
| `url-state`   | `playbooks/concerns/nuqs.md`             | § 1 Basic Usage            | Filter/search/pagination state belongs in URL |
| `safe-action` | `playbooks/concerns/next-safe-action.md` | § 1 Setup                  | Type-safe server actions with auth middleware |
| `safe-action` | `playbooks/concerns/next-safe-action.md` | § 2 Defining an Action     | Type-safe server actions with auth middleware |
| `dark-mode`   | `playbooks/concerns/next-themes.md`      | § 1 Provider Setup         | Project needs dark mode toggle                |

---

**How to use this file:**

1. Identify which concern your task touches.
2. Open only the listed playbook at the listed §.
3. Stop reading when the § ends.
4. Never read all playbooks eagerly — your context window is finite.
