import { AsyncLocalStorage } from "async_hooks";

const tenantStorage = new AsyncLocalStorage();

export function withTenantContext(tenantId, callback) {
  return tenantStorage.run({ tenantId }, callback);
}

export function getTenantContext() {
  return tenantStorage.getStore() || null;
}

export function getCurrentTenantId() {
  const store = tenantStorage.getStore();
  return store?.tenantId || null;
}
