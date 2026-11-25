export type CallMedium = 'video' | 'phone';

// 'authorized' = card held, not charged. 'released' = a hold let go without
// ever charging (declined, expired, or withdrawn before the expert accepted).
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'released'
  // A free intro call: there is nothing to pay.
  | 'not_required';

// 'session': paid, 30 minutes. 'intro': free, 15 minutes.
export type BookingKind = 'session' | 'intro';

// 'instant': paid and confirmed at once. 'approval': the expert reviews the
// request first and the card is only held until they accept.
export type BookingMode = 'instant' | 'approval';

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
  kind: BookingKind;
  bookingMode: BookingMode;
  callRoomUrl: string | null;
  // What the customer wants to talk about, written when they booked.
  customerNote: string | null;
  // Filled when the row was read with the customer's profile joined.
  customerName: string | null;
  customerAvatarUrl: string | null;
  noShowReportedBy: string | null;
  noShowReportedAt: string | null;
  // How many times this booking has been moved to a new time, and the time
  // it had before the last move.
  rescheduleCount: number;
  previousStartIso: string | null;
  // What the video call's own record says happened, once the session is
  // over. Null until then, and for sessions from before the record was kept.
  attendanceOutcome: AttendanceOutcome | null;
  attendance: BookingAttendance | null;
  createdAt: string;
};

export type AttendanceOutcome =
  | 'held'
  | 'short'
  | 'expert_no_show'
  | 'customer_no_show'
  | 'needs_review';

// When each person was in the call. Times are ISO strings.
export type BookingAttendance = {
  togetherMinutes: number;
  customer: [string, string][];
  expert: [string, string][];
};

// An expert's suggestion of new times for a booking, waiting on the customer.
export type RescheduleProposal = {
  id: string;
  bookingId: string;
  // Start times, soonest first.
  options: string[];
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
