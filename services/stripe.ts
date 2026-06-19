// Stripe stub. The real `@stripe/stripe-react-native` SDK requires a dev build
// (it's not Expo Go compatible), so we defer installation until we transition off
// Expo Go. The UI talks only to this module; swapping in the real SDK later is a
// one-file change behind the same API surface.
import type { Booking } from '@/types/booking';

export type PaymentIntentResult = {
  paymentIntentId: string;
  status: 'succeeded' | 'requires_action' | 'failed';
};

export const createPaymentIntent = async (booking: {
  bookingId: string;
  amountCents: number;
}): Promise<PaymentIntentResult> => {
  await new Promise((r) => setTimeout(r, 700));
  return {
    paymentIntentId: `pi_stub_${booking.bookingId}`,
    status: 'succeeded',
  };
};

export const confirmBookingPayment = async (booking: Booking): Promise<PaymentIntentResult> =>
  createPaymentIntent({ bookingId: booking.id, amountCents: booking.priceCents });

export const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
