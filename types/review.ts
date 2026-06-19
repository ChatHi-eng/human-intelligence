export type Review = {
  id: string;
  bookingId: string;
  customerId: string;
  expertId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: string;
};
