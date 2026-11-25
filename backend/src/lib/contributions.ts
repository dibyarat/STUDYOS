import { prisma } from './prisma';

export interface CommunityContributionSummary {
  score: number;
  ratingLabel: string;
  resourcesShared: number;
  helpfulContributions: number;
  communityAssistance: number;
  hackathonsParticipated: number;
  projectsContributed: number;
  averageRating: number | null;
  totalReviews: number;
  calculatedAt: string;
}

/**
 * Computes a server-validated Community Contribution summary from real persisted
 * StudyOS records (resources, help services/requests, comments, hackathons, and projects).
 * Never accepts client-supplied scores.
 */
export async function computeUserContribution(userId: string): Promise<CommunityContributionSummary> {
  if (!userId) {
    return {
      score: 0,
      ratingLabel: 'New Member',
      resourcesShared: 0,
      helpfulContributions: 0,
      communityAssistance: 0,
      hackathonsParticipated: 0,
      projectsContributed: 0,
      averageRating: null,
      totalReviews: 0,
      calculatedAt: new Date().toISOString(),
    };
  }

  const [
    userResources,
    resourceCommentsCount,
    helpServices,
    completedHelpCount,
    serviceReviews,
    createdTeams,
    memberships,
    projectsCount,
  ] = await Promise.all([
    prisma.resource.findMany({ where: { creatorId: userId }, select: { id: true } }).catch(() => []),
    prisma.resourceComment.count({ where: { authorId: userId } }).catch(() => 0),
    prisma.helpService.findMany({ where: { providerId: userId }, select: { id: true } }).catch(() => []),
    prisma.helpRequest.count({ where: { providerId: userId, status: 'COMPLETED' } }).catch(() => 0),
    prisma.serviceReview.findMany({ where: { providerId: userId }, select: { rating: true } }).catch(() => []),
    prisma.teamPost.findMany({ where: { creatorId: userId }, select: { id: true, type: true } }).catch(() => []),
    prisma.teamMembership.findMany({ where: { userId }, select: { teamPostId: true, teamId: true } }).catch(() => []),
    prisma.project.count({ where: { creatorId: userId } }).catch(() => 0),
  ]);

  const resourcesShared = Array.isArray(userResources) ? userResources.length : 0;

  // Fetch ratings received on resources created by this user
  let resourceRatings: Array<{ rating: number }> = [];
  if (resourcesShared > 0) {
    const resourceIds = new Set(userResources.map((r: any) => r.id));
    const allRatings = await prisma.resourceRating.findMany({ select: { resourceId: true, rating: true } }).catch(() => []);
    resourceRatings = allRatings.filter((r: any) => resourceIds.has(r.resourceId));
  }

  // Resolve team types for memberships where user is not already listed in createdTeams
  const teamTypeMap = new Map<string, string>();
  for (const t of createdTeams) {
    if (t?.id) teamTypeMap.set(t.id, String(t.type || '').toUpperCase());
  }

  const missingTeamIds = new Set<string>();
  for (const m of memberships) {
    const tid = m?.teamPostId || m?.teamId;
    if (tid && !teamTypeMap.has(tid)) {
      missingTeamIds.add(tid);
    }
  }

  if (missingTeamIds.size > 0) {
    const joinedTeams = await prisma.teamPost.findMany({
      where: { id: { in: Array.from(missingTeamIds) } },
      select: { id: true, type: true },
    }).catch(() => []);
    for (const jt of joinedTeams) {
      if (jt?.id) teamTypeMap.set(jt.id, String(jt.type || '').toUpperCase());
    }
  }

  let hackathonsParticipated = 0;
  let projectTeamsCount = 0;
  for (const type of teamTypeMap.values()) {
    if (type === 'HACKATHON') hackathonsParticipated++;
    else if (type === 'COLLEGE_PROJECT' || type === 'GROUP_PROJECT') projectTeamsCount++;
  }

  const helpfulContributions = Number(completedHelpCount || 0) + Number(resourceCommentsCount || 0);
  const communityAssistance = (Array.isArray(helpServices) ? helpServices.length : 0) + Number(completedHelpCount || 0);
  const projectsContributed = Number(projectsCount || 0) + projectTeamsCount;

  const combinedRatings = [
    ...serviceReviews.map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0),
    ...resourceRatings.map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0),
  ];
  const totalReviews = combinedRatings.length;
  const averageRating =
    totalReviews > 0
      ? Math.round((combinedRatings.reduce((acc, v) => acc + v, 0) / totalReviews) * 10) / 10
      : null;

  // Deterministic weighted contribution score (capped cleanly or open score)
  const rawScore =
    resourcesShared * 10 +
    helpfulContributions * 6 +
    communityAssistance * 8 +
    hackathonsParticipated * 15 +
    projectsContributed * 12 +
    (averageRating ? Math.round(averageRating * 2) : 0);

  let ratingLabel = 'New Member';
  if (rawScore >= 120) ratingLabel = 'Top Contributor';
  else if (rawScore >= 60) ratingLabel = 'Active Mentor';
  else if (rawScore >= 25) ratingLabel = 'Contributor';
  else if (rawScore > 0) ratingLabel = 'Rising Peer';

  return {
    score: rawScore,
    ratingLabel,
    resourcesShared,
    helpfulContributions,
    communityAssistance,
    hackathonsParticipated,
    projectsContributed,
    averageRating,
    totalReviews,
    calculatedAt: new Date().toISOString(),
  };
}
