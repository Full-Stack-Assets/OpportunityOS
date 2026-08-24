import type { BrowserFormSnapshot, PreparedAnswer, PursuitExecutionStatus, PursuitTarget } from '@opportunityos/core';
import { classifyAtsField } from './field-classifier.ts';
import { detectAtsChallenge } from './challenge-detector.ts';
import type { AtsProviderAdapter, AtsProviderConfirmation } from './provider-driver.ts';

interface LocatorLike {
  count(): Promise<number>;
  nth(index: number): LocatorLike;
  first(): LocatorLike;
  evaluate<T>(fn: (element: Element) => T): Promise<T>;
  getAttribute(name: string): Promise<string | null>;
  textContent(): Promise<string | null>;
  fill(value: string): Promise<void>;
  click(): Promise<void>;
  check(): Promise<void>;
  uncheck(): Promise<void>;
  selectOption(value: string): Promise<unknown>;
  setInputFiles(path: string): Promise<void>;
}

export interface AtsWritablePage {
  url(): string;
  content(): Promise<string>;
  locator(selector: string): LocatorLike;
  getByLabel(text: string, options?: { exact?: boolean }): LocatorLike;
}

export interface AtsProviderOptions {
  resolveArtifact(ref: string): Promise<string>;
}

interface ProviderConfig {
  id: 'ashby' | 'lever' | 'greenhouse';
  hostPattern: RegExp;
  submitSelectors: string[];
}

function cssValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function inspectFields(page: AtsWritablePage): Promise<BrowserFormSnapshot> {
  const locator = page.locator('input, select, textarea');
  const count = await locator.count();
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    const descriptor = await locator.nth(index).evaluate((element) => {
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
    const fieldKey = descriptor.name?.trim() || `field_${index}`;
    fields.push({
      fieldKey,
      ...(descriptor.label ? { label: descriptor.label } : {}),
      ...(descriptor.type ? { inputType: descriptor.type } : {}),
      required: Boolean(descriptor.required),
      attestationClass: classifyAtsField(descriptor),
    });
  }
  return { fields, expectedCost: { requiresPurchase: false } };
}

async function fillAnswer(page: AtsWritablePage, answer: PreparedAnswer): Promise<void> {
  const selector = `[name="${cssValue(answer.fieldKey)}"], [id="${cssValue(answer.fieldKey)}"]`;
  let field = page.locator(selector);
  if (await field.count() === 0 && answer.prompt) field = page.getByLabel(answer.prompt, { exact: false });
  if (await field.count() === 0) throw new Error(`PAYLOAD_CHANGED:FIELD_NOT_FOUND:${answer.fieldKey}`);
  const target = field.first();
  const meta = await target.evaluate((element) => ({ tag: element.tagName.toLowerCase(), type: element.getAttribute('type')?.toLowerCase() ?? '' }));
  if (meta.tag === 'select') {
    await target.selectOption(String(answer.answer));
    return;
  }
  if (meta.type === 'checkbox' && typeof answer.answer === 'boolean') {
    if (answer.answer) await target.check(); else await target.uncheck();
    return;
  }
  if (meta.type === 'radio') {
    const labelled = page.getByLabel(String(answer.answer ?? answer.prompt), { exact: false });
    if (await labelled.count() === 0) throw new Error(`PAYLOAD_CHANGED:RADIO_OPTION_NOT_FOUND:${answer.fieldKey}`);
    await labelled.first().check();
    return;
  }
  await target.fill(String(answer.answer ?? ''));
}

function evidenceRefs(providerId: string, externalId: string, url: string): string[] {
  const refs = [`${providerId}://application/${externalId}`];
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') refs.push(parsed.toString());
  } catch {
    // Provider identity receipt remains available even when URL parsing fails.
  }
  return refs;
}

async function durableConfirmation(page: AtsWritablePage, providerId: string): Promise<AtsProviderConfirmation | undefined> {
  const url = page.url();
  const urlMatch = url.match(/\/applications?\/([A-Za-z0-9_-]{4,})/i);
  if (urlMatch?.[1]) return { externalId: urlMatch[1], evidenceRefs: evidenceRefs(providerId, urlMatch[1], url) };

  for (const selector of ['[data-application-id]', '[data-testid="application-id"]', '[id*="application-id"]']) {
    const locator = page.locator(selector);
    if (await locator.count() === 0) continue;
    const first = locator.first();
    const candidate = (await first.getAttribute('data-application-id')) ?? (await first.textContent());
    const normalized = candidate?.trim();
    if (normalized && /^[A-Za-z0-9_-]{4,}$/.test(normalized)) {
      return { externalId: normalized, evidenceRefs: evidenceRefs(providerId, normalized, url) };
    }
  }
  return undefined;
}

function provider(config: ProviderConfig, options: AtsProviderOptions): AtsProviderAdapter<AtsWritablePage> {
  return {
    id: config.id,
    matches: (url) => {
      try { return config.hostPattern.test(new URL(url).hostname); } catch { return false; }
    },
    inspect: async (page: AtsWritablePage, _target: PursuitTarget) => inspectFields(page),
    detectChallenge: async (page: AtsWritablePage): Promise<PursuitExecutionStatus | null> => detectAtsChallenge({ text: await page.content(), url: page.url() }),
    fill: fillAnswer,
    upload: async (page: AtsWritablePage, artifactRef: string) => {
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      if (count === 0) throw new Error('PAYLOAD_CHANGED:UPLOAD_FIELD_NOT_FOUND');
      if (count > 1) throw new Error('NEEDS_INPUT:AMBIGUOUS_UPLOAD_FIELD');
      const filePath = await options.resolveArtifact(artifactRef);
      if (!filePath) throw new Error(`NEEDS_INPUT:ARTIFACT_UNRESOLVED:${artifactRef}`);
      await fileInputs.first().setInputFiles(filePath);
    },
    submit: async (page: AtsWritablePage) => {
      for (const selector of config.submitSelectors) {
        const button = page.locator(selector);
        if (await button.count() > 0) { await button.first().click(); return; }
      }
      throw new Error('PAYLOAD_CHANGED:SUBMIT_CONTROL_NOT_FOUND');
    },
    confirm: async (page: AtsWritablePage) => durableConfirmation(page, config.id),
  };
}

export function createDefaultAtsProviders(options: AtsProviderOptions): AtsProviderAdapter<AtsWritablePage>[] {
  return [
    provider({ id: 'ashby', hostPattern: /(^|\.)ashbyhq\.com$/i, submitSelectors: ['button[type="submit"]', 'button:has-text("Submit Application")', 'button:has-text("Submit")'] }, options),
    provider({ id: 'lever', hostPattern: /(^|\.)lever\.co$/i, submitSelectors: ['button[type="submit"]', 'button:has-text("Submit application")', 'button:has-text("Submit")'] }, options),
    provider({ id: 'greenhouse', hostPattern: /(^|\.)greenhouse\.io$/i, submitSelectors: ['button[type="submit"]', '#submit_app', 'button:has-text("Submit Application")'] }, options),
  ];
}
