const BASE = '/api'

// Modules outside React can read this to attach the user's pivot overrides
// to outgoing requests. The host App keeps it in sync with localStorage.
let pivotOverrideCache = []
export function setPivotOverrides(list) {
  pivotOverrideCache = Array.isArray(list) ? list.filter(Boolean) : []
}
function withPivotOverride(extra = {}) {
  if (pivotOverrideCache.length === 0) return extra
  return { ...extra, pivotOverride: pivotOverrideCache.join(',') }
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  getModels: () => {
    const params = withPivotOverride()
    const q = new URLSearchParams(params).toString()
    return req('GET', `/models${q ? `?${q}` : ''}`)
  },
  getSchema: (model) => req('GET', `/models/${model}/schema`),
  getRecords: (model, params = {}) => {
    const merged = withPivotOverride(params)
    const q = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ).toString()
    return req('GET', `/models/${model}/records${q ? `?${q}` : ''}`)
  },
  createRecord: (model, data) => req('POST', `/models/${model}/records`, data),
  updateRecord: (model, id, data) => req('PATCH', `/models/${model}/records/${id}`, data),
  updateRecords: (model, ids, data) => req('PATCH', `/models/${model}/records`, { ids, data }),
  deleteRecord: (model, id, opts = {}) =>
    req('DELETE', `/models/${model}/records/${id}${opts.cascade ? '?cascade=true' : ''}`),
  deleteRecords: (model, ids, opts = {}) =>
    req('DELETE', `/models/${model}/records`, { ids, cascade: !!opts.cascade }),
  getPivotView: (pivotModel, params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ).toString()
    return req('GET', `/pivot/${pivotModel}${q ? `?${q}` : ''}`)
  },
  syncPivot: (pivotModel, body) => req('POST', `/pivot/${pivotModel}/sync`, body),
  getStalePivots: (opts = {}) => {
    const merged = withPivotOverride()
    if (opts.includeNull) merged.includeNull = 'true'
    const q = new URLSearchParams(merged).toString()
    return req('GET', `/stale-pivots${q ? `?${q}` : ''}`)
  },
}
