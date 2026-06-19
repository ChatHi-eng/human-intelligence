import { create } from 'zustand';
import type { Booking, CallMedium, TimeSlot } from '@/types/booking';

type DraftBooking = {
  expertId: string;
  slot: TimeSlot | null;
  medium: CallMedium;
};

type BookingState = {
  draft: DraftBooking | null;
  recentBookingId: string | null;
  startDraft: (expertId: string) => void;
  setSlot: (slot: TimeSlot) => void;
  setMedium: (medium: CallMedium) => void;
  clearDraft: () => void;
  recordBooking: (booking: Booking) => void;
};

export const useBookingStore = create<BookingState>((set) => ({
  draft: null,
  recentBookingId: null,
  startDraft: (expertId) => set({ draft: { expertId, slot: null, medium: 'video' } }),
  setSlot: (slot) =>
    set((s) => (s.draft ? { draft: { ...s.draft, slot } } : { draft: null })),
  setMedium: (medium) =>
    set((s) => (s.draft ? { draft: { ...s.draft, medium } } : { draft: null })),
  clearDraft: () => set({ draft: null }),
  recordBooking: (booking) => set({ recentBookingId: booking.id, draft: null }),
}));
