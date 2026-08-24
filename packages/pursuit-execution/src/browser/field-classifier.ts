import type { AttestationClass } from '@opportunityos/core';

export interface AtsFieldDescriptor {
  label?: string;
  name?: string;
  type?: string;
  autocomplete?: string;
}

function haystack(field: AtsFieldDescriptor): string {
  return [field.label, field.name, field.type, field.autocomplete].filter(Boolean).join(' ').toLowerCase();
}

export function classifyAtsField(field: AtsFieldDescriptor): AttestationClass {
  const text = haystack(field);
  if (/sponsor|work authorization|authorized to work|citizen|immigration|visa/.test(text)) return 'LEGAL';
  if (/background|criminal|conviction/.test(text)) return 'BACKGROUND_CHECK';
  if (/relocat|travel/.test(text)) return 'RELOCATION_TRAVEL';
  if (/salary|compensation|pay rate|hourly rate|desired pay/.test(text)) return 'COMPENSATION';
  if (/availability|start date|hours per week/.test(text)) return 'AVAILABILITY';
  if (/gender|race|ethnicity|veteran|disability|pronoun/.test(text)) return 'DEMOGRAPHIC_EEO';
  if (/video|loom|work sample|public post|portfolio task/.test(text)) return 'PUBLICATION_VIDEO_WORK_SAMPLE';
  return 'ORDINARY';
}
