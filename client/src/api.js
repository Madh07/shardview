const BASE = '/api'

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
  getModels: () => req('GET', '/models'),
  getSchema: (model) => req('GET', `/models/${model}/schema`),
  getRecords: (model, params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
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
    const q = opts.includeNull ? '?includeNull=true' : ''
    return req('GET', `/stale-pivots${q}`)
  },
}
