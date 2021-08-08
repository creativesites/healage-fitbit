/**
 * Pads the minutes section of a digital clock
 * @param {int} i 
 * @returns String for the minutes section of a digital clock e.g. 01
 */
export function zeroPad(i) {
  if (i < 10) {
    i = "0" + i;
  }
  return i;
}

/**
 * Generates a unique identifier
 * @returns String of a Unique Identifier
 */
export function generateUid() {
  let alphabet = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
  let length = 8;
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return id;
}

/**
 * Gets the abbreviated name of a month given the number of the month e.g. 0 is January or Jan
 * @param {int} month 
 * @returns String of the abbreviated name of a month
 */
export function getMonthAbbreviation(month) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[month];
}

/**
 * Converts military time clock to a 12-hour clock format with AM/PM
 * @param {string} time 
 * @returns String of the 12-hour clock format time
 */
export function convertTo12hClock(time) {
  const clockParts = time.split(':');
  const hour = parseInt(clockParts[0]);
  const period = 'AM';
  if (hour > 12) {
    hour -= 12;
    period = 'PM';
  } else if (hour === 0) {
    hour = 12;
  }
  const string = `${hour}:${clockParts[1]} ${period}`;
  return string;
}

/**
 * Gets the day number for a given day of the week
 * @param {string} day 
 * @returns Number of the day of the week e.g. sunday is 0.
 */
export function getDayFromString(day) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days.indexOf(day);
}

/**
 * Gets the hour and minutes out of a string and returns as a JavaScript object
 * @param {string} timeString 
 * @returns JavaScript object containing hour and min as integers
 */
export function getHourAndMin(timeString) {
  const [hour, min] = timeString.split(':');
  const time = {
    hour: parseInt(hour),
    min: parseInt(min),
  }
  return time;
}

/**
 * Gets the year, month and date out of a string and returns as a JavaScript object
 * @param {string} dateString 
 * @returns JavaScript object containing year, month and date as integers
 */
export function getYearMonthDay(dateString) {
  const [year, month, date] = dateString.split('-');
  const date1 = {
    year: parseInt(year),
    month: parseInt(month),
    date: parseInt(date),
  }
  return date1;
}

/**
 * Gets the local date of a given date string without the hours
 * @param {string} dateString 
 * @returns JavaScript Date object in local time e.g. 2021-06-27T00:00:00.000
 */
export function getCustomDate(dateString) {
  if (dateString !== undefined && dateString !== null) {
    const customDate = new Date();
    const ymd = getYearMonthDay(dateString);
    customDate.setFullYear(ymd.year);
    customDate.setMonth(ymd.month - 1);
    customDate.setDate(ymd.date);
    customDate.setHours(0, 0, 0, 0);
    return customDate;
  }
  return undefined;
}

/**
 * Gets the difference in days of a given date from today 
 * @param {JavaScript Date Object} date1 
 * @returns Integer representing the number of days between a given date and today
 */
export function getDayDifferenceFromToday(date1) {
  const dateString = date1.split("T")[0];
  const oneDay = 24 * 60 * 60 * 1000;
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const date = getCustomDate((dateString));
  const difference = Math.round(Math.abs((currentDate - date) / oneDay));
  return difference;
}

/**
 * Hashes a string into a 32-bit int
 * @param {string} string 
 * @returns 32-bit int
 */
export function hashString(string) {
  let hash = 0, i, char;
  if (string.length === 0) return hash;
  for (i = 0; i < string.length; i++) {
    char = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return hash;
}

/**
 * Adds time to a date. 
 * E.g. dateAdd(new Date(), 'hour', 1) 
 * 
 * @param date  Date to start with
 * @param interval  One of: year, quarter, month, week, day, hour, minute, second
 * @param units  Number of units of the given interval to add.
 * @returns Date object representing the future date time that has been added to the original date
 */
export function dateAdd(date, interval, units) {
  if (!(date instanceof Date))
    return undefined;
  var futureDate = new Date(date);
  var checkRollover = function () { if (futureDate.getDate() != date.getDate()) futureDate.setDate(0); };
  switch (String(interval).toLowerCase()) {
    case 'year': futureDate.setFullYear(futureDate.getFullYear() + units); checkRollover(); break;
    case 'quarter': futureDate.setMonth(futureDate.getMonth() + 3 * units); checkRollover(); break;
    case 'month': futureDate.setMonth(futureDate.getMonth() + units); checkRollover(); break;
    case 'week': futureDate.setDate(futureDate.getDate() + 7 * units); break;
    case 'day': futureDate.setDate(futureDate.getDate() + units); break;
    case 'hour': futureDate.setTime(futureDate.getTime() + units * 3600000); break;
    case 'minute': futureDate.setTime(futureDate.getTime() + units * 60000); break;
    case 'second': futureDate.setTime(futureDate.getTime() + units * 1000); break;
    default: futureDate = undefined; break;
  }
  return futureDate;
}