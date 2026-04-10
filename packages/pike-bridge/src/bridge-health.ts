/**
 * Bridge Health and Diagnostics
 *
 * Health checking, version detection, and diagnostic reporting.
 * These methods use child_process or RPC to query Pike availability.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import type { PikeVersionInfo, ProtocolInfo } from './types.js';
import type { BridgeHealthCheck, InternalBridgeOptions } from './bridge-options.js';

/**
 * Check if the Pike executable is available by spawning `pike --version`.
 */
export async function checkPike(pikePath: string): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn(pikePath, ['--version']);
    proc.on('close', code => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get Pike version via RPC to the running subprocess.
 */
export async function getVersionInfo(
  sendRequest: <T>(method: string, params: Record<string, unknown>) => Promise<T>,
  debugLog: (message: string) => void
): Promise<PikeVersionInfo | null> {
  debugLog('Getting Pike version via RPC...');
  try {
    const result = await sendRequest<PikeVersionInfo>('get_version', {});
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debugLog(`getVersionInfo failed: ${message}`);
    return null;
  }
}

/**
 * Get protocol info via RPC.
 */
export async function getProtocolInfo(
  sendRequest: <T>(method: string, params: Record<string, unknown>) => Promise<T>,
  debugLog: (message: string) => void
): Promise<ProtocolInfo | null> {
  debugLog('Getting protocol info via RPC...');
  try {
    const result = await sendRequest<ProtocolInfo>('get_protocol_info', {});
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debugLog(`getProtocolInfo failed: ${message}`);
    return null;
  }
}

/**
 * Get the Pike version string by spawning `pike --version`.
 */
export async function getVersion(
  pikePath: string,
  debugLog: (message: string) => void
): Promise<string | null> {
  debugLog('Getting Pike version...');
  return new Promise(resolve => {
    const proc = spawn(pikePath, ['--version']);
    let output = '';
    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    proc.on('close', code => {
      debugLog(`Pike --version exited with code ${code}, output: "${output.trim()}"`);
      if (code === 0) {
        const match = output.match(/Pike v(\d+\.\d+)/);
        resolve(match?.[1] ?? null);
      } else {
        resolve(null);
      }
    });
    proc.on('error', err => {
      debugLog(`Pike --version error: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Perform a comprehensive health check.
 */
export async function healthCheck(
  options: InternalBridgeOptions,
  debugLog: (message: string) => void
): Promise<BridgeHealthCheck> {
  debugLog('Performing health check...');

  const result: BridgeHealthCheck = {
    pikeAvailable: false,
    pikeVersion: null,
    analyzerExists: false,
    analyzerPath: options.analyzerPath,
    canStart: false,
  };

  // Check if Pike executable is available
  try {
    const pikeVersion = await getVersion(options.pikePath, debugLog);
    result.pikeVersion = pikeVersion;
    result.pikeAvailable = pikeVersion !== null;

    if (!result.pikeAvailable) {
      result.error = `Pike executable not found at "${options.pikePath}". Please install Pike or configure the correct path.`;
      debugLog(`Health check failed: ${result.error}`);
      return result;
    }

    debugLog(`Pike version ${pikeVersion} detected`);
  } catch (err) {
    result.error = `Error checking Pike: ${err instanceof Error ? err.message : String(err)}`;
    debugLog(`Health check failed: ${result.error}`);
    return result;
  }

  // Check if analyzer script exists
  try {
    result.analyzerExists = fs.existsSync(options.analyzerPath);
    if (!result.analyzerExists) {
      result.error = `Analyzer script not found at "${options.analyzerPath}". The Pike LSP server requires this file.`;
      debugLog(`Health check failed: ${result.error}`);
      return result;
    }
    debugLog(`Analyzer script found at ${options.analyzerPath}`);
  } catch (err) {
    result.error = `Error checking analyzer: ${err instanceof Error ? err.message : String(err)}`;
    debugLog(`Health check failed: ${result.error}`);
    return result;
  }

  // All checks passed
  result.canStart = true;
  debugLog('Health check passed - bridge can start');
  return result;
}
