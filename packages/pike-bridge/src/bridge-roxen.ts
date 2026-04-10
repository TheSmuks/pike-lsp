/**
 * Bridge Roxen API Methods
 *
 * Roxen-specific analysis operations: module detection, validation,
 * skeleton generation, tag/variable parsing, lifecycle callbacks,
 * RXML string extraction, and tag catalog queries.
 */

import type { RequestSender } from './bridge-analysis.js';

export async function roxenValidate(
  sender: RequestSender,
  code: string,
  filename: string,
  moduleInfo?: Record<string, unknown>
): Promise<import('./types.js').RoxenValidationResult> {
  const params: Record<string, unknown> = { code, filename };
  if (moduleInfo) {
    params['module_info'] = moduleInfo;
  }
  return sender.sendRequest<import('./types.js').RoxenValidationResult>('roxen_validate', params);
}

export async function roxenGenerateSkeleton(
  sender: RequestSender,
  moduleType: string,
  moduleName: string,
  options?: { includeDefvar?: boolean; includeComments?: boolean }
): Promise<{ code: string; moduleType: string; moduleName: string }> {
  return sender.sendRequest<{ code: string; moduleType: string; moduleName: string }>(
    'roxen_generate_skeleton',
    {
      moduleType,
      moduleName,
      includeDefvar: options?.includeDefvar ?? 1,
      includeComments: options?.includeComments ?? 1,
    }
  );
}

export async function roxenDetect(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<import('./types.js').RoxenModuleInfo> {
  const params: Record<string, unknown> = { code };
  if (filename) {
    params['filename'] = filename;
  }
  return sender.sendRequest<import('./types.js').RoxenModuleInfo>('roxen_detect', params);
}

export async function roxenParseTags(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<{ tags: import('./types.js').RXMLTag[] }> {
  const params: Record<string, unknown> = { code };
  if (filename) {
    params['filename'] = filename;
  }
  return sender.sendRequest<{ tags: import('./types.js').RXMLTag[] }>('roxen_parse_tags', params);
}

export async function roxenParseVars(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<{ variables: import('./types.js').ModuleVariable[] }> {
  const params: Record<string, unknown> = { code };
  if (filename) {
    params['filename'] = filename;
  }
  return sender.sendRequest<{ variables: import('./types.js').ModuleVariable[] }>(
    'roxen_parse_vars',
    params
  );
}

export async function roxenGetCallbacks(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<{ lifecycle: import('./types.js').LifecycleInfo }> {
  const params: Record<string, unknown> = { code };
  if (filename) {
    params['filename'] = filename;
  }
  return sender.sendRequest<{ lifecycle: import('./types.js').LifecycleInfo }>(
    'roxen_get_callbacks',
    params
  );
}

export async function roxenExtractRXMLStrings(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<{ strings: import('./types.js').RXMLStringResult[] }> {
  const params: Record<string, unknown> = { code };
  if (filename) {
    params['filename'] = filename;
  }
  return sender.sendRequest<{ strings: import('./types.js').RXMLStringResult[] }>(
    'roxenExtractRXMLStrings',
    params
  );
}

export async function roxenGetTagCatalog(
  sender: RequestSender,
  serverPid?: number
): Promise<import('./types.js').RXMLTagCatalogEntry[]> {
  const params: Record<string, unknown> = {};
  if (serverPid !== undefined) {
    params['server_pid'] = serverPid;
  }
  const result = await sender.sendRequest<{ tags: import('./types.js').RXMLTagCatalogEntry[] }>(
    'roxen_get_tag_catalog',
    params
  );
  return result.tags;
}
