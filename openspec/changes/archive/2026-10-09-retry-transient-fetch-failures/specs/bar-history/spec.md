## ADDED Requirements

### Requirement: Open BYMADATA failures separate outages from answers

The Open BYMADATA adapter SHALL report a failed history request with one machine-readable reason:

- `request-failed` when the request could not be completed, timed out or its body could not be read, or the provider answered HTTP 5xx, 408 or 429: the provider may answer if asked again;
- `request-rejected` when the provider answered any other non-success HTTP status;
- `provider-error` when the provider answered with a status other than `ok` or `no_data`;
- `invalid-response` when the body is not JSON, or is not a well-formed, aligned history with supported timestamps.

A `no_data` answer SHALL remain a successful result with no bars.

#### Scenario: a server error is a request failure

- **WHEN** the provider answers HTTP 503, 429 or 408
- **THEN** the adapter fails with reason `request-failed`

#### Scenario: a client error is a rejection

- **WHEN** the provider answers HTTP 404
- **THEN** the adapter fails with reason `request-rejected`

#### Scenario: a body that is not JSON is an invalid response

- **WHEN** the provider answers HTTP 200 with a body that is not JSON
- **THEN** the adapter fails with reason `invalid-response`
