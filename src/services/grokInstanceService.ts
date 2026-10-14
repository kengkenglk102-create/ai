import { invoke } from '@tauri-apps/api/core';
import { createPlatformInstanceService } from './platform/createPlatformInstanceService';

const service = createPlatformInstanceService('grok');

export const getInstanceDefaults = service.getInstanceDefaults;
export const listInstances = service.listInstances;
export const createInstance = service.createInstance;
export const updateInstance = service.updateInstance;
export const deleteInstance = service.deleteInstance;
export const startInstance = service.startInstance;
export const stopInstance = service.stopInstance;
export const closeAllInstances = service.closeAllInstances;
export const openInstanceWindow = service.openInstanceWindow;

export interface GrokInstanceLaunchInfo {
  instanceId: string;
  userDataDir: string;
  launchCommand: string;
  /** 非致命提示（如 invalid_grant 需Ủy quyền lại）；有命令时仍可展示/执行 */
  warning?: string | null;
}

/** 仅 CLI 未安装/路径无效时展示安装引导 */
export function isGrokCliMissingError(error: unknown): boolean {
  const text = String(error ?? '').toLowerCase();
  return (
    text.includes('Không phát hiện thấy grok cli') ||
    text.includes('Đường dẫn grok cli không tồn tại') ||
    text.includes('Vui lòng cài đặt qua script cài đặt chính thức trước') ||
    (text.includes('grok cli') &&
      (text.includes('Không tồn tại') ||
        text.includes('not found') ||
        text.includes('Chưa kiểm tra') ||
        text.includes('Không thể thực thi')))
  );
}

/** token 吊销 / 需Ủy quyền lại（不应引导安装 CLI） */
export function isGrokReauthError(error: unknown): boolean {
  const text = String(error ?? '').toLowerCase();
  return (
    text.includes('invalid_grant') ||
    text.includes('refresh token has been revoked') ||
    text.includes('refresh_token trống') ||
    text.includes('access_denied') ||
    text.includes('Ủy quyền lại')
  );
}

export interface GrokCliStatus {
  available: boolean;
  binaryPath?: string | null;
  configuredPath?: string | null;
  version?: string | null;
  source?: string | null;
  message?: string | null;
  checkedAt: number;
}

export async function getGrokCliStatus(): Promise<GrokCliStatus> {
  return await invoke('grok_get_cli_status');
}

export async function updateGrokCliRuntimeConfig(
  grokCliPath?: string | null,
): Promise<GrokCliStatus> {
  return await invoke('grok_update_cli_runtime_config', {
    grokCliPath: grokCliPath?.trim() || null,
  });
}

export async function executeGrokCliInstallCommand(
  terminal?: string,
): Promise<void> {
  await invoke('grok_execute_cli_install_command', {
    terminal: terminal ?? null,
  });
}

export async function getGrokInstanceLaunchCommand(
  instanceId: string,
  options?: {
    workingDir?: string | null;
    applyWorkingDirOverride?: boolean;
    /** 指定账号时启动命令使用该账号独立 GROK_HOME */
    accountId?: string | null;
  },
): Promise<GrokInstanceLaunchInfo> {
  return await invoke('grok_get_instance_launch_command', {
    instanceId,
    workingDir: options?.workingDir?.trim() || null,
    applyWorkingDirOverride: options?.applyWorkingDirOverride ?? false,
    accountId: options?.accountId?.trim() || null,
  });
}

export async function executeGrokInstanceLaunchCommand(
  instanceId: string,
  terminal?: string,
  options?: {
    workingDir?: string | null;
    applyWorkingDirOverride?: boolean;
    accountId?: string | null;
  },
): Promise<string> {
  return await invoke('grok_execute_instance_launch_command', {
    instanceId,
    terminal: terminal ?? null,
    workingDir: options?.workingDir?.trim() || null,
    applyWorkingDirOverride: options?.applyWorkingDirOverride ?? false,
    accountId: options?.accountId?.trim() || null,
  });
}
