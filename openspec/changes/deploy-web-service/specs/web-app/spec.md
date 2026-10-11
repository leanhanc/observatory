## ADDED Requirements

### Requirement: the deployed site serves only prerendered files

The web service SHALL serve the build's prerendered output as static files, with no server process rendering pages. The build SHALL read the bucket with the storage variables available at build time. A path SHALL serve the prerendered HTML file for it, and a path without one SHALL answer 404 rather than another page.

#### Scenario: a line page

- **WHEN** the build prerendered `/lines/ggal-stock-byma-ars` as `lines/ggal-stock-byma-ars/index.html`
- **THEN** a request for `/lines/ggal-stock-byma-ars` returns that file

#### Scenario: a line without a page

- **WHEN** a request asks for `/lines/<tradingLineId>` for an ID the latest build did not prerender
- **THEN** the site answers 404, not the home page

#### Scenario: a failed build

- **WHEN** a deployment's build fails
- **THEN** the previous deployment keeps serving its pages

### Requirement: a commit deploys only the services it can change

Each Railway service SHALL watch the paths its build or start reads, so that a commit changing none of them does not deploy it. The web service SHALL watch the web app, the analysis engine and the storage configuration its build reads; the Analysis Run service SHALL watch the analysis engine and the server commands. Both SHALL watch the package manifest, lockfile and TypeScript configuration, and neither SHALL watch test files.

#### Scenario: a web-only change

- **WHEN** a commit changes only files under `src/web`
- **THEN** the web service deploys and the Analysis Run service does not

#### Scenario: a server-only change

- **WHEN** a commit changes only files under `src/server/analysis-run`
- **THEN** the Analysis Run service deploys and the web service does not

#### Scenario: a snapshot schema change

- **WHEN** a commit changes files under `src/analysis`
- **THEN** both services deploy
