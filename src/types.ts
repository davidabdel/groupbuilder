export type Standing = 'E' | 'MS' | '' | string;
export type PublisherType = 'RP' | 'P' | 'AP' | '' | string;

export interface Publisher {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  standing: Standing;
  publisherType: PublisherType;
  familyId: string;
  mobile?: string;
  email?: string;
  
  // Custom editable fields
  canBeOverseer: boolean;
  canBeAssistant: boolean;
  canSeparateFromFamily: boolean;
  activityScore: number; // 1-5
}

export interface Family {
  id: string;
  familyName: string;
  memberIds: string[];
}

export interface Group {
  id: string;
  name: string;
  overseerId: string | null;
  assistantId: string | null;
  publisherIds: string[];
}

export interface GroupResult {
  groups: Group[];
  unassignedIds: string[];
}
