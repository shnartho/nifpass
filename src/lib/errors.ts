import type { ErrorCode } from "@/shared/protocol";

export type ClientErrorCode = ErrorCode | "TIMEOUT";

export interface FriendlyError {
  title: string;
  message: string;
}

const messages: Record<ClientErrorCode, FriendlyError> = {
  INVALID_REQUEST: {
    title: "Something went wrong",
    message: "We couldn't process that request. Please try again.",
  },
  INVALID_NIF: {
    title: "Check your NIF",
    message: "Your NIF must contain exactly 9 digits.",
  },
  STORE_OFFLINE: {
    title: "Store not available",
    message: "This store isn't receiving NIFs right now. Ask the staff to open NIFPass on their screen, then try again.",
  },
  DELIVERY_FAILED: {
    title: "NIF not delivered",
    message: "The store didn't receive your NIF. Please try again.",
  },
  UNAUTHORIZED: {
    title: "Sign-in problem",
    message: "We couldn't verify this store account. Please sign out and sign in again.",
  },
  RATE_LIMITED: {
    title: "Too many attempts",
    message: "Please wait a minute before trying again.",
  },
  SERVER_BUSY: {
    title: "Service busy",
    message: "NIFPass is busy right now. Please try again shortly.",
  },
  TIMEOUT: {
    title: "Connection problem",
    message: "We couldn't reach NIFPass. Check your internet connection and try again.",
  },
};

export const friendlyError = (code: ClientErrorCode): FriendlyError => messages[code] ?? messages.INVALID_REQUEST;
