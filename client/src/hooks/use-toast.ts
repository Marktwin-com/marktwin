import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 300
export const DEFAULT_TOAST_DURATION = 4000
export const DESTRUCTIVE_TOAST_DURATION = 8000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const autoDismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

export function toastDurationForVariant(variant?: ToasterToast["variant"]) {
  return variant === "destructive" ? DESTRUCTIVE_TOAST_DURATION : DEFAULT_TOAST_DURATION
}

function clearAutoDismiss(toastId: string) {
  const timeout = autoDismissTimeouts.get(toastId)
  if (timeout) clearTimeout(timeout)
  autoDismissTimeouts.delete(toastId)
}

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        state.toasts.forEach((toast) => clearAutoDismiss(toast.id))
        return {
          ...state,
          toasts: [],
        }
      }
      clearAutoDismiss(action.toastId)
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

export function subscribeToToastState(listener: (state: State) => void) {
  listeners.push(listener)
  listener(memoryState)
  return () => {
    const index = listeners.indexOf(listener)
    if (index > -1) listeners.splice(index, 1)
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function dismissToast(toastId?: string) {
  if (toastId) clearAutoDismiss(toastId)
  else memoryState.toasts.forEach((item) => clearAutoDismiss(item.id))
  dispatch({ type: "DISMISS_TOAST", toastId })
}

function scheduleAutoDismiss(toastId: string, duration: number) {
  clearAutoDismiss(toastId)
  if (!Number.isFinite(duration) || duration <= 0) return
  autoDismissTimeouts.set(toastId, setTimeout(() => {
    autoDismissTimeouts.delete(toastId)
    dismissToast(toastId)
  }, duration))
}

type Toast = Omit<ToasterToast, "id">

function toast(props: Toast) {
  const id = genId()
  const duration = props.duration ?? toastDurationForVariant(props.variant)

  const update = (next: ToasterToast) => {
    const nextDuration = next.duration ?? toastDurationForVariant(next.variant)
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...next, duration: nextDuration, id },
    })
    scheduleAutoDismiss(id, nextDuration)
  }
  const dismiss = () => dismissToast(id)

  memoryState.toasts.forEach((item) => {
    clearAutoDismiss(item.id)
    addToRemoveQueue(item.id)
  })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      duration,
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })
  scheduleAutoDismiss(id, duration)

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    return subscribeToToastState(setState)
  }, [])

  return {
    ...state,
    toast,
    dismiss: dismissToast,
  }
}

export { useToast, toast }
