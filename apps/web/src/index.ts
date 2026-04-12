import process from 'node:process';

export type {
  ObservationFilters,
  ObservationPageData,
  ObservationUiOptions,
  ObservationUiServer,
  ObservationUiServerOptions,
} from './types.js';
export {
  clearSessions,
  deleteSession,
  exportSessions,
  loadObservationPageData,
  toObservationFilters,
} from './server/api-client.js';
export {
  createObservationUiServer,
  parseObservationUiArgs,
} from './server/index.js';
export { renderObservationPage } from './ui/layout.js';

import {
  createObservationUiServer,
  parseObservationUiArgs,
} from './server/index.js';

export const runObservationUiCli = async (args: string[]): Promise<void> => {
  const server = createObservationUiServer(parseObservationUiArgs(args));
  await server.start();
  const address = server.getAddress();

  console.log(
    `LLMScope observation UI listening on http://${address.host}:${address.port}`,
  );
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  runObservationUiCli(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown observation UI error.';
    console.error(message);
    process.exitCode = 1;
  });
}
