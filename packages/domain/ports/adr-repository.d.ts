import { ADR } from '../entities/adr';

export interface AdrRepository {
  getAdrs(projectId: string): Promise<ADR[]>;
  getAdr(projectId: string, adrId: string): Promise<ADR | null>;
  saveAdr(projectId: string, adr: ADR): Promise<void>;
  deleteAdr(projectId: string, adrId: string): Promise<void>;
}
