// Stripe — hosted Checkout via Supabase Edge Functions.
//
// The native @stripe/stripe-react-native PaymentSheet isn't installed yet
// (requires a dev build). For now we route customers to Stripe Checkout (hosted
// page) in an in-app web browser. When we move to a dev build, the native
// PaymentSheet replaces openCheckout, and the Edge Function just changes from
// creating a Checkout Session to creating a PaymentIntent.
import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from './supabase';

export type CheckoutSession = {
  sessionId: string;
  sessionUrl: string;
};

export const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

/**
 * Calls the Supabase Edge Function `create-checkout-session` to mint a Stripe
 * Checkout Session for the given booking. Returns the URL to open.
 */
export const createCheckoutSession = async (bookingId: string): Promise<CheckoutSession> => {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.functions.invoke<CheckoutSession>('create-checkout-session', {
    body: { bookingId },
  });
  if (error) throw error;
  if (!data || !data.sessionUrl) throw new Error('No checkout session returned');
  return data;
};

/**
 * Opens the Checkout URL in an in-app browser (works in Expo Go and standalone).
 * Resolves when the browser is dismissed — does NOT mean payment succeeded.
 * Real payment confirmation comes from the Stripe webhook hitting our backend,
 * which updates booking.payment_status. The client polls via TanStack Query.
 */
export const openCheckout = async (
  sessionUrl: string,
): Promise<{ type: 'cancel' | 'dismiss' | 'success' | 'unknown' }> => {
  const result = await WebBrowser.openAuthSessionAsync(sessionUrl, undefined, {
    showInRecents: true,
  });
  if (result.type === 'success') return { type: 'success' };
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  return { type: 'unknown' };
};
