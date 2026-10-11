## ADDED Requirements

### Requirement: the command redeploys the web service after writing the snapshot

After the run writes its snapshot to the bucket, the `analyze` command SHALL ask Railway's Public API once to deploy the web service, using a project token from `OBSERVATORY_RAILWAY_TOKEN` and the IDs from `OBSERVATORY_WEB_SERVICE_ID` and `OBSERVATORY_WEB_ENVIRONMENT_ID`. It SHALL log the requested deployment's ID at info.

The request SHALL NOT change the run's outcome or exit status. When a variable is missing, the command SHALL NOT send a request and SHALL log a warning naming the missing variables. When the request fails, times out, or Railway answers with an HTTP error or a GraphQL error, the command SHALL log a warning with the reason. The request SHALL NOT be retried. A failed run and a dry run with `--output` SHALL NOT request a deploy. Logs SHALL NOT contain the token.

#### Scenario: the deploy is requested

- **WHEN** the snapshot is written to the bucket and the three variables are set
- **THEN** the command sends `serviceInstanceDeployV2` for the web service and environment with the token in the `Project-Access-Token` header, logs the returned deployment ID, and exits `0`

#### Scenario: the token is not set

- **WHEN** the snapshot is written and `OBSERVATORY_RAILWAY_TOKEN` is missing
- **THEN** the command sends no request, warns that the web redeploy is not configured and names `OBSERVATORY_RAILWAY_TOKEN`, and exits `0`

#### Scenario: Railway refuses the request

- **WHEN** Railway answers with HTTP 200 and a GraphQL error `Not Authorized`
- **THEN** the command warns that the web redeploy failed with `Not Authorized` and exits `0`

#### Scenario: the request fails

- **WHEN** Railway answers HTTP 503, or the request throws
- **THEN** the command warns that the web redeploy failed, with the status or the error, and exits `0`

#### Scenario: a dry run

- **WHEN** the run writes its snapshot to a local file with `--output`
- **THEN** no deploy is requested

#### Scenario: the token stays out of the log

- **WHEN** the token holds a sentinel value and the request fails
- **THEN** no log entry contains the sentinel
