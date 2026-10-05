/** 10001 → "NW-10001", the order number customers see. (Own file so payments can use it without importing the orders service.) */
export const displayNumber = (orderNumber: number) => `NW-${orderNumber}`
