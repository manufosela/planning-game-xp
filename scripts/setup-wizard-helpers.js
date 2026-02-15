export function resolveEmailProviderFromChoice(choice) {
  const map = {
    '1': 'msgraph',
    '2': 'smtp',
    '3': 'sendgrid',
    '4': 'none'
  };
  return map[choice] || 'none';
}

export function buildSecretSetCommands(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `printf %s '${String(value).replace(/'/g, "'\\''")}' | firebase functions:secrets:set ${key}`);
}

export function shouldShowBriefingForAction(action) {
  return action === 'full';
}

export function mergePreClientConfig(baseClient, preOverrides) {
  return {
    ...(baseClient || {}),
    ...(preOverrides || {})
  };
}
