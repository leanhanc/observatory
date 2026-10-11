# Design

## Serving the prerendered pages: Railpack's static Astro mode

Railpack serves a statically built Node project with Caddy when it detects a static framework. It detects an Astro project with `output: 'static'` and serves its output directory, `dist`. The `web` service sets the build command `bun run build` and no start command (a custom start command turns the mode off), so Railpack runs the build and starts Caddy on `dist`. No dependency and no server code are added.

Railpack uses a `Caddyfile` at the repository root instead of its template. The root `Caddyfile` resolves a request with `try_files {path} {path}.html {path}/index.html`, and the build writes `dist/lines/<tradingLineId>/index.html`, so `/lines/<tradingLineId>` serves its prerendered page and `/` serves `index.html`. It has no fallback to `/index.html`, so a line the snapshot does not have answers 404, not the home page with status 200. It also answers `/health` with 200.

- https://docs.railway.com/builds/railpack
- https://railpack.com/languages/node (static sites, custom start command, custom Caddyfile)
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/Caddyfile.template

## Build-time bucket access

Railway makes service variables available during Railpack builds, so the `web` service gets the same `ref(historyBars, ...)` storage variables as `analysis-run`, plus `OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE=false`. The build reads them in the `latest-snapshot` Astro integration through Vite's `loadEnv`, where process variables win over `.env`. Only the build reads them: Caddy serves files and never touches the bucket, and the client bundle has no storage configuration.

- https://docs.railway.com/guides/frontend-environment-variables#build-time-vs-runtime

## Watch paths

Railway's watch paths are gitignore-style patterns matched from the repository root; a commit that changes no matching file creates no deployment. Each service watches what its build or start command reads:

- `web`: `src/web`, `src/analysis` (the snapshot schema and storage), `src/server/bar-history-storage-configuration` (the build resolves the bucket with it), `astro.config.ts`, `Caddyfile`, `package.json`, `bun.lock` and `tsconfig.json`.
- `analysis-run`: `src/analysis`, `src/server`, `package.json`, `bun.lock` and `tsconfig.json`.

Both exclude `*.test.ts` files, which neither build nor run reads. `openspec/`, `docs/` and `.railway/` deploy nothing: `railway config apply` applies IaC changes itself. A change to `src/analysis`, `package.json` or `bun.lock` deploys both, which is what it can change.

- https://docs.railway.com/builds/build-configuration#configure-watch-paths

## Redeploying after a run: `serviceInstanceDeployV2`

After a successful bucket write, the Analysis Run calls the Public API's `serviceInstanceDeployV2(serviceId, environmentId)`, which starts a new deployment, with a new build, of the commit the `web` service already deploys. The build then reads the new `latest.json`. A failed build leaves the previous deployment serving.

The credential is a project token, scoped to one environment of one project, sent in the `Project-Access-Token` header. It is the narrowest token that can deploy, and Lean sets it by hand in `OBSERVATORY_RAILWAY_TOKEN`; the IaC declares it with `preserve()` so `railway config apply` keeps the value set in Railway. The service and environment IDs are reference variables to the `web` service's `RAILWAY_SERVICE_ID` and `RAILWAY_ENVIRONMENT_ID`, so no ID is written in the repository.

The request has a 20-second timeout and no retry. The Public API advises retrying a mutation only when no response arrived, the next run deploys again, and a deploy can be started by hand. Railway's GraphQL API reports failures, including authorization failures, as an `errors` array in an HTTP 200 response, so the response body decides success, not the status.

A dry run with `--output` writes no snapshot to the bucket and does not redeploy. A request that fails, or a missing variable, logs a warning and leaves the run's outcome and exit status as they are: the snapshot is written, and the page build reads it whenever the service next deploys.

- https://docs.railway.com/integrations/api (endpoint, project tokens, errors, retries)
- https://docs.railway.com/integrations/api/manage-services#deploy-a-service
- https://docs.railway.com/variables/reference (reference variables, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`)
- https://docs.railway.com/infrastructure-as-code/reference (service variable references, `preserve()`)

## Domain

Railway IaC does not declare generated service domains, so Lean generates the `web` service's Railway domain by hand.

- https://docs.railway.com/infrastructure-as-code/reference#custom-domains
