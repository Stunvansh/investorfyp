export type ListEnvelope<T> = {
  data: T[]
  count: number
  next: string | null
  previous: string | null
}

export function parseListEnvelope<T>(payload: unknown): ListEnvelope<T> {
  if (Array.isArray(payload)) {
    return {
      data: payload as T[],
      count: payload.length,
      next: null,
      previous: null,
    }
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.data)) {
      return {
        data: obj.data as T[],
        count: typeof obj.count === 'number' ? obj.count : obj.data.length,
        next: (obj.next as string | null) ?? null,
        previous: (obj.previous as string | null) ?? null,
      }
    }

    if (Array.isArray(obj.value)) {
      return {
        data: obj.value as T[],
        count: obj.value.length,
        next: null,
        previous: null,
      }
    }
  }

  return {
    data: [],
    count: 0,
    next: null,
    previous: null,
  }
}
