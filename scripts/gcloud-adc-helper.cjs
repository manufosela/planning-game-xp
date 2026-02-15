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

module.exports = {
  buildGcloudAdcPrintTokenCommand,
  buildGcloudAdcLoginCommand,
};
