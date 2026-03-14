import { TeamMember, TagRegistry } from '../entities/card';

export interface TeamRepository {
  getTeam(projectId: string): Promise<TeamMember[]>;
  addMember(projectId: string, member: TeamMember): Promise<void>;
  removeMember(projectId: string, memberId: string): Promise<void>;
  getTagRegistry(projectId: string): Promise<TagRegistry>;
  saveTagRegistry(projectId: string, tags: TagRegistry): Promise<void>;
}
