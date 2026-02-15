function formatMcpInstanceLabel(instance = {}) {
  const name = String(instance.name || '').trim() || 'unnamed';
  const projectId = String(instance.firebaseProjectId || '').trim();
  return projectId ? `${name} (${projectId})` : name;
}

function buildMcpActionOptions(instances = []) {
  const safeInstances = Array.isArray(instances) ? instances.filter(Boolean) : [];
  if (safeInstances.length === 0) {
    return [{ key: '1', action: 'create-new', label: 'Crear nueva instancia MCP' }];
  }

  return [
    { key: '1', action: 'use-existing', label: 'Usar instancia MCP existente' },
    { key: '2', action: 'create-new', label: 'Crear nueva instancia MCP' },
  ];
}

module.exports = {
  formatMcpInstanceLabel,
  buildMcpActionOptions,
};
