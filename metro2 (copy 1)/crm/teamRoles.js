export const TEAM_ROLE_PRESETS = [
  {
    id: 'analyst',
    label: 'Credit Analyst',
    description: 'Audits Metro-2 issues, prepares compliant dispute drafts.',
    permissions: ['consumers', 'letters', 'reports']
  },
  {
    id: 'closer',
    label: 'Sales Closer',
    description: 'Runs NEPQ consults, updates leads, and tracks agreements.',
    permissions: ['contacts', 'tasks', 'reports']
  },
  {
    id: 'attorney',
    label: 'Attorney',
    description: 'Escalates FCRA/FDCPA matters and reviews dispute evidence.',
    permissions: ['consumers', 'letters', 'reports', 'tasks']
  },
  {
    id: 'success',
    label: 'Client Success',
    description: 'Supports clients post-onboarding and tracks fulfillment tasks.',
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
  return TEAM_ROLE_PRESETS.map(({ id, label, description, permissions }) => ({
    id,
    label,
    description,
    permissions: Array.from(new Set(permissions || []))
  }));
}
