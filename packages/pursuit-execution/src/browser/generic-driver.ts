import type {
  AuthorizedPursuitAction,
  BrowserFormSnapshot,
  BrowserPursuitDriver,
  BrowserSubmissionResult,
  FormField,
  PursuitTarget,
} from '@opportunityos/core';
import { classifyAtsField } from './field-classifier.ts';
import { detectAtsChallenge } from './challenge-detector.ts';

export interface AtsPageLike {
  url(): string;
  content(): Promise<string>;
  locator(selector: string): {
    count(): Promise<number>;
    nth(index: number): { evaluate<T>(fn: (element: Element) => T): Promise<T> };
  };
}

export interface AtsSessionFactory {
  open(targetUrl: string, sessionRef?: string): Promise<AtsPageLike>;
  close(): Promise<void>;
}

interface ExtractedField {
  label?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  autocomplete?: string | undefined;
  required?: boolean | undefined;
}

function normalizeField(field: ExtractedField, index: number): FormField {
  const key = field.name?.trim() || `field_${index}`;
  return {
    fieldKey: key,
    ...(field.label ? { label: field.label } : {}),
    ...(field.type ? { inputType: field.type } : {}),
    required: Boolean(field.required),
    attestationClass: classifyAtsField(field),
  };
}

export class GenericAtsPlaywrightDriver implements BrowserPursuitDriver {
  constructor(private readonly sessions: AtsSessionFactory) {}

  async inspectForm(target: PursuitTarget): Promise<BrowserFormSnapshot> {
    const page = await this.sessions.open(target.url);
    try {
      const html = await page.content();
      const challenge = detectAtsChallenge({ text: html, url: page.url() });
      if (challenge) throw new Error(challenge);
      const locator = page.locator('input, select, textarea');
      const count = await locator.count();
      const fields: FormField[] = [];
      for (let index = 0; index < count; index += 1) {
        const extracted = await locator.nth(index).evaluate((element) => {
          const input = element as HTMLInputElement;
          const id = input.id;
          const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : undefined;
          return {
            label: label || input.getAttribute('aria-label') || input.getAttribute('placeholder') || input.name || undefined,
            name: input.name || id || undefined,
            type: input.getAttribute('type') || element.tagName.toLowerCase(),
            autocomplete: input.getAttribute('autocomplete') || undefined,
            required: input.required || input.getAttribute('aria-required') === 'true',
          };
        });
        fields.push(normalizeField(extracted, index));
      }
      return { fields };
    } finally {
      await this.sessions.close();
    }
  }

  async submitApplication(action: AuthorizedPursuitAction): Promise<BrowserSubmissionResult> {
    if (action.mode !== 'LIVE_AUTHORIZED') {
      return { outcome: 'FAILED', reason: 'LIVE_AUTHORIZED_MODE_REQUIRED' };
    }
    return {
      outcome: 'FAILED',
      reason: 'GENERIC_ATS_WRITE_DRIVER_REQUIRES_PROVIDER_IMPLEMENTATION',
    };
  }
}
