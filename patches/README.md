# PostgreSQL connection loss

`postgres@3.4.9.patch` keeps the installed version and patches both Node entrypoints. A deferred `nextWrite` on a closed reserved connection otherwise throws outside the query promise and kills the worker. This occurred during the account-recovery collector run, even with provider cancellation and active-job draining in place.

The guard clears the deferred write and rejects pending queries with `CONNECTION_CLOSED`. It does not retry SQL, move checkpoints, hide a heartbeat failure or establish transaction continuity after a disconnect. Worker shutdown still drains jobs before closing SQL. Review/remove this backport when deliberately upgrading the driver.

Upstream defect and proposed correction: [porsager/postgres#1208](https://github.com/porsager/postgres/issues/1208), [#1209](https://github.com/porsager/postgres/pull/1209). The local change also rejects a destroyed socket. This is an application-maintained backport, not a claim that the upstream PR was merged into 3.4.9.

`tests/driver-lifecycle.test.ts` runs both entrypoints in child processes through a loopback TCP proxy to the local test database. Closing that test session reproduces the uncaught exception on unpatched 3.4.9 and produces a rejected query with the patch. The fixture refuses non-loopback database URLs. No production session is terminated. Existing database integration covers rollback isolation, cursor preservation and market evidence persistence.
