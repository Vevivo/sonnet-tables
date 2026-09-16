# Contributing

Use an issue to describe a reproducible problem or discuss a substantial change. Include the source room link when it is relevant, the behavior you observed and the behavior you expected. Public DIDs and message links are enough; never attach a key or vault.

Before opening a pull request:

1. Keep the change focused on one problem.
2. Add a regression test for changed protocol or state behavior.
3. Run `pnpm check` and `pnpm build`.
4. If the browser interface changed, also check the static build with your own `SONNET_API_BASE`.
5. Explain the user-visible effect and any remaining limits.

Do not turn missing history into an empty or successful state. Do not infer membership, acceptance, eligibility or a winner from a display label. Retain the original signed bytes and source links when changing the data model.

Tests should use generated local identities and mocked transports. Do not post to live contest rooms from tests or CI.

Third-party licenses and attribution must stay with their corresponding files.
