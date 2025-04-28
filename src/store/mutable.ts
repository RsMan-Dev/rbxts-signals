import { Object, Proxy } from '@rbxts/jsnatives'
import { IDataNode, makeDataNode, isListening, untrack, batch, getOwner, onCleanup } from '../index'

const objectNodes = new WeakMap<object, Record<string | symbol, IDataNode<unknown>>>()
const objectProxies = new WeakMap<object, object>()

function getNodes(obj: object): Record<string | symbol, IDataNode<unknown>> {
  let nodes = objectNodes.get(obj)
  if (!nodes) objectNodes.set(obj, (nodes = {}))
  return nodes
}

function getNode(nodes: Record<string | symbol, IDataNode<unknown>>, key: string | symbol, value?: unknown): IDataNode<unknown> {
  let node = nodes[key]
  if (!node) nodes[key] = (node = makeDataNode(value, { eq: false }))
  return node
}

const trackSelf = (obj: object) => isListening() && getNode(getNodes(obj), SELF).current()
const updateSelf = (obj: object) => getNodes(obj)[SELF]?.next(undefined)
const isWrappable = (obj: unknown): obj is object => {
  if (!typeIs(obj, 'table')) return false
  const meta = getmetatable(obj) as Record<string | symbol, unknown> | undefined
  if (meta === undefined) return true
  return false
}
const isWrapped = (obj: unknown): obj is object => {
  if (!typeIs(obj, 'table')) return false
  const meta = getmetatable(obj) as Record<string | symbol, unknown> | undefined
  if (meta === undefined || meta[PROXY] !== true) return false
  return true
}

export const RAW = {} as symbol, TRACK = {} as symbol, SELF = {} as symbol, PROXY = {} as symbol, RAW_TRACKED = {} as symbol

export function unwrap<T>(obj: T, untracks = true): T {
  if (untracks) return untrack(() => unwrap(obj, false))
  if (!isWrapped(obj)) return obj

  if (Object.isArray(obj)) {
    const newObj = [] as unknown[]
    for (const val of obj) newObj[newObj.size()] = unwrap(val)
    return newObj as T
  } else {
    const newObj = {} as Record<string | symbol, unknown>
    for (const [key, value] of Object.entries(obj))
      newObj[key as keyof typeof newObj] = unwrap(value)
    return newObj as T
  }
}

export function trackAll(obj: object): void {
  if (!isWrapped(obj)) return
  for (const value of Object.values(obj)) trackAll(value)
}

export function withWrap<T extends object>(obj: T): T {
  if (isWrapped(obj)) return obj as T // if already wrapped, return it
  const proxy = objectProxies.get(obj)
  if (proxy) return proxy as T // if already wrapped, return it
  return obj // not wrapped, return it
}

export function withoutWrap<T extends object>(obj: T, untracked = true): T {
  if (isWrapped(obj)) { // if already wrapped, return raw, or taw tracked
    if (untracked) return (obj as Record<string | symbol, unknown>)[RAW] as T
    return (obj as Record<string | symbol, unknown>)[RAW_TRACKED] as T
  }
  return obj // not wrapped, return it
}


function wrap<T>(target: T): T {
  if (!isWrappable(target)) return target // if not a table, or already wrapped, return it

  let proxy = objectProxies.get(target)
  if (proxy) return proxy as T // if already wrapped, return it

  proxy = new Proxy(target, {
    get: (target, key, proxy) => {
      if (key === RAW) return target
      if (key === TRACK) return trackSelf(target)
      if (key === RAW_TRACKED) {
        trackAll(proxy)
        return target
      }

      const nodes = getNodes(target), tracked = nodes[key as string | symbol]
      let value = tracked === undefined ? target[key as keyof typeof target] : tracked.current(false, true)

      if (tracked === undefined && isListening()) value = getNode(nodes, key as string | symbol, value).current(false, true)

      return wrap(value)
    },
    set: (target, key, value, proxy) => {
      if (key === RAW) return true
      if (key === TRACK) return true
      if (key === RAW_TRACKED) return true
      value = typeIs(value, "table") ? withoutWrap(value) : value
      const current = target[key as keyof typeof target]

      if (current === value) return true

      untrack(() => {
        batch(() => {
          if ( // both objects or both arrays, otherwise, simple setter
            typeIs(value, "table") &&
            typeIs(current, "table") &&
            Object.isArray(value) === Object.isArray(current)
          ) {
            const proxyCurrent = proxy[key as keyof typeof proxy] as Record<string | symbol, unknown>
            let anyStructuralChangeMade = false
            if (Object.isArray(value) && Object.isArray(current)) {
              const currSize = current.size(), newSize = value.size()
              for (let i = 0; i < newSize || i < currSize; i++) {
                const newVal = value[i], currVal = current[i]
                if (newVal !== currVal) proxyCurrent[i] = newVal
              }
              anyStructuralChangeMade = newSize !== currSize
            } else {
              const currentKeys = new Set(Object.keys(current))
              for (const [key, val] of Object.entries(value)) {
                const currVal = current[key as keyof typeof current]
                if (currVal !== val) proxyCurrent[key as string] = val
                if (!currentKeys.has(key as keyof typeof current) && val !== undefined) anyStructuralChangeMade = true
                else {
                  currentKeys.delete(key as keyof typeof current)
                  if (currVal === undefined) anyStructuralChangeMade = true
                }
              }
              if (currentKeys.size() > 0) {
                anyStructuralChangeMade = true
                for (const key of currentKeys) proxyCurrent[key as string] = undefined
              }
            }
            if (anyStructuralChangeMade) {
              getNode(getNodes(target), key as string | symbol, value).next(current)
              updateSelf(current)
            }
          } else {
            (target as Record<string, unknown>)[key as string] = value

            const nodes = getNodes(target), node = getNode(nodes, key as string | symbol, value)
            if (node !== undefined) node.next(value)

            updateSelf(target)
          }
        })
      })
      return true
    },
  }, {}, {
    [PROXY]: true,
  })

  objectProxies.set(target, proxy)

  return proxy as T
}

export const createMutable = <T extends object>(obj: T): T => {
  return wrap(obj)
}