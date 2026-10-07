export type WorkbenchReadState = "LOADING" | "READY" | "EMPTY" | "ERROR" | "UNAUTHORIZED" | "UNAVAILABLE";

export function workbenchReadFailure(error: unknown): WorkbenchReadState {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 0 || status === 404 || status === 410 || status === 503) return "UNAVAILABLE";
  return "ERROR";
}

export function workbenchReadSucceeded(state: WorkbenchReadState): boolean {
  return state === "READY" || state === "EMPTY";
}

export async function readWorkbenchPanel<T>(
  read: () => Promise<T>,
  isEmpty: (value: T) => boolean,
  isCurrent: () => boolean,
  receive: (value: T) => void,
  setState: (state: WorkbenchReadState) => void,
): Promise<void> {
  setState("LOADING");
  try {
    const value = await read();
    if (!isCurrent()) return;
    receive(value);
    setState(isEmpty(value) ? "EMPTY" : "READY");
  } catch (error) {
    if (isCurrent()) setState(workbenchReadFailure(error));
  }
}
