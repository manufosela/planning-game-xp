function resolveInstanceName(argv = [], env = process.env) {
  const cliName = String(argv[2] || '').trim();
  if (cliName) return cliName;
  const envName = String(env.INSTANCE || '').trim();
  return envName;
}

module.exports = {
  resolveInstanceName,
};
