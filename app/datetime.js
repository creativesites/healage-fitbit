/**
 * @typedef {Object} Time
 * @property {number} hour
 * @property {number} min
 */

/**
 * @typedef {Object} DateNumbers
 * @property {number} year
 * @property {number} month
 * @property {number} date
 */

export const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Pads the minutes section of a digital clock
 * @param {number} num - number to pad
 * @returns {string} Minutes section of a digital clock e.g. 01
 */
export const zeroPad = (num) => (num < 10 ? `0${num}` : num);

/**
 * @param {number} monthNum
 * @returns {string} Abbreviated name of a month
 */
export const getMonthAbbreviation = (monthNum) => monthAbbreviations[monthNum];

/**
 * @param {string} dayNum 
 * @returns {number} Day of the week e.g. sunday is 0.
 */
export const getDayFromString = (dayNum) => days.indexOf(dayNum);

/**
 * @param {string} timeString 
 * @returns {Time} Time - hour and min as numbers
 */
export const getHourAndMin = (timeString) => {
  const [hour, min] = timeString.split(':').map((part) => parseInt(part));
  return { hour, min };
};

/**
 * @param {string} dateString 
 * @returns {DateNumbers} year, month, and date as integers
 */
export const getYearMonthDay = (dateString) => {
  const date = new Date(dateString);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return { year, month, day };
};

/**
 * @param {string} timeString
 * @returns {string} 12-hour clock format time
 */
export const convertTo12hClock = (timeString) => {
  let { hour, min } = getHourAndMin(timeString);
  let period = 'AM';
  if (hour > 12) {
    hour -= 12;
    period = 'PM';
  } else if (hour === 0) {
    hour = 12;
  }
  return `${hour}:${zeroPad(min)} ${period}`;
};

/**
 * Gets the local date of a given date string without the hours
 * @param {string} dateString 
 * @returns {Date} Date in local time e.g. 2021-06-27T00:00:00.000
 */
export const getLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const { year, month, day } = getYearMonthDay(dateString);
  return new Date(year, month, day, 0, 0, 0, 0);
};

/**
 * @param {Date} dateString
 * @returns {number} Number of days between a given date and today
 */
export const getDayDifferenceFromToday = (dateString) => {
  const localDate = getLocalDate(dateString.split("T")[0]);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const difference = Math.round(Math.abs((currentDate - localDate) / 24 * 60 * 60 * 1000));
  return difference;
};

/**
 * @param {object} a - First date
 * @param {object} b - Second date
 * @returns {number} Sort order
 */
export const sortByDate = (a, b) => {
  const timeA = (new Date(a.reminderDate)).getTime();
  const timeB = (new Date(b.reminderDate)).getTime();
  if (timeA > timeB) return 1;
  if (timeA < timeB) return -1;
  return 0;
};

/**
 * Helper function that converts a reminderDate ISOstring to
 * a date object to check if the time of the reminder is past
 * or equal to the current time
 * @param {string} reminderDate 
 * @returns {boolean} true or false
 */
export const lessThanEqualCurrentTime = (reminderDate) => (
  new Date(reminderDate).getTime() <= new Date().getTime()
);

/**
 * @param {string} day Day of the week e.g. Monday/Tuesday/Wednesday etc.
 * @returns {boolean} True if the today is the same day, otherwise false
 */
export const isSameDay = (day) => {
  const currentDate = new Date();
  return currentDate.getDay() === getDayFromString(day);
};

/**
 * @param {string} dateString ISO formatted date string
 * @returns {boolean} True if the today is the same date as the dateString
 */
export const isSameDate = (dateString) => {
  const date = getLocalDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime();
};
