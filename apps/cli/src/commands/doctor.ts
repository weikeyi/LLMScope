import type { LLMScopeConfig, ResolvedConfig } from '@llmscope/config';

import { resolveCommandConfig } from './shared.js';

export interface DoctorCheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

const formatDoctorCheck = (check: DoctorCheckResult): string => {
  return `[${check.ok ? 'ok' : 'fail'}] ${check.label}: ${check.detail}`;
};

export const runDoctorCommand = async (
  command: {
    configFilePath?: string;
    configOverrides: LLMScopeConfig;
  },
  runDoctor: (config: ResolvedConfig) => Promise<{
    ok: boolean;
    checks: DoctorCheckResult[];
  }>,
): Promise<void> => {
  const report = await runDoctor(
    resolveCommandConfig(command.configOverrides, command.configFilePath),
  );

  for (const check of report.checks) {
    console.log(formatDoctorCheck(check));
  }

  console.log(`Doctor overall status: ${report.ok ? 'ok' : 'failed'}`);

  if (!report.ok) {
    process.exitCode = 1;
  }
};
