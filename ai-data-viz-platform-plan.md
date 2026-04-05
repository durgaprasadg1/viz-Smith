# Scalable AI Data Visualization Platform (Supabase-first)

A production-grade system where users upload CSV/XLSX, AI suggests meaningful relationships and chart types, charts are rendered, and exports (**PPTX / XLSX / PDF**) are generated with **history, pricing limits, and async scalability**.

---

## Locked Decisions

- **Database & Storage:** Supabase (**no MongoDB**)
- **AI Provider:** OpenAI
- **Processing Model:** Async jobs with progress tracking
- **Auth:** Supabase Email OTP + Google OAuth
- **Export Formats:** PPTX, XLSX, PDF
- **Deployment:** Vercel + Supabase
- **Quota Rule:**  
  - **Free:** up to **5 charts**
  - **Paid:** **9+ charts**

---

# 1) Architecture Blueprint

## 1.1 Client Layer

### Frontend
- **Next.js dashboard**
- Features:
  - File upload (CSV/XLSX)
  - Visualization viewer
  - Export actions
  - History dashboard
  - Auth-aware UI
  - Plan-aware feature gating

### User Capabilities
- Login / Signup
- Upload CSV / XLSX
- Watch visualization generation
- Download:
  - Visual PPT
  - Processed XLSX
  - PDF report
- View saved history

---

## 1.2 API & Orchestration Layer

### Responsibilities
- Upload initiation
- Job creation
- Status polling / streaming
- Artifact retrieval
- Quota enforcement
- History retrieval

### Rule
**Heavy processing must never happen in the request-response path.**

Everything heavy runs through **background async jobs**.

---

## 1.3 Data Layer (Supabase)

### Database
Use **Supabase Postgres** for:
- metadata
- job state
- user data
- AI outputs
- history
- usage tracking

### Storage Buckets
Recommended buckets:
- `raw-uploads`
- `normalized-datasets`
- `chart-assets`
- `exports`
- `debug-failures`

### Core Tables
- `users`
- `datasets`
- `dataset_columns`
- `column_profiles`
- `ai_recommendations`
- `chart_specs`
- `jobs`
- `exports`
- `usage_counters`
- `subscriptions`
- `audit_logs`

---

## 1.4 Intelligence Layer (AI Recommendation Engine)

### Input to AI
AI should receive:
- dataset filename
- inferred schema
- column names
- data types
- sample statistics
- optional user intent

### AI Output
AI must return **strict structured JSON**:
- column relationships
- recommended chart types
- confidence score
- rationale
- priority order

### Safety Rule
If AI output:
- fails schema
- gives nonsense relationships
- suggests invalid charts

Then use a **deterministic fallback recommender**.

---

## 1.5 Rendering & Export Layer

### Canonical `chart_spec`
A single **chart specification schema** should drive:
- frontend chart rendering
- export rendering
- historical reproduction

### Export Pipeline
Background workers generate:
- **PPTX**
- **XLSX**
- **PDF**

Artifacts are stored in **Supabase Storage** and downloaded via **signed URLs**.

---

# 2) End-to-End Product Flow

## 2.1 Upload Flow

1. User uploads **CSV/XLSX**
2. File stored in Supabase Storage
3. Ingestion job created
4. Backend reads file + extracts columns
5. Column metadata stored as JSON
6. JSON sent to AI service with system prompt
7. AI returns:
   - which columns relate
   - what chart to use
   - how to visualize
8. System converts recommendations into chart specs
9. Charts are rendered
10. Export package is created
11. User can preview, save, and download

---

# 3) Phase-wise Implementation Plan

---

## Phase 0: Product and NFR Contract

### Freeze Product Rules
Before coding, finalize:

- Max upload size
- Supported file types
- Free vs paid chart limits
- Export availability by plan
- Latency targets
- Retry behavior
- Retention policy
- Cost budget per user

### Explicit V1 Exclusions
Do **not** include in V1:
- collaborative editing
- multi-dataset joins
- advanced BI dashboarding
- team workspaces
- live DB connectors

---

## Phase 1: Foundation (Blocking)

### Setup
- Create **Supabase dev / staging / prod**
- Configure **RLS by default**
- Add secrets strategy
- Setup envs
- Setup project structure

### Entitlement Model
Need a central plan model:
- free
- paid
- admin/internal

### Required Outputs
- auth works
- storage works
- RLS works
- billing-ready schema exists

---

## Phase 2: Ingestion and Profiling

### Goal
Turn uploaded files into a clean machine-readable profile.

### Responsibilities
- file validation
- MIME/type checking
- size validation
- CSV/XLSX parsing
- sheet selection for XLSX
- schema inference
- data type inference
- null percentage analysis
- cardinality analysis
- numeric distribution summary
- date detection
- categorical detection

### Output
Store:
- normalized dataset metadata
- inferred column types
- profile summary
- parsing warnings
- row/column count

### Error Taxonomy
Need clear error classes:
- invalid file
- corrupted file
- unsupported encoding
- empty file
- too large
- parse failure
- unsafe sheet structure

---

## Phase 3: AI Recommendation Service

### Goal
Turn structured dataset profile into meaningful visualization recommendations.

### AI Contract
Input:
- dataset summary
- columns
- data types
- profile metrics
- optional user prompt

Output:
- candidate relations
- chart type
- title suggestion
- explanation
- confidence

### Validation Layer
Must validate:
- referenced columns actually exist
- chart type is valid for those columns
- aggregation is legal
- no duplicate nonsense suggestions

### Fallback Engine
If AI fails, use rule-based logic:

Examples:
- numeric + categorical → bar chart
- date + numeric → line chart
- numeric + numeric → scatter plot
- category share → pie / donut
- distribution → histogram / box plot

---

## Phase 4: Visualization and History

### Goal
Persist and render chart recommendations reliably.

### System Flow
- AI recommendation saved
- chart specs generated
- charts rendered in app
- chart history stored
- user can revisit prior uploads

### Required History Data
Save:
- upload timestamp
- dataset name
- chart specs
- export links
- AI version
- job status
- plan at time of generation

### Quota Enforcement
Must be **atomic**.

#### Rules
- Free user: **max 5 charts**
- Paid user: **9+ charts**

This should be enforced in backend logic, **not only UI**.

---

## Phase 5: Export Engine

### Goal
Generate professional downloadable artifacts.

### Outputs
- **PPTX** → charts + titles + comparison notes
- **XLSX** → structured sheet with visuals / summary metadata
- **PDF** → report-ready visual export

### Export Rules
Each export should contain:
- chart title
- chart image
- compared columns
- AI rationale (short)
- dataset reference
- export timestamp

### Storage
Generated files stored in Supabase Storage:
- signed download links
- checksum validation
- artifact metadata

---

## Phase 6: Scale Hardening

### Goal
Make the system production-safe under load.

### Required Systems
- queue state machine
- retries
- dead-letter handling
- workload isolation
- concurrency controls
- backpressure controls

### Workload Separation
Separate worker concerns:
- ingestion worker
- AI worker
- export worker

This avoids one heavy export blocking all uploads.

---

## Phase 7: Security and Governance

### Security Requirements
- RLS verification
- tenant isolation
- signed URL access only
- secure secret management
- webhook verification

### AI Safety / Privacy
Before sending to AI:
- redact sensitive columns if needed
- avoid sending unnecessary raw data
- send profile summaries instead of full dataset where possible

### Governance
Need:
- delete account workflow
- delete dataset workflow
- retention policy
- audit logging
- failure investigation logs

---

## Phase 8: Observability and Release

### Monitoring
Add:
- Sentry
- structured logs
- job metrics
- queue health dashboard
- export success/failure metrics
- AI latency/cost metrics

### Release Strategy
- feature flags
- staged rollout
- canary testing
- kill switches
- rollback plan

### Testing
Must include:
- unit tests
- integration tests
- contract tests
- RLS tests
- load tests
- failure injection tests

---

# 4) Parallelization Map

## Strict Dependency Chain
**Foundation → Ingestion → AI → Visualization → Export**

## Can Run in Parallel After Foundation
- Billing / entitlements
- Security baseline
- Observability instrumentation

## Can Start Early Once Ingestion Exists
- AI prompt contract
- validator schema
- export template design
- job telemetry

## Best Engineering Rule
Build **small vertical slices**, but keep architecture **job-based from day one**.

---

# 5) Recommended Tech Stack

## Frontend
- **Next.js**
- **TypeScript**
- **Tailwind CSS**
- **Recharts**

## Backend / API
- **Next.js Route Handlers**
- **Supabase JS SDK**
- **Zod** for schema validation

## Parsing
- **papaparse** for CSV
- **xlsx** for XLSX

## Exports
- **pptxgenjs** for PowerPoint
- **xlsx** for Excel generation
- **PDF renderer** for report export

## Background Jobs
### MVP
- DB-backed jobs in Supabase/Postgres

### Upgrade Path
- adapter-ready queue abstraction for future dedicated queue

## Billing
- **Stripe**
- subscription projection table in Supabase

## Monitoring
- **Sentry**
- structured logging
- metrics dashboards

---

# 6) Verification Checklist

Use this as the acceptance gate before calling V1 production-ready.

## Upload & Parsing
- [ ] Every upload creates a dataset record
- [ ] Every upload creates an ingestion job
- [ ] Files are traceable with IDs
- [ ] CSV and XLSX parsing works reliably
- [ ] Bad files fail safely

## AI Layer
- [ ] AI responses always validate against schema
- [ ] Invalid AI output falls back safely
- [ ] Recommended charts match column types
- [ ] AI outputs are versioned and auditable

## Visualization
- [ ] Chart specs render correctly in UI
- [ ] History restores charts correctly
- [ ] Same spec reproduces same chart

## Entitlements
- [ ] Free plan blocked at 5 charts
- [ ] Paid plan allowed beyond free tier
- [ ] Quotas enforced in backend atomically

## Export Engine
- [ ] PPTX opens correctly
- [ ] XLSX opens correctly
- [ ] PDF opens correctly
- [ ] Export matches chart spec
- [ ] Download links are signed and valid

## Security
- [ ] Cross-tenant access blocked by RLS
- [ ] Storage access is scoped correctly
- [ ] Sensitive data handling is validated

## Reliability
- [ ] Retry paths work
- [ ] Dead-letter path works
- [ ] Failed jobs are inspectable
- [ ] Progress tracking is correct

## Scale
- [ ] P95 latency meets target
- [ ] Queue fairness is maintained
- [ ] Large uploads do not crash workers
- [ ] AI cost per tenant remains sustainable

---

# 7) Production Engineering Notes (Important)

## Key Principle
Do **not** let AI become your system of truth.

AI should only do:
- recommendation
- suggestion
- interpretation

System logic should always remain deterministic.

## Golden Rule
Keep this separation:

- **Raw data** = truth
- **Profiles** = machine-readable summary
- **AI output** = suggestion
- **chart_spec** = executable contract
- **exports** = derived artifacts

That separation will save you when the product grows.

---

# 8) Final Recommended Execution Order

If building this properly, follow this order:

1. **Supabase foundation**
2. **Upload + storage**
3. **CSV/XLSX parsing**
4. **Column profiling**
5. **AI recommendation JSON contract**
6. **Chart spec schema**
7. **Frontend visualization**
8. **History persistence**
9. **Quota enforcement**
10. **Export engine**
11. **Billing**
12. **Scale hardening**
13. **Observability**
14. **Security review**
15. **Launch**

---

# 9) Bottom Line

This architecture is **correct for a scalable product** because it separates:

- user interaction
- ingestion
- AI reasoning
- rendering
- exports
- history
- entitlements
- scale controls

That means it can start as an MVP and still grow into a real SaaS product without collapsing later.
