export const RIDE_EVENTS = {
  REQUESTED: 'ride.requested',
  MATCHED: 'ride.matched',
  IN_PROGRESS: 'ride.in_progress',
  COMPLETED: 'ride.completed',
  CANCELLED: 'ride.cancelled',
} as const;

export const RIDE_EXCHANGE = 'ride-events';
export const NOTIFICATION_RIDES_QUEUE = 'notification.rides';
export const PAYMENT_RIDES_QUEUE = 'payment.rides';

export interface RideRequestedPayload {
  rideId: string;
  riderId: string;
  pickupLocation: { lat: number; lng: number; address: string };
  dropoffLocation: { lat: number; lng: number; address: string };
  requestedAt: string;
}

export interface RideMatchedPayload {
  rideId: string;
  riderId: string;
  driverId: string;
  estimatedArrivalMinutes: number;
}

export interface RideCompletedPayload {
  rideId: string;
  riderId: string;
  driverId: string;
  fareAmount: number;
  durationMinutes: number;
  completedAt: string;
}

export interface RideCancelledPayload {
  rideId: string;
  riderId: string;
  driverId?: string;
  cancelledBy: 'rider' | 'driver' | 'system';
  reason?: string;
}
