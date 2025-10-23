export const TEAM_ROLE_PRESETS = [
  {
    id: 'analyst',
    label: 'Credit Analyst',
    description: 'Audits Metro-2 issues, prepares compliant dispute drafts.',
    descriptionEs: 'Audita reportes Metro-2 y prepara borradores de disputas en cumplimiento.',
    permissions: ['consumers', 'letters', 'reports']
  },
  {
    id: 'closer',
    label: 'Sales Closer',
    description: 'Runs NEPQ consults, updates leads, and tracks agreements.',
    descriptionEs: 'Dirige consultas NEPQ, actualiza leads y registra acuerdos.',
    permissions: ['contacts', 'tasks', 'reports']
  },
  {
    id: 'attorney',
    label: 'Attorney',
    description: 'Escalates FCRA/FDCPA matters and reviews dispute evidence.',
    descriptionEs: 'Escala asuntos FCRA/FDCPA y revisa evidencia de disputas.',
    permissions: ['consumers', 'letters', 'reports', 'tasks']
  },
  {
    id: 'success',
    label: 'Client Success',
    description: 'Supports clients post-onboarding and tracks fulfillment tasks.',
    descriptionEs: 'Da soporte a clientes después del onboarding y rastrea tareas de cumplimiento.',
    permissions: ['contacts', 'tasks']
  }
];

export const DEFAULT_TEAM_ROLE_ID = TEAM_ROLE_PRESETS[0].id;

export function resolveTeamRole(roleId) {
  const normalized = String(roleId || '').trim().toLowerCase();
  return TEAM_ROLE_PRESETS.find(role => role.id === normalized) || TEAM_ROLE_PRESETS[0];
}

export function sanitizeTeamRole(roleId) {
  return resolveTeamRole(roleId).id;
}

export function getTeamRolePreset(roleId) {
  return resolveTeamRole(roleId);
}

export function listTeamRoles() {
  return TEAM_ROLE_PRESETS.map(({ id, label, description, descriptionEs, permissions }) => ({
    id,
    label,
    description,
    descriptionEs,
    permissions: Array.from(new Set(permissions || []))
  }));
}
