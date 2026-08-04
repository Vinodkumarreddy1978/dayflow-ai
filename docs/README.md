# DayFlow AI - Specification Suite

Thirty-seven documents describing what DayFlow AI is, who it is for, how it behaves,
how it is built, and how it is run. Documentation is the single source of truth: when
the code and a document disagree, one of them is a defect, and the document is fixed
first.

Start with [01 - Documentation Index and Standards](00-governance/01-documentation-index-and-standards.md),
which explains how these documents are written, numbered, reviewed and versioned.

## Map

### 00 - Governance

| #   | Document                                                                                   | Purpose                                        |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 01  | [Documentation Index and Standards](00-governance/01-documentation-index-and-standards.md) | How this suite works                           |
| 02  | [Product Charter](00-governance/02-product-charter.md)                                     | Vision, scope, principles, non-goals           |
| 03  | [Glossary](00-governance/03-glossary.md)                                                   | The domain language, defined once              |
| 04  | [Decision Log](00-governance/04-decision-log.md)                                           | Architecture decisions and their reasoning     |
| 05  | [Versioning and Release Policy](00-governance/05-versioning-and-release-policy.md)         | How versions, releases and breaking changes go |

### 01 - Business

| #   | Document                                                                             | Purpose                                   |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| 06  | [Market and Competitive Analysis](01-business/06-market-and-competitive-analysis.md) | The landscape and where DayFlow sits      |
| 07  | [Personas and Jobs to be Done](01-business/07-personas-and-jobs-to-be-done.md)       | Who this is for and what they hire it for |
| 08  | [Business Model and Pricing](01-business/08-business-model-and-pricing.md)           | How it sustains itself                    |
| 09  | [Go to Market Plan](01-business/09-go-to-market-plan.md)                             | How the first users arrive                |
| 10  | [KPI Framework](01-business/10-kpi-framework.md)                                     | How success is measured                   |

### 02 - Product

| #   | Document                                                                                                 | Purpose                             |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 11  | [PRD - Core Moments and Categories](02-product/11-prd-core-moments-and-categories.md)                    | The central entity and its taxonomy |
| 12  | [PRD - Queue and Reminder Engine](02-product/12-prd-queue-and-reminder-engine.md)                        | The signature mechanic              |
| 13  | [PRD - Analytics and Visualization](02-product/13-prd-analytics-and-visualization.md)                    | Charts, ranges and controls         |
| 14  | [PRD - Goals, Streaks and Productivity Score](02-product/14-prd-goals-streaks-and-productivity-score.md) | Motivation layer                    |
| 15  | [PRD - AI Insights Engine](02-product/15-prd-ai-insights-engine.md)                                      | What the AI does and refuses to do  |
| 16  | [PRD - Settings and Customization](02-product/16-prd-settings-and-customization.md)                      | Every knob the user controls        |
| 17  | [Feature Backlog and Roadmap](02-product/17-feature-backlog-and-roadmap.md)                              | Sequencing                          |

### 03 - User Experience

| #   | Document                                                                                     | Purpose                        |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| 18  | [Information Architecture](03-ux/18-information-architecture.md)                             | Navigation and structure       |
| 19  | [User Flows](03-ux/19-user-flows.md)                                                         | Step-by-step journeys          |
| 20  | [Screen Specifications](03-ux/20-screen-specifications.md)                                   | Every screen, region by region |
| 21  | [Design System](03-ux/21-design-system.md)                                                   | Tokens, components, motion     |
| 22  | [Accessibility and Responsive Standards](03-ux/22-accessibility-and-responsive-standards.md) | Non-negotiable quality bars    |

### 04 - Architecture

| #   | Document                                                                                           | Purpose                             |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 23  | [System Architecture](04-architecture/23-system-architecture.md)                                   | The whole picture                   |
| 24  | [Data Model and ERD](04-architecture/24-data-model-and-erd.md)                                     | Entities and relationships          |
| 25  | [Database Schema and RLS](04-architecture/25-database-schema-and-rls.md)                           | Tables, triggers, security policies |
| 26  | [API Specification](04-architecture/26-api-specification.md)                                       | Every endpoint and contract         |
| 27  | [State and Sync Strategy](04-architecture/27-state-and-sync-strategy.md)                           | Caching, realtime, conflicts        |
| 28  | [Notification Architecture](04-architecture/28-notification-architecture.md)                       | Push, scheduling, quiet hours       |
| 29  | [AI Architecture and Prompt Contracts](04-architecture/29-ai-architecture-and-prompt-contracts.md) | How insights are produced           |

### 05 - Engineering

| #   | Document                                                                            | Purpose                     |
| --- | ----------------------------------------------------------------------------------- | --------------------------- |
| 30  | [Coding Standards](05-engineering/30-coding-standards.md)                           | Conventions and structure   |
| 31  | [Testing Strategy](05-engineering/31-testing-strategy.md)                           | What is tested and how      |
| 32  | [Environment and Configuration](05-engineering/32-environment-and-configuration.md) | Every variable, every env   |
| 33  | [CI/CD and Deployment Runbook](05-engineering/33-cicd-and-deployment-runbook.md)    | How code reaches production |

### 06 - Operations

| #   | Document                                                                                     | Purpose                        |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| 34  | [Security and Threat Model](06-operations/34-security-and-threat-model.md)                   | Attack surface and mitigations |
| 35  | [Privacy and Data Protection](06-operations/35-privacy-and-data-protection.md)               | User data rights and handling  |
| 36  | [Observability and Incident Runbook](06-operations/36-observability-and-incident-runbook.md) | Monitoring and response        |
| 37  | [Backup and Disaster Recovery](06-operations/37-backup-and-disaster-recovery.md)             | Losing nothing, ever           |
