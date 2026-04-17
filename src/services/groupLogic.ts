import { Publisher, Family, Group, GroupResult } from '../types';

export function generateGroups(
  publishers: Publisher[],
  groupsCount: number,
): GroupResult {
  const publishersMap = new Map(publishers.map(p => [p.id, p]));
  
  // 1. Group by family
  const familiesMap = new Map<string, string[]>();
  publishers.forEach(p => {
    const fid = p.familyId || p.id; // Fallback to personal ID if no family ID
    if (!familiesMap.has(fid)) familiesMap.set(fid, []);
    familiesMap.get(fid)!.push(p.id);
  });

  const familiesList = Array.from(familiesMap.keys()).map(id => ({
    id,
    memberIds: familiesMap.get(id)!
  }));

  // Initialize groups
  const groups: Group[] = Array.from({ length: groupsCount }, (_, i) => ({
    id: `g${i + 1}`,
    name: `Group ${i + 1}`,
    overseerId: null,
    assistantId: null,
    publisherIds: []
  }));

  const assignedPublisherIds = new Set<string>();

  // Helper to mark assigned
  const assignToGroup = (groupIdx: number, pId: string) => {
    if (assignedPublisherIds.has(pId)) return;
    groups[groupIdx].publisherIds.push(pId);
    assignedPublisherIds.add(pId);
  };

  // Helper to assign family members
  const assignFamilyMembers = (groupIdx: number, familyId: string, primaryId: string) => {
    const familyMembers = familiesMap.get(familyId) || [];
    familyMembers.forEach(mId => {
      if (mId !== primaryId) {
        const member = publishersMap.get(mId);
        if (member && !member.canSeparateFromFamily) {
          assignToGroup(groupIdx, mId);
        }
      }
    });
  };

  // Step A: Assign Overseers
  const eligibleOverseers = publishers.filter(p => 
    p.standing === 'E' && p.canBeOverseer
  );

  eligibleOverseers.forEach((overseer, i) => {
    if (i < groupsCount) {
      groups[i].overseerId = overseer.id;
      assignToGroup(i, overseer.id);
      assignFamilyMembers(i, overseer.familyId || overseer.id, overseer.id);
    }
  });

  // Step B: Assign Assistants
  const eligibleAssistants = publishers.filter(p => 
    (p.standing === 'MS' || p.standing === 'E') && 
    p.canBeAssistant && 
    !assignedPublisherIds.has(p.id)
  );

  eligibleAssistants.forEach((assistant, i) => {
    // Try to find a group that doesn't have an assistant yet
    const groupIdx = groups.findIndex(g => !g.assistantId);
    if (groupIdx !== -1) {
      groups[groupIdx].assistantId = assistant.id;
      assignToGroup(groupIdx, assistant.id);
      assignFamilyMembers(groupIdx, assistant.familyId || assistant.id, assistant.id);
    }
  });

  // Step C: Distribute Regular Pioneers
  const pioneers = publishers.filter(p => 
    p.publisherType === 'RP' && !assignedPublisherIds.has(p.id)
  );

  // Sort groups by total activity score to balance
  const getSortedGroupIndices = () => {
    return groups
      .map((_, i) => i)
      .sort((a, b) => {
        const scoreA = groups[a].publisherIds.reduce((sum, id) => sum + (publishersMap.get(id)?.activityScore || 0), 0);
        const scoreB = groups[b].publisherIds.reduce((sum, id) => sum + (publishersMap.get(id)?.activityScore || 0), 0);
        
        if (scoreA !== scoreB) return scoreA - scoreB;
        // Tie-breaker: use group size
        return groups[a].publisherIds.length - groups[b].publisherIds.length;
      });
  };

  pioneers.forEach(p => {
    const bestGroupIdx = getSortedGroupIndices()[0];
    assignToGroup(bestGroupIdx, p.id);
    assignFamilyMembers(bestGroupIdx, p.familyId || p.id, p.id);
  });

  // Step D: Distribute Rest (Families First)
  const remainingFamilies = familiesList.filter(f => 
    !f.memberIds.some(mId => assignedPublisherIds.has(mId))
  );

  remainingFamilies.forEach(f => {
    const bestGroupIdx = getSortedGroupIndices()[0];
    f.memberIds.forEach(mId => assignToGroup(bestGroupIdx, mId));
  });

  // Step E: Handle separable members and stragglers
  const remainingPublishers = publishers.filter(p => !assignedPublisherIds.has(p.id));
  remainingPublishers.forEach(p => {
    const bestGroupIdx = getSortedGroupIndices()[0];
    assignToGroup(bestGroupIdx, p.id);
  });

  return {
    groups,
    unassignedIds: publishers.filter(p => !assignedPublisherIds.has(p.id)).map(p => p.id)
  };
}
