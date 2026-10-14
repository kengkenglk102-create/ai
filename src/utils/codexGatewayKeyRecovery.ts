import type { CodexLocalAccessState } from "../types/codexLocalAccess";

// Match the backend diagnostic only; user-facing guidance uses translation keys.
export function isCodexGatewayKeyRecoveryError(error: string | null | undefined): boolean {
  return error?.replace(/^Error:\s*/, "") ===
    "Gateway không thể phân giải API Key đến, đã giữ nguyên cấu hình cũ; vui lòng khôi phục tài khoản được tham chiếu rồi thử lại";
}

export function clearRecoveredCodexGatewayError(
  error: string,
  state: Pick<CodexLocalAccessState, "running" | "recovering" | "lastError">,
): string {
  return isCodexGatewayKeyRecoveryError(error)
    && (state.recovering || (state.running && !state.lastError)) ? "" : error;
}
