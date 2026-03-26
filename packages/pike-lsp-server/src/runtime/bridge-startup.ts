import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';

export interface BridgeStartupManager {
  start: () => Promise<void>;
}

interface EnsureBridgeStartupArgs {
  bridgeManager: BridgeStartupManager;
  log: (message: string) => void;
  reportConsoleError: (message: string) => void;
  showErrorMessage?: (message: string) => void | Promise<unknown>;
}

function summarizeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

export async function ensureBridgeStartupOrThrow({
  bridgeManager,
  log,
  reportConsoleError,
  showErrorMessage,
}: EnsureBridgeStartupArgs): Promise<void> {
  try {
    await bridgeManager.start();
  } catch (err) {
    const summary = summarizeError(err);
    const userMessage =
      'Pike LSP failed to start the Pike bridge during initialization. Check the configured Pike path and analyzer script.';
    const detailedMessage = `${userMessage} (${summary})`;

    reportConsoleError(detailedMessage);
    log(`Bridge startup error during initialize: ${summary}`);

    if (showErrorMessage) {
      try {
        await showErrorMessage(userMessage);
      } catch (showError) {
        log(`Failed to show bridge startup error message: ${summarizeError(showError)}`);
      }
    }

    throw new ResponseError(ErrorCodes.InternalError, detailedMessage);
  }
}
