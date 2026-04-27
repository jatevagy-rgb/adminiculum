/**
 * Settings Service V2
 * Application settings management
 * Matching Prisma Schema V2
 */

import { prisma } from '../../prisma/prisma.service';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface UiSettings {
  theme: {
    mode: 'light' | 'dark';
    primaryColor: string;
    secondaryColor: string;
  };
  language: string;
  dateFormat: string;
}

class SettingsService {
  /**
   * Get UI settings
   */
  async getUiSettings(): Promise<UiSettings> {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: ['app_config', 'theme'] } }
    });

    const appConfig = settings.find(s => s.key === 'app_config');
    const theme = settings.find(s => s.key === 'theme');

    return {
      theme: {
        mode: (theme?.value as any)?.mode || 'light',
        primaryColor: (theme?.value as any)?.primaryColor || '#4F46E5',
        secondaryColor: (theme?.value as any)?.secondaryColor || '#6366f1'
      },
      language: 'hu',
      dateFormat: 'YYYY.MM.DD.'
    };
  }

  /**
   * Update UI settings
   */
  async updateUiSettings(updates: Partial<UiSettings>): Promise<UiSettings> {
    if (updates.theme) {
      await prisma.systemSetting.upsert({
        where: { key: 'theme' },
        update: {
          value: updates.theme
        },
        create: {
          key: 'theme',
          value: updates.theme,
          description: 'Theme settings'
        }
      });
    }

    return this.getUiSettings();
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<Record<string, unknown>> {
    const settings = await prisma.systemSetting.findMany();
    const result: Record<string, unknown> = {};

    for (const s of settings) {
      result[s.key] = s.value;
    }

    return result;
  }

  /**
   * Get single setting
   */
  async getSetting(key: string): Promise<unknown> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key }
    });

    return setting?.value;
  }

  /**
   * Update single setting
   */
  async updateSetting(key: string, value: JsonValue): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as any },
      create: { key, value: value as any }
    });
  }
}

export default new SettingsService();
