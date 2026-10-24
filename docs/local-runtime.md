# Local Docker runtime

Status: **COMPOSE CUTOVER: PASS**, verified on 2026-09-22 at 18:16 WIB.
Daily backend/database startup is now `docker compose up -d` from the project
root. Both Compose services are running and healthy.

The original `archida-backend-runtime` and `arsipsemantik-pgvector` containers
are stopped and retained for rollback. Never start the original PostgreSQL
container while the Compose database is running on the same volume.

## Completed cutover verification

- The backups in `backups/pre-compose-cutover/20260922T105522Z` remained readable
  and matched their recorded checksums. The live baseline matched before the
  original containers were stopped and after Compose startup.
- The old backend required termination after its 30-second stop timeout
  (exit 137); PostgreSQL shut down cleanly (exit 0). Both containers were
  preserved. Ports 8000/5433 were free and no running container used the database
  volume before Compose started.
- Startup used `docker compose up -d --no-build --pull never`. The configured
  images, dependency installations, schema and application source were unchanged.
- `arsipsemantik-db-1` and `arsipsemantik-backend-1` are healthy with zero
  restarts. Database logs confirm that initialization was skipped. Only the
  Compose database is running against `arsipsemantik_pgvector_data`.
- Baseline: PostgreSQL 18.4, Alembic `a01c9e7d24b6`, pgvector 0.8.4, 703 documents,
  697 PUBLIC and 6 PRIVATE; users ADMIN=1, MAHASISWA=1, legacy student=2;
  document 7 PUBLIC, document 712 PRIVATE; missing/orphan metadata 0/0.
- Windows HTTP checks for `/`, `/api/health`, and `/api/health/db` returned 200.
  CORS responses and login preflight accept `http://127.0.0.1:5173` with
  credentials. Windows ports 8000 and 5433 are reachable. Backend resolves and
  connects to PostgreSQL at `db:5432` on `arsipsemantik_default`.
- The cache manifest matched the verified seed before inference; the tested
  model ref and offline mode remained unchanged after inference.
- The actual HTTP `/api/search` path passed for `surat keputusan rektor`, with
  method `distilbert_pgvector`, five PUBLIC results (IDs 666, 667, 345, 644, 679),
  and the real semantic/ranking fields. Verification used a temporary in-memory
  signed session for the existing MAHASISWA account, accepted by `/api/auth/me`;
  no account, authentication code or dependency override was changed. No test
  cookie/credentials were saved. The search-log row count was unchanged.
- Final logs contained no ERROR/FATAL/PANIC entries or Python tracebacks.
  Frontend files were unchanged; Vite was not started or modified for these
  HTTP/CORS checks. No rollback was required.

## Active configuration

- Project: `arsipsemantik`; services: `db` and `backend`.
- PostgreSQL/pgvector uses the exact existing image digest, PostgreSQL 18,
  host port 5433, and the EXISTING external volume
  `arsipsemantik_pgvector_data` mounted at `/var/lib/postgresql`.
- Cluster directory: `/var/lib/postgresql/18/docker`. The startup guard checks
  `PG_VERSION`, `global/pg_control`, and `base` before invoking the image
  entrypoint. A missing/wrong cluster fails closed; it must not be initialized.
- Backend uses the existing `arsipsemantik-backend:task01-linux` image pinned to
  its inspected digest. No image build or dependency installation is performed.
  This preserves Python 3.12.14, PyTorch 2.13.0+cpu and Transformers 5.13.0.
- `C:\dev\ArsipSemantik` is mounted at `/app`; the working directory is
  `/app/backend`. Uvicorn starts automatically on port 8000, without reload.
- Both services use `arsipsemantik_default`, a Compose bridge network. Backend
  connects to `db:5432`; Windows clients can continue using `localhost:5433`.
- No legacy container names are assigned. Original containers remain available
  for rollback. Both new services use `restart: unless-stopped` and
  `pull_policy: never`; missing pinned images must cause failure.
- PostgreSQL health uses `pg_isready`; backend waits for a healthy database.
  Backend health uses the existing `GET /api/health/db` endpoint (`SELECT 1`).
  A healthy backend does not by itself verify semantic inference/model loading.
- Model cache is the external volume `arsipsemantik_hf_cache`, mounted at
  `/root/.cache/huggingface`. `HF_HUB_OFFLINE=1` prevents downloading a new model.
  Preserve this offline setting until a separate model update is approved.
- No migrations, seeds, authentication changes, or model/algorithm changes are
  part of this configuration.

## Environment and secrets

The private root `.env` contains only `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, and `COMPOSE_DATABASE_URL`, copied/derived from the verified
existing runtime. `.env.example` contains placeholders, not usable credentials.
The existing `.gitignore` rule `.env` covers root and backend environment files.

The backend loads `backend/.env` using Compose's raw env-file mode. Current
values are unquoted and were checked for exact preservation. If changing its
format later, remember raw mode preserves quotes literally; revalidate privately.
Compose overrides only the application `DATABASE_URL`, using
`COMPOSE_DATABASE_URL`. Credentials, SQLAlchemy driver, database and query
options are preserved; only host/port become `db:5432`.

Do not modify `backend/.env` solely to support Docker. Do not rotate credentials
or change `APP_ENV`, session settings or AI settings during this migration.
Future approved credential changes must keep both environment files consistent.
Shell environment variables can override root `.env` interpolation; remove
unintended overrides before running Compose. Never print expanded configuration,
full connection URLs, passwords, or `SESSION_SECRET_KEY`.

Quiet syntax validation (safe before cutover):

```powershell
Set-Location C:\dev\ArsipSemantik
docker compose config --quiet
```

No Git repository metadata was present when these files were prepared. No commit
was made. If Git is initialized later, verify `git check-ignore .env backend/.env`
and ensure neither file is listed by `git ls-files` before committing. Do not use
`git add -f` for environment files.

Preparation verification on 2026-09-22: quiet Compose syntax validation passed;
both pinned images resolve locally; application environment preservation and
database URL/credential consistency passed private checks. External volume names,
mounts, ports, command and shared-network configuration were checked. The guard
passed shell syntax validation, accepted the current cluster, and rejected a
missing cluster; its PostgreSQL startup command was never executed during tests.
The original container IDs, start times, restart counts, mounts, network and port
configuration remained unchanged. Only the original database container references
the database volume. No Compose containers or project network were created.
Those preparation checks did not start Compose. Database backup verification
subsequently passed, followed by the live cutover verification recorded above.
No backup restore was performed.

## Model cache: one-time seed procedure

Seed status: VERIFIED on 2026-09-22, without stopping the current runtime.
The new external volume contains 545,365,121 regular-file bytes, 22 regular files
and 6 symlinks. Source manifests agreed before/after the archive copy; the
destination manifest matched exactly. Manifest SHA-256:
`38f1861066f122d31195c640c19bc8963a1130ae00c3b6f5e4b0a5e2db81ceb4`.
The temporary helper containers were removed; the original cache is untouched.
Do not rerun the creation procedure against this already seeded volume.

Expected source: `archida-backend-runtime:/root/.cache/huggingface`.
Expected tested model ref: `9e948656420019310c5334dfcc3dd086c67d405a`.

The following procedure can run while the current runtime remains active. It:

1. Rejects incomplete downloads, dangling links, and links outside the cache.
2. Hashes the source tree, captures a tar archive, and hashes the source again.
3. Proceeds only if both manifests agree and the expected model ref is present.
4. Creates a NEW dedicated volume; refuses to overwrite any existing volume.
5. Extracts via a temporary offline helper with a read-only root filesystem.
   This helper mounts only the cache volume, never the PostgreSQL volume.
6. Compares destination hashes, sizes, modes, directories and symlink targets.
   The helper containers remove themselves; the verified cache volume remains.

Run from the project root using the available Windows Python 3.12. Binary tar
data is passed through Python file handles, not a PowerShell text pipeline.
No model is imported and no download is performed. If the source changes or
verification fails, stop. Do not start Compose with an unverified cache.
If a failed attempt left a volume, retain it for inspection; use a separately
approved fresh volume name and update Compose rather than overwriting it.

```powershell
$seedPython = @'
import hashlib, json, pathlib, subprocess, sys, tempfile

SOURCE = 'archida-backend-runtime'
VOLUME = 'arsipsemantik_hf_cache'
IMAGE = 'arsipsemantik-backend:task01-linux@sha256:7e3e9a078674f97cd02c45e597f253be91fba89833116c2a117d3045da62a669'
EXPECTED_REF = '9e948656420019310c5334dfcc3dd086c67d405a'
FLAGS = subprocess.CREATE_NO_WINDOW

def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True,
                            text=True, creationflags=FLAGS)
    if result.returncode:
        raise RuntimeError('Docker operation failed; output suppressed. Inspect the operation privately.')
    return result.stdout

MANIFEST = r'''
import hashlib, json, os, pathlib, stat, sys
root = pathlib.Path(sys.argv[1]).resolve()
entries = {}
for path in sorted(root.rglob('*')):
    relative = path.relative_to(root).as_posix()
    before = path.lstat()
    mode = stat.S_IMODE(before.st_mode)
    if path.is_symlink():
        if not path.resolve(strict=True).is_relative_to(root):
            raise RuntimeError('Cache symlink escapes the cache root')
        entries[relative] = ['link', os.readlink(path), mode]
    elif path.is_dir():
        entries[relative] = ['directory', mode]
    elif path.is_file():
        if path.name.endswith('.incomplete'):
            raise RuntimeError('Incomplete model download present')
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        after = path.lstat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise RuntimeError('Source file changed during hashing')
        entries[relative] = ['file', before.st_size, digest, mode]
    else:
        raise RuntimeError('Unexpected cache file type')
ref = (root / 'hub/models--cahya--distilbert-base-indonesian/refs/main').read_text().strip()
print(json.dumps({'entries': entries, 'ref': ref}, sort_keys=True))
'''

def source_manifest():
    return json.loads(run(['docker','exec','-i',SOURCE,'python','-B','-',
                           '/root/.cache/huggingface'], MANIFEST))

def helper_base(readonly=False):
    mount = 'type=volume,src='+VOLUME+',dst=/cache,volume-nocopy'
    if readonly:
        mount += ',readonly'
    return ['docker','run','--rm','-i','--pull=never','--network','none',
            '--read-only','--name','arsipsemantik-hf-cache-seed',
            '--mount',mount]

try:
    if VOLUME in run(['docker','volume','ls','--format','{{.Name}}']).splitlines():
        raise RuntimeError('Destination volume already exists; refusing to overwrite')
    before = source_manifest()
    if before['ref'] != EXPECTED_REF:
        raise RuntimeError('Source model reference differs from the tested reference')
    with tempfile.TemporaryFile() as archive:
        result = subprocess.run(['docker','exec',SOURCE,'tar','-C',
            '/root/.cache/huggingface','-cpf','-','.'], stdout=archive,
            stderr=subprocess.PIPE, creationflags=FLAGS)
        if result.returncode or before != source_manifest():
            raise RuntimeError('Cache was not stable during copying; defer seeding')
        run(['docker','volume','create','--label',
             'com.arsipsemantik.purpose=preserved-huggingface-cache',VOLUME])
        archive.seek(0)
        extract = 'test -z "$(ls -A /cache)" || exit 1; exec tar -xpf - -C /cache'
        result = subprocess.run(helper_base()+['--entrypoint','/bin/sh',IMAGE,
            '-ec',extract], stdin=archive, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, creationflags=FLAGS)
        if result.returncode:
            raise RuntimeError('Cache extraction failed; retain volume for inspection')
    copied = json.loads(run(helper_base(True)+['--entrypoint','python',IMAGE,
                            '-B','-','/cache'], MANIFEST))
    if copied != before:
        raise RuntimeError('Destination verification failed; do not use this cache')
    entries = copied['entries']
    print(json.dumps({'status':'VERIFIED','volume':VOLUME,'ref':copied['ref'],
        'files':sum(v[0]=='file' for v in entries.values()),
        'symlinks':sum(v[0]=='link' for v in entries.values()),
        'regular_file_bytes':sum(v[1] for v in entries.values() if v[0]=='file'),
        'manifest_sha256':hashlib.sha256(json.dumps(copied,sort_keys=True).encode()).hexdigest()}))
except Exception as error:
    print('Cache seed stopped: '+str(error), file=sys.stderr)
    sys.exit(1)
'@
$seedPython | python -B -
if ($LASTEXITCODE -ne 0) { throw 'Cache seed did not verify; do not proceed.' }
```

If active writes prevent a stable copy, the required later cutover step is to
stop the legacy backend cleanly after approval, capture its cache with
`docker cp archida-backend-runtime:/root/.cache/huggingface/. -` into a binary
temporary file using Python, seed a fresh cache volume, and perform equivalent
hash/symlink/ref validation before starting the Compose backend. `docker cp`
works with stopped containers; do not remove the source container.

## Completed cutover procedure (historical; do not repeat)

The following procedure was completed with separate approval on 2026-09-22.
Use the daily workflow for ordinary startup/shutdown and the rollback section
only if rollback is needed.

1. Obtain separate approval. Recheck pinned local images and both external
   volumes, cache verification, root `.env` consistency and quiet Compose
   validation. Confirm the original backend and database container identities.
2. Create a consistent PostgreSQL logical backup with `pg_dump` and a globals/
   roles backup with `pg_dumpall --globals-only`, using existing credentials
   privately. Save backups outside the database volume; never print passwords
   or role password hashes. Verify archive readability and preferably restore
   into a separate isolated test volume. Do not restore into the live database.
   Record agreed read-only database/table/extension baselines. Back up document
   storage under `backend/storage` and preserve the current images as well.
   A stopped legacy container sharing the volume is not a backup.
3. Stop application writes and stop the legacy backend, then stop PostgreSQL
   cleanly. These commands are for the APPROVED cutover only:

   ```powershell
   docker stop --time 60 archida-backend-runtime
   docker stop --time 60 arsipsemantik-pgvector
   ```

4. Confirm both containers are stopped and there are NO running containers
   using `arsipsemantik_pgvector_data`. Ensure ports 8000 and 5433 are free.
   Never attach/start a second PostgreSQL container against this volume while
   the original PostgreSQL container is running. Do not rely on port conflicts
   or PostgreSQL lock files as protection. If taking a physical volume backup,
   do so only after the clean stop; do not tar a live PostgreSQL data directory.
5. Keep the old containers in place. Start the new runtime:

   ```powershell
   Set-Location C:\dev\ArsipSemantik
   docker compose up -d
   docker compose ps
   ```

6. Verify the database is the existing cluster, its extensions/data baselines
   match, and `/api/health/db` succeeds. Confirm a known read-only semantic
   search and expected results using the preserved offline model. Start Vite
   and confirm the existing application behavior. No migrations or seeds.
   If validation fails, stop the new services and follow rollback below.

## Daily workflow (active)

Docker Engine must be running in Linux-container mode. Docker Desktop may run
in the background; its GUI does not need to remain visibly open. Closing the
Dashboard is different from quitting Docker Desktop/stopping the Engine.
pgAdmin is optional and is not needed to start the application.

Start database and backend:

```powershell
Set-Location C:\dev\ArsipSemantik
docker compose up -d
```

Start frontend separately in a Windows terminal:

```powershell
Set-Location C:\dev\ArsipSemantik
cd frontend
npm run dev
```

Frontend: `http://127.0.0.1:5173`. Backend: `http://127.0.0.1:8000`.
Windows Python is not the backend runtime.

Inspect, or restart backend after a source edit (from the project root):

```powershell
docker compose ps
docker compose logs --tail 100 backend
docker compose restart backend
```

Shutdown: stop Vite with Ctrl+C, then:

```powershell
Set-Location C:\dev\ArsipSemantik
docker compose stop
```

## External volume rules

`arsipsemantik_pgvector_data` and `arsipsemantik_hf_cache` are external volumes;
Compose must find them already present. Do not remove, recreate, reset, or prune
them. Do not change the PostgreSQL mount to `/var/lib/postgresql/data`.
Use `docker compose stop` for daily shutdown. Avoid `down --volumes`, volume
deletion and Docker reset/prune workflows. Docker Desktop's database storage is
not backed up merely by copying the Windows repository.

Never start the legacy PostgreSQL container while the Compose database is
running, or vice versa. The existing volume and image must stay on PostgreSQL
18; upgrades require a separate plan and verified backup.

## Rollback after an unsuccessful cutover

1. Stop Vite/application writes. From the project root, run
   `docker compose stop` and confirm the Compose PostgreSQL/backend are stopped.
   Verify no running container uses the database volume and the ports are free.
2. Start `arsipsemantik-pgvector`, then `archida-backend-runtime` using
   `docker start`. Do not delete any container or volume.
3. Restore the original manual backend launch. The original container command
   is `bash`, so starting it does not automatically start Uvicorn. Open
   `docker exec -it archida-backend-runtime bash` and run the following inside
   that shell; it restores the host route without printing credentials:

   ```bash
   python -B - <<'PY'
   import os, sys
   from dotenv import dotenv_values
   from sqlalchemy.engine import make_url
   source = dotenv_values('/app/backend/.env')['DATABASE_URL']
   os.environ['DATABASE_URL'] = make_url(source).set(
       host='host.docker.internal', port=5433
   ).render_as_string(hide_password=False)
   os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'app.main:app',
                            '--host', '0.0.0.0', '--port', '8000'])
   PY
   ```

4. Check the existing database-health endpoint and prior application behavior,
   then restart Vite. This reuses the same database data; it is not a data
   restore or point-in-time rollback. If data recovery is necessary, stop and
   plan a separate approved restore from the verified backup.
