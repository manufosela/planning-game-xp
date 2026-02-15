import { describe, it, expect } from 'vitest';

const {
  buildGcloudAdcPrintTokenCommand,
  buildGcloudAdcLoginCommand,
  buildGcloudAdcLoginNoBrowserCommand,
} = await import('../../scripts/gcloud-adc-helper.cjs');

describe('gcloud adc helper', () => {
  it('should build default commands without account', () => {
    expect(buildGcloudAdcPrintTokenCommand('')).toBe('gcloud auth application-default print-access-token');
    expect(buildGcloudAdcLoginCommand('')).toBe('gcloud auth application-default login');
  });

  it('should append account when provided', () => {
    expect(buildGcloudAdcPrintTokenCommand('dev@example.com'))
      .toBe('gcloud auth application-default print-access-token --account dev@example.com');
    expect(buildGcloudAdcLoginCommand('dev@example.com'))
      .toBe('gcloud auth application-default login --account dev@example.com');
  });

  it('should build no-browser login command with required scope', () => {
    expect(buildGcloudAdcLoginNoBrowserCommand('dev@example.com'))
      .toBe('gcloud auth application-default login --no-browser --scopes=https://www.googleapis.com/auth/cloud-platform --account dev@example.com');
  });
});
