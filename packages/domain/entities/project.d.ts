/**
 * @pgv2/domain — Project entity type definitions
 */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface ProjectStatuses {
  tasks?: string[];
  bugs?: string[];
}

export interface ProjectSettings {
  statuses?: ProjectStatuses;
  guidelines?: string;
  agentsGuidelines?: string;
}

export interface Project {
  projectId: string;
  name: string;
  abbreviation: string;
  description?: string;
  repoUrl?: string;
  scoringSystem?: 'linear' | 'fibonacci';
  team: {
    developers: TeamMember[];
    stakeholders: TeamMember[];
  };
  settings?: ProjectSettings;
  archived?: boolean;
  order?: number;
}
