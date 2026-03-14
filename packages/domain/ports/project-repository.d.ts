import { Project } from '../entities/project';

export interface ProjectRepository {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  archiveProject(id: string): Promise<void>;
}
