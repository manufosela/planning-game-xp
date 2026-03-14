/**
 * @pgv2/domain — Sprint entity type definitions
 */

export interface Sprint {
  sprintId: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  year?: number;
  locked?: boolean;
  totalDevPoints?: number;
  totalBizPoints?: number;
}
