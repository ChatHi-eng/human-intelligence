// Saving one part of an expert profile without disturbing the rest.
import type { ExpertProfileInput } from '@/services/api';
import type { Expert } from '@/types/user';

/**
 * The profile as it stands, in the shape the save call wants. Section editors
 * spread their own changes over this, so saving a headline can never blank
 * the price, the cover image or the "How I can help" text.
 */
export const currentProfileInput = (expert: Expert): ExpertProfileInput => ({
  industryId: expert.industryId,
  industryIds: expert.industryIds,
  location: expert.location,
  headline: expert.headline,
  sessionPriceCents: expert.sessionPrice,
  yearsExperience: expert.yearsExperience,
  coverImageUrl: expert.coverImageUrl || null,
  howICanHelp: expert.howICanHelp,
  industryCustom: expert.industryCustom,
  currentTitle: expert.currentTitle,
  currentCompany: expert.currentCompany,
  topics: expert.topics,
});
