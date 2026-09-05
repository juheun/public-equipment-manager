export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}
