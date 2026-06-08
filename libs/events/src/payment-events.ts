export const PAYMENT_EVENTS = {
  PREAUTH_SUCCESS: 'payment.preauth.success',
  PREAUTH_FAILED: 'payment.preauth.failed',
  CHARGE_SUCCESS: 'payment.charge.success',
  CHARGE_FAILED: 'payment.charge.failed',
  REFUND_ISSUED: 'payment.refund.issued',
} as const;

export const PAYMENT_EXCHANGE = 'payment-events';
