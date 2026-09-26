import { type FieldErrors, type ActionErrorCode } from './errors'

export type ActionSuccess<T> = { ok: true; data: T }

export type ActionFailure = {
  ok: false
  error: { code: ActionErrorCode; message: string; fieldErrors?: FieldErrors }
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export function actionOk<T>(data: T): ActionSuccess<T> {
  return { ok: true, data }
}

export function actionFail(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: FieldErrors
): ActionFailure {
  return fieldErrors
    ? { ok: false, error: { code, message, fieldErrors } }
    : { ok: false, error: { code, message } }
}

export function isActionFailure<T>(result: ActionResult<T>): result is ActionFailure {
  return !result.ok
}
