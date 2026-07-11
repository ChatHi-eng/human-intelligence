export type Review = {
  id: string;
  bookingId: string;
  customerId: string;
  expertId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: string;
  // Joined from the reviewer's profile for display; null if unavailable.
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
};
