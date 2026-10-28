// Permukaan publik shared/errors (SDD-SYS-06).
export type { KodeGalat } from "./codes.js";
export { KODE_GALAT, statusUntuk } from "./codes.js";
export {
    AuthError,
    DomainError,
    ForbiddenError,
    NotFoundError,
} from "./domain-error.js";
export type { ErrorDetail, HasilPemetaan } from "./error-mapper.js";
export { mapError } from "./error-mapper.js";
export { ErrorDetailSchema, ErrorEnvelopeSchema } from "./envelope.js";
