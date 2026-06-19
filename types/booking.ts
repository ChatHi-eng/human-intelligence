export type CallMedium = 'video' | 'phone';

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'refunded' | 'failed';

export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TimeSlot = {
  startIso: string;
  endIso: string;
};

export type Booking = {
  id: string;
  customerId: string;
  expertId: string;
  slot: TimeSlot;
  medium: CallMedium;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  priceCents: number;
  callRoomUrl: string | null;
  createdAt: string;
};

export type EarningsBucket = {
  periodLabel: string;
  startIso: string;
  endIso: string;
  grossCents: number;
  payoutCents: number;
  bookingCount: number;
};
