// What the "are you sure?" sheet says before a booking is cancelled.
//
// Every case says what happens to the session, the money and the other
// person, in that order, and the confirm button names the action. Kept apart
// from the screen so each case can be read in one place. The rules themselves
// live in lib/policy.ts and are enforced on the server.
import { formatDay, formatTime } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import type { BookingStatus, PaymentStatus } from '@/types/booking';

export type CancelPromptInput = {
  role: 'customer' | 'expert';
  status: BookingStatus;
  kind: 'session' | 'intro';
  paymentStatus: PaymentStatus;
  priceCents: number;
  startIso: string;
  // The person on the other side of the booking, if their name is known.
  otherName: string | null;
  // More than 24 hours before the start.
  freeCancel: boolean;
  // For an expert: confirmed sessions they cancelled late in the last 90
  // days. null while it is not known.
  lateCancellations: number | null;
};

export type CancelPrompt = {
  title: string;
  // Plain statements of what will happen.
  lines: string[];
  // A consequence the person may not expect, shown in red.
  warning: string | null;
  confirmLabel: string;
  keepLabel: string;
};

export const cancelPrompt = (input: CancelPromptInput): CancelPrompt => {
  const what = input.kind === 'intro' ? 'intro call' : 'session';
  const when = `${formatDay(input.startIso)} at ${formatTime(input.startIso)}`;
  const price = formatCurrency(input.priceCents);
  const paid = input.paymentStatus === 'captured';
  const held = input.paymentStatus === 'authorized';
  const free = input.kind === 'intro';

  if (input.role === 'expert') {
    const them = input.otherName ?? 'The customer';

    if (input.status === 'requested') {
      return {
        title: 'Decline this request?',
        lines: [
          `${them} asked for ${when}. They will be told you can't make it.`,
          free ? 'It is a free intro call, so nobody is charged.' : 'They are not charged.',
        ],
        warning: null,
        confirmLabel: 'Decline request',
        keepLabel: 'Keep request',
      };
    }

    const lines = [
      `Your ${what} with ${them} on ${when} will be cancelled, and they will be told right away.`,
      free
        ? 'It is a free intro call, so there is nothing to refund.'
        : `${them} is refunded in full, and you are not paid for this ${what}.`,
    ];
    if (input.freeCancel) {
      return {
        title: `Cancel this ${what}?`,
        lines: [...lines, 'They planned around this time, so please cancel only if you have to.'],
        warning: null,
        confirmLabel: `Cancel ${what}`,
        keepLabel: `Keep ${what}`,
      };
    }
    const count = input.lateCancellations;
    const soFar =
      count === null || count === 0
        ? ''
        : ` You already have ${count} in the last 90 days.`;
    return {
      title: `Cancel with less than 24 hours to go?`,
      lines,
      warning: `This close to the start, it counts as a late cancellation on your record. Palam looks at every one, and repeated late cancellations can get your profile paused.${soFar}`,
      confirmLabel: 'Cancel anyway',
      keepLabel: `Keep ${what}`,
    };
  }

  const them = input.otherName ?? 'the expert';

  // A request the expert has not answered yet.
  if (input.status === 'requested' && (held || free)) {
    return {
      title: 'Withdraw this request?',
      lines: [
        `${input.otherName ?? 'The expert'} has not answered yet, and will be told you took it back.`,
        free
          ? 'It is a free intro call, so you pay nothing.'
          : 'You pay nothing. The hold on your card is released.',
      ],
      warning: null,
      confirmLabel: 'Withdraw request',
      keepLabel: 'Keep my request',
    };
  }

  const first = `Your ${what} with ${them} on ${when} will be cancelled, and ${them} will be told.`;

  if (free) {
    return {
      title: 'Cancel this intro call?',
      lines: [first, 'It was free, so there is nothing to refund.'],
      warning: null,
      confirmLabel: 'Cancel intro call',
      keepLabel: 'Keep my intro call',
    };
  }

  if (!paid) {
    return {
      title: 'Cancel this booking?',
      lines: [
        first,
        held
          ? 'You have not been charged. The hold on your card is released.'
          : 'You have not been charged, so there is nothing to refund.',
      ],
      warning: null,
      confirmLabel: 'Cancel booking',
      keepLabel: 'Keep my booking',
    };
  }

  if (input.freeCancel) {
    return {
      title: 'Cancel this session?',
      lines: [
        first,
        `You get a full refund of ${price}. It can take 5 to 10 business days to reach your card.`,
      ],
      warning: null,
      confirmLabel: 'Cancel session',
      keepLabel: 'Keep my session',
    };
  }

  return {
    title: 'Cancel with no refund?',
    lines: [first],
    warning: `Your session starts in less than 24 hours, so the ${price} you paid is not refunded. It goes to ${them}. Cancelling is free up to 24 hours before the start.`,
    confirmLabel: 'Cancel, no refund',
    keepLabel: 'Keep my session',
  };
};
