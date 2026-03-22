'use strict';

/**
 * Returns the start (00:00:00.000) and end (23:59:59.999) of a given date
 * in UTC. Caller can pass a Date object or an ISO string.
 */
const dayBounds = (date = new Date()) => {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
};

/**
 * Returns start and end of a month given year and month (1-indexed).
 */
const monthBounds = (year, month) => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999); // day 0 = last day of prev month
  return { start, end };
};

/**
 * Returns start and end of a full year.
 */
const yearBounds = (year) => {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
};

/**
 * Returns a YYYY-MM-DD string for use as a unique date key.
 */
const toDateString = (date = new Date()) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

module.exports = { dayBounds, monthBounds, yearBounds, toDateString };
