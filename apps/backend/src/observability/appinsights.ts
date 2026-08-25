import { config } from '../config/env';

// Application Insights must be started before the modules it instruments, which
// is why index.ts imports this first. It is a no-op when the connection string
// is absent, so local development is unaffected.
const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

if (connectionString) {
  // Required lazily so the SDK is only loaded when it is actually configured.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const appInsights = require('applicationinsights');

  appInsights
    .setup(connectionString)
    .setAutoCollectConsole(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setSendLiveMetrics(false)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .start();

  appInsights.defaultClient.context.tags[
    appInsights.defaultClient.context.keys.cloudRole
  ] = 'documind-api';

  process.stdout.write(
    `Application Insights enabled (env=${config.NODE_ENV})\n`,
  );
}

export {};
