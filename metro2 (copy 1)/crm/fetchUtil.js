import nodeFetch from 'node-fetch';

export const fetchFn = globalThis.fetch || nodeFetch;
