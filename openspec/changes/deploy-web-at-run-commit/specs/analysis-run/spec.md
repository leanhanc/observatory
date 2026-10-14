## MODIFIED Requirements

### Requirement: the command redeploys the web service after writing the snapshot

After the run writes its snapshot to the bucket, the `analyze` command SHALL ask Railway's Public API once to deploy the web service, using a project token from `OBSERVATORY_RAILWAY_TOKEN` and the IDs from `OBSERVATORY_WEB_SERVICE_ID` and `OBSERVATORY_WEB_ENVIRONMENT_ID`. It SHALL log the requested deployment's ID at info.

The deploy SHALL be pinned to the commit the run itself runs, read from `RAILWAY_GIT_COMMIT_SHA` and sent as `commitSha`: that commit's code wrote the snapshot, so the web build reads the snapshot schema its code expects. When `RAILWAY_GIT_COMMIT_SHA` is not set, the command SHALL request the deploy without a commit, so Railway deploys the web service's current commit, and SHALL say in the info log that the deploy is not pinned to a commit. The info log SHALL carry the commit, or `null` when the deploy is not pinned.

The request SHALL NOT change the run's outcome or exit status. When a variable is missing, the command SHALL NOT send a request and SHALL log a warning naming the missing variables. When the request fails, times out, or Railway answers with an HTTP error or a GraphQL error, including an unknown commit, the command SHALL log a warning with the reason. The request SHALL NOT be retried. A failed run and a dry run with `--output` SHALL NOT request a deploy. Logs SHALL NOT contain the token.

#### Scenario: the deploy is requested

- **WHEN** the snapshot is written to the bucket, the three variables are set, and `RAILWAY_GIT_COMMIT_SHA` is `d0beb8f5c55b36df7d674d55965a23b8d54ad69b`
- **THEN** the command sends `serviceInstanceDeployV2` for the web service and environment with `commitSha` `d0beb8f5c55b36df7d674d55965a23b8d54ad69b` and the token in the `Project-Access-Token` header, logs the returned deployment ID and the commit, and exits `0`

#### Scenario: the run's commit is unknown

- **WHEN** the snapshot is written, the three variables are set, and `RAILWAY_GIT_COMMIT_SHA` is not set
- **THEN** the command sends `serviceInstanceDeployV2` for the web service and environment without `commitSha`, logs the returned deployment ID, says the deploy is not pinned to a commit, and exits `0`

#### Scenario: the token is not set

- **WHEN** the snapshot is written and `OBSERVATORY_RAILWAY_TOKEN` is missing
- **THEN** the command sends no request, warns that the web redeploy is not configured and names `OBSERVATORY_RAILWAY_TOKEN`, and exits `0`

#### Scenario: Railway refuses the request

- **WHEN** Railway answers with HTTP 200 and a GraphQL error `Not Authorized`
- **THEN** the command warns that the web redeploy failed with `Not Authorized` and exits `0`

#### Scenario: Railway does not know the commit

- **WHEN** Railway answers with HTTP 200 and a GraphQL error `Commit not found`
- **THEN** the command warns that the web redeploy failed with `Commit not found` and exits `0`

#### Scenario: the request fails

- **WHEN** Railway answers HTTP 503, or the request throws
- **THEN** the command warns that the web redeploy failed, with the status or the error, and exits `0`

#### Scenario: a dry run

- **WHEN** the run writes its snapshot to a local file with `--output`
- **THEN** no deploy is requested

#### Scenario: the token stays out of the log

- **WHEN** the token holds a sentinel value and the request fails
- **THEN** no log entry contains the sentinel
