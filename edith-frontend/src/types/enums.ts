export const TaskPriority = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const EmailCategory = {
  PRIMARY: 'PRIMARY',
  SOCIAL: 'SOCIAL',
  PROMOTIONS: 'PROMOTIONS',
  UPDATES: 'UPDATES',
  FORUMS: 'FORUMS',
  SPAM: 'SPAM',
} as const;
export type EmailCategory = (typeof EmailCategory)[keyof typeof EmailCategory];

export const EmailPriority = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
} as const;
export type EmailPriority = (typeof EmailPriority)[keyof typeof EmailPriority];

export const EventStatus = {
  CONFIRMED: 'CONFIRMED',
  TENTATIVE: 'TENTATIVE',
  CANCELLED: 'CANCELLED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const AttendeeStatus = {
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  TENTATIVE: 'TENTATIVE',
  PENDING: 'PENDING',
} as const;
export type AttendeeStatus = (typeof AttendeeStatus)[keyof typeof AttendeeStatus];

export const ContactRelationship = {
  COLLEAGUE: 'COLLEAGUE',
  CLIENT: 'CLIENT',
  VENDOR: 'VENDOR',
  FRIEND: 'FRIEND',
  FAMILY: 'FAMILY',
  OTHER: 'OTHER',
} as const;
export type ContactRelationship = (typeof ContactRelationship)[keyof typeof ContactRelationship];

export const TripStatus = {
  PLANNING: 'PLANNING',
  BOOKED: 'BOOKED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

export const BookingType = {
  FLIGHT: 'FLIGHT',
  HOTEL: 'HOTEL',
  CAR: 'CAR',
  TRAIN: 'TRAIN',
  OTHER: 'OTHER',
} as const;
export type BookingType = (typeof BookingType)[keyof typeof BookingType];

export const BookingStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const ExpenseCategory = {
  FOOD: 'FOOD',
  TRANSPORT: 'TRANSPORT',
  ACCOMMODATION: 'ACCOMMODATION',
  ENTERTAINMENT: 'ENTERTAINMENT',
  OFFICE: 'OFFICE',
  SOFTWARE: 'SOFTWARE',
  OTHER: 'OTHER',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const ExpenseStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REIMBURSED: 'REIMBURSED',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MODIFIED: 'MODIFIED',
  EXPIRED: 'EXPIRED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const InteractionType = {
  EMAIL: 'EMAIL',
  MEETING: 'MEETING',
  CALL: 'CALL',
  NOTE: 'NOTE',
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];
