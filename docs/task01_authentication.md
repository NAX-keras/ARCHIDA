# TASK 01 — Backend authentication and authorization

## Phase 0 audit and decisions

- Users: BIGINT generated primary key; name/email VARCHAR(150) NOT NULL;
  email UNIQUE; password_hash TEXT NOT NULL; role VARCHAR(30) NOT NULL;
  created_at TIMESTAMP NOT NULL DEFAULT now(). No NIM or role constraint.
  documents.uploaded_by is an optional users.id foreign key.
- Migration chain in source was linear through fb8334e327df. No previous auth.
- Local PostgreSQL at configured port 5433 refused the read-only connection;
  deployed schema, revision and existing users could not be verified.
- FastAPI/Starlette/HTTPX existed. SessionMiddleware required the absent
  itsdangerous package. No password hashing library was installed.
- Frontend used hardcoded login/navigation without authenticated state.
- Add only nullable unique users.nim VARCHAR(32). Preserve email NOT NULL/UNIQUE,
  existing rows, roles and password hashes. Migration does not grant any role.
- Use Starlette SessionMiddleware, itsdangerous and Argon2id via argon2-cffi.
  Authorization resolves the database user on every authenticated request.
- Strict trusted Origin validation protects POST/PUT/PATCH/DELETE, including
  login/logout. Missing, null, foreign and duplicate Origin headers are rejected.
- Register development routes only when APP_ENV is exactly development.
- No fundamental conflict with the approved design was found in source.

## Configuration and activation

Run backend commands from backend/. Supply the existing DATABASE_URL privately.
Never copy example database credentials over a working connection string.

Required new settings:

- SESSION_SECRET_KEY: an independently generated random secret of at least
  32 characters, supplied by environment or the ignored backend/.env. Do not
  commit, print in logs, or reuse a database/password credential.
- SESSION_MAX_AGE_SECONDS: defaults to 28800 (8 hours).
- TRUSTED_FRONTEND_ORIGINS: JSON array of exact origins. Defaults to
  http://localhost:5173 and http://127.0.0.1:5173. No wildcard or trailing slash.
- APP_ENV=development enables HTTP development cookies and admin-protected dev
  routes. The old APP_ENV=local is deliberately NOT a development alias: it
  uses Secure cookies and does not expose dev routes.
- Any non-development deployment requires HTTPS. Configure the actual trusted
  HTTPS frontend origin and VITE_API_BASE_URL before building the frontend.

The existing backend/.env was not changed. A missing/short session secret prevents
startup. The example intentionally contains a non-working secret placeholder.

Frontend uses credentials: include. During local development, open both services
with the same hostname: localhost with localhost, or 127.0.0.1 with 127.0.0.1.
The default API host follows the frontend's local hostname on port 8000.
VITE_API_BASE_URL overrides this. SameSite=Lax assumes frontend/backend are same
site; cross-site deployment is not introduced by this task.

After reviewing the actual database revision/schema and choosing the target DB,
apply migration a01c9e7d24b6 with the normal Alembic upgrade process. This task
does not automatically migrate or provision the existing project database.

Development-only account provisioning, after migration:

```powershell
python scripts/create_dev_user.py --role ADMIN --name "Demo Admin" --email admin@example.test
python scripts/create_dev_user.py --role MAHASISWA --name "Demo Mahasiswa" --email student@example.test --nim 001234567890
```

These example identifiers are not shipped accounts. The script prompts privately
for a new local ARCHIDA password (12–1024 characters), hashes it with Argon2id,
and refuses to overwrite an existing email/NIM. MAHASISWA still requires email
because the existing schema requires it; login uses NIM, never that email.
NIM is an ASCII digit string of up to 32 digits; leading zeros are preserved.
Do not use a SIAKAD password. No SSO integration or public registration exists.

Legacy role values such as student are not silently promoted or rewritten.
Only ADMIN and MAHASISWA can authenticate; legacy data requires explicit review.
Admin email comparison is case-insensitive; if legacy case variants are
ambiguous, login fails instead of choosing an account.

## Session and HTTP contract

- POST /api/auth/login: JSON identifier/password only, no role input.
  Identifiers containing @ look up ADMIN email; numeric identifiers look up
  MAHASISWA NIM. Wrong credentials return the same generic 401.
- GET /api/auth/me: current database identity, 401 for missing/invalid/expired
  session, missing user, or unsupported role.
- POST /api/auth/logout: clears the browser cookie, idempotent without a session.
- Session cookie: archida_session; HttpOnly; SameSite=Lax; Path=/; host-only;
  explicit max-age; Secure outside development. Payload contains user_id only.
- Expiry is checked by the signed timestamp. The pinned Starlette version does
  not renew an unmodified session on reads, so the limit is absolute from login.
- Cookie is signed, not encrypted. No role, password or secret is stored in it.
- This is a stateless prototype session: logout removes the browser's cookie;
  previously copied signed cookies have no server-side revocation registry and
  remain usable until expiry (or signing-key rotation/user removal). No Redis,
  refresh-token system or session table was introduced.
- Unsafe direct HTTP clients must send an approved Origin as browser fetch does.
  Origin is a CSRF check, never identity or authorization.
- Auth validation errors do not echo request credentials. Auth/data responses
  use no-store where identity/data is returned.

## Authorization matrix

| Endpoint | Anonymous | MAHASISWA | ADMIN |
|---|---|---|---|
| /, /api/health, /api/health/db | Allowed | Allowed | Allowed |
| login/logout | Allowed with trusted Origin | Allowed | Allowed |
| /api/auth/me | 401 | Own identity | Own identity |
| search/list/category-summary | 401 | PUBLIC only | PUBLIC + PRIVATE |
| detail/download/preview via download | 401 | PUBLIC; PRIVATE 404 | PUBLIC + PRIVATE |
| upload/delete/change access | 401 | 403 | Allowed |
| /api/dev/db-test, insert-dummy-document | 401 in development | 403 in development | Allowed in development |
| /api/dev/* outside development | 404 with trusted Origin | 404 | 404 |

The obsolete insert-dummy-user endpoint was removed in favor of the CLI.
No static storage mount or direct-file API was added. Existing path confinement
and PDF checks remain in place. Missing metadata is not treated as PUBLIC for
MAHASISWA. Search access filtering occurs in SQL before LIMIT/reranking; request
parameters cannot grant include_private access. Counts/category summaries use
the same visibility policy.

## Tests and verification scope

```powershell
# backend/
python -B -m unittest discover -s tests -p test_auth_access.py -v
# frontend/
node --test tests/auth-http.test.mjs
npm run build
```

The focused backend suite uses temporary SQLite records and files, real Argon2
hash verification, actual FastAPI routes, signed sessions and pypdf extraction.
Only model inference is stubbed. A test-only SQLite adapter replaces the pgvector
operator with a cosine function to execute the search SQL and access predicates.
This is NOT proof of PostgreSQL/pgvector integration or DistilBERT inference.
Migration SQL is rendered offline; no project database migration is performed.

### Actual verification results (2026-09-16)

- PASS: focused backend suite, 35 tests, final run 7.920 seconds.
- PASS: frontend HTTP/auth suite, 8 tests, final run 169.6707 ms.
- PASS: final Vite production build, 44 modules.
- PASS: pip check, no broken requirements found.
- PASS: browser login for ADMIN and MAHASISWA against isolated test users;
  wrong-password error; anonymous deep-link guard; student admin guard;
  session restoration after reload; intended-route restoration; PUBLIC search,
  category/list and detail; PRIVATE detail 404; ADMIN list includes PRIVATE;
  backend logout and protected navigation after logout.
- FAIL / unresolved browser check: the embedded browser's PDF iframe was blank
  after loading the preview. Its download-event wait timed out after clicking
  download. This does not certify visual PDF preview or saved-file delivery.
  Actual API PDF bytes and PRIVATE denials pass the backend tests.
- FAIL: read-only connection to the configured project PostgreSQL, connection
  refused. Docker daemon was unavailable and was not started.
- NOT RUN: migration on actual PostgreSQL, inspection/provisioning of actual
  users, real pgvector operator, real DistilBERT inference, production HTTPS
  browser deployment, and legacy database-writing scripts.

The first browser harness used one SQLite connection and produced an error under
concurrent requests. The fixture now uses a temporary SQLite file with separate
pooled connections. The full suite and affected browser flows were rerun; no
server/browser error appeared in the final ADMIN login/reload checks. Temporary
servers were stopped and browser test sessions logged out.

The 23 requested backend scenarios each pass:

| # | Scenario | Result |
|---|---|---|
| 1 | ADMIN email login and authenticated cookie | PASS |
| 2 | MAHASISWA NIM login | PASS |
| 3 | Wrong, unknown and legacy credentials | PASS |
| 4 | ADMIN /me | PASS |
| 5 | MAHASISWA /me | PASS |
| 6 | Anonymous/tampered-cookie /me | PASS |
| 7 | Logout then /me 401 | PASS |
| 8 | Expired signed timestamp rejected | PASS |
| 9 | Anonymous protected endpoints 401 | PASS |
| 10 | Student upload 403 | PASS |
| 11 | Student delete 403 | PASS |
| 12 | Student access change 403 | PASS |
| 13 | Admin upload, access change and deletion | PASS |
| 14 | Student PUBLIC search, SQL filtering before LIMIT | PASS |
| 15 | Student PUBLIC list/count/summary | PASS |
| 16 | Student PRIVATE detail 404 | PASS |
| 17 | Student PRIVATE download 404 | PASS |
| 18 | Student PRIVATE range/preview/direct storage paths denied | PASS |
| 19 | Admin PRIVATE search/list | PASS |
| 20 | Admin PRIVATE detail/PDF bytes | PASS |
| 21 | PUBLIC detail/download for both roles | PASS |
| 22 | Development routes require ADMIN | PASS |
| 23 | Non-development dev routes absent, Secure cookies | PASS |

Twelve additional backend cases each PASS: CORS; CSRF; DB role changes/deleted
users; ambiguous email/browser role spoofing; credential-safe validation;
filesystem confinement; health; hybrid gate/ranking/filter regression; offline
migration/config validation; visibility immediately after access change/missing
metadata; secure development bootstrap/duplicate rejection; bootstrap environment
and required-NIM gating. Expiration uses a backdated signed timestamp, not an
eight-hour wall-clock wait.

Eight frontend cases each PASS: credentials included; protected 401 event;
403 preserves session; anonymous startup without a redirect loop; /me restore;
identifier/password-only login; wrong login without an expiry loop; server logout.
These are focused HTTP helper tests with mocked fetch, supplemented by the actual
browser checks above; they are not a full React component test suite.

### Changed file manifest

Backend modified:

- app/core/config.py
- app/main.py
- app/models/user.py
- app/api/routes/documents.py
- app/api/routes/admin_documents.py
- app/api/routes/search.py
- app/api/routes/dev_test.py
- app/services/search_service.py
- requirements.txt
- .env.example

Backend added:

- app/core/csrf.py
- app/services/auth/security.py
- app/services/auth/dependencies.py
- app/schemas/auth.py
- app/api/routes/auth.py
- alembic/versions/a01c9e7d24b6_add_user_nim.py
- scripts/create_dev_user.py
- tests/test_auth_access.py

Frontend modified:

- src/main.jsx
- src/routes/AppRoutes.jsx
- src/pages/auth/LoginPage.jsx
- src/services/api.js
- src/services/adminService.js
- src/pages/admin/AdminDashboardPage.jsx
- src/pages/student/DocumentDetailPage.jsx
- src/layouts/AdminNavbar.jsx
- src/layouts/StudentNavbar.jsx

Frontend added:

- src/auth/AuthContext.jsx
- src/auth/RequireAuth.jsx
- src/services/http.js
- src/services/authService.js
- src/components/common/LogoutButton.jsx
- tests/auth-http.test.mjs

This document was added. Build output under frontend/dist and local dependency
installation under backend/venv were also updated. No frontend package or lockfile
changed. No commit was created; this checkout has no .git directory.

The existing scripts named test_insert_document_embedding.py and
test_pgvector_similarity.py modify their target database and have old imports;
they are outside TASK 01 and are not part of the focused suite above.

## Unchanged scope and existing limitations

DistilBERT/model files, mean pooling, lexical boosts, query expansion, generic
gate, cosine/ranking formulas, Golden Pages behavior, evaluation, batch import
and dataset content remain unchanged. Search only adds access filtering and the
access_level response field. Upload records the authenticated uploader.

Existing metadata import may already have defaulted PRIVATE source rows to PUBLIC.
TASK 01 enforces the database access_level; it does not infer/reclassify production
documents or fix the out-of-scope batch importer. Review that data before exposing
the application to real users. Admin download UI placeholders also remain as-is.

The pre-existing admin response/UI treats missing metadata as Public for display,
while the new student backend policy denies it. No such document is exposed to a
student, but admin counts/labels can therefore overstate student-visible records.
The pre-existing student search landing total of 702 and evaluation figures remain
static. Existing search exceptions can include backend error details; unchanged.

SHA-256 comparison confirmed 23 reference files unchanged, including the existing
.env, all three previous migrations, document/metadata/embedding models, AI
embedding/preprocessing/PDF code, dataset workbook, stored fine-tuned model and
tokenizer files, batch/TF-IDF/regeneration scripts, evaluation data/page, frontend
package/lock files, and the reference raw PDF. Search scoring code was retained;
the search service changes are its visibility argument, SQL predicate and returned
access_level. No original archive or production user was modified.

References: Starlette SessionMiddleware implementation installed in this project;
[Argon2-cffi password hashing](https://argon2-cffi.readthedocs.io/en/stable/howto.html);
[OWASP Origin-based CSRF protection](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
