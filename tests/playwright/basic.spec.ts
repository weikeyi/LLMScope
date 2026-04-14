import { test, expect } from '@playwright/test';

test('basic web UI functionality', async ({ page }) => {
  // 访问 Web UI 主页
  await page.goto('/');

  // 检查页面标题
  await expect(page).toHaveTitle('LLMScope');

  // 检查会话列表是否存在
  await expect(page.locator('data-testid=session-list')).toBeVisible();

  // 检查筛选控件是否存在
  await expect(page.locator('data-testid=filter-controls')).toBeVisible();

  // 检查操作按钮是否存在
  await expect(page.locator('data-testid=action-buttons')).toBeVisible();

  // 测试刷新按钮
  await page.click('data-testid=refresh-button');
  await page.waitForLoadState('networkidle');

  // 测试导出按钮
  await page.click('data-testid=export-button');
  // 等待导出对话框出现
  await expect(page.locator('data-testid=export-dialog')).toBeVisible();
  await page.click('data-testid=export-cancel');
});
