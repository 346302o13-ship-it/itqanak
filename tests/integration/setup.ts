const destructiveTestAcknowledgement = "isolated-test-database";

function isLoopbackOrComposeHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "postgres";
}

function assertIsolatedIntegrationDatabase(): void {
  const rawUrl = process.env.TEST_DATABASE_URL;
  if (rawUrl === undefined) return;

  if (process.env.ITQANAK_INTEGRATION_DATABASE !== destructiveTestAcknowledgement) {
    throw new Error(
      "Integration tests mutate their database. Set ITQANAK_INTEGRATION_DATABASE=isolated-test-database only for a disposable database.",
    );
  }

  const url = new URL(rawUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (
    !isLoopbackOrComposeHost(url.hostname) ||
    !/(?:^|[_-])(test|ci|e2e)(?:$|[_-])/iu.test(databaseName)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must point to a disposable localhost/Compose database whose name contains test, ci, or e2e.",
    );
  }
}

assertIsolatedIntegrationDatabase();
