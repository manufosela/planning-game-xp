function buildPreEnvironmentGuidance() {
  return [
    'Para PRE es recomendable usar un proyecto separado de PROD (clon/snapshot) cuando ya tengas datos reales.',
    'Si esta es la primera instalación, no necesitas clonar nada todavía.',
    'Puedes usar la misma configuración temporalmente y separar PRE más adelante.',
    'npm run pre incluye una verificación que bloquea si PRE=PROD.',
  ];
}

function shouldConfigurePreNowByDefault() {
  return false;
}

module.exports = {
  buildPreEnvironmentGuidance,
  shouldConfigurePreNowByDefault,
};
