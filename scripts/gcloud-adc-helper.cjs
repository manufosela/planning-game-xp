function withAccount(command, accountEmail) {
  const account = String(accountEmail || '').trim();
  if (!account) return command;
  return `${command} --account ${account}`;
}

function buildGcloudAdcPrintTokenCommand(accountEmail) {
  return withAccount('gcloud auth application-default print-access-token', accountEmail);
}

function buildGcloudAdcLoginCommand(accountEmail) {
  return withAccount('gcloud auth application-default login', accountEmail);
}

function buildGcloudAdcLoginNoBrowserCommand(accountEmail) {
  const base = 'gcloud auth application-default login --no-browser --scopes=https://www.googleapis.com/auth/cloud-platform';
  return withAccount(base, accountEmail);
}

module.exports = {
  buildGcloudAdcPrintTokenCommand,
  buildGcloudAdcLoginCommand,
  buildGcloudAdcLoginNoBrowserCommand,
};
