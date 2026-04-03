import type { Services } from '../services/index.js';

type MutableRuntimeServices = Pick<
  Services,
  | 'bridge'
  | 'includeResolver'
  | 'stdlibIndex'
  | 'pikeIntrospection'
  | 'globalSettings'
  | 'includePaths'
>;

export interface ServiceRuntimeContext {
  services: Services;
  update: (patch: Partial<MutableRuntimeServices>) => void;
}

export function createServiceRuntimeContext(services: Services): ServiceRuntimeContext {
  return {
    services,
    update: patch => {
      Object.assign(services, patch);
    },
  };
}
