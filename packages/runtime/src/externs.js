/**
 * @fileoverview Externs cho Closure Compiler: tên bên ngoài phải giữ nguyên.
 * @externs
 */

/**
 * GA4 (gtag.js)
 * @param {...*} var_args
 */
function gtag(var_args) {}

/** @type {!Array<*>} */
var dataLayer;

/** Tên các trường JSON gửi tới endpoint thống kê và beacon bên ngoài.
 * @record
 */
function TrackingPayload() {}
/** @type {string} */ TrackingPayload.prototype.slug;
/** @type {string} */ TrackingPayload.prototype.kind;
/** @type {string} */ TrackingPayload.prototype.blockId;
/** @type {string} */ TrackingPayload.prototype.position;
/** @type {string} */ TrackingPayload.prototype.url;
/** @type {number} */ TrackingPayload.prototype.ts;
