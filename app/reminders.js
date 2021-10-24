import * as fs from 'fs';
import {
  CREATION_THRESHOLD,
  PRESCRIPTIONS_FILENAME,
  REMINDERS_FILENAME,
} from '../common/config';
import { readCbor, readCborArray } from './file-system';
import * as datetime from './datetime';

/**
 * Helper function to create a single reminder object based off the prescription and the calculated time for the reminder to be triggered to notify the patient
 * @param {Object} prescription 
 * @param {string} time e.g. 12:30 is when this reminder will pop up as a notification on the Fitbit Device
 * @returns {Object|null}
 */
export const createSingleReminder = (prescription, time) => {
  const currentDate = new Date();
  const reminderDate = new Date();
  const { hour, min } = datetime.getHourAndMin(time);
  reminderDate.setHours(hour, min, 0, 0);

  if (currentDate.getTime() > reminderDate.getTime())
    return null;

  return {
    prescriptionId: prescription.id,
    medicationName: prescription.medicationName,
    dose: prescription.dose,
    unit: prescription.unit,
    route: prescription.route,
    reminderDate: reminderDate.toISOString(),
    deferInterval: prescription.deferInterval,
    deferCount: 0,
  };
};

/**
 * Creates reminders for 1 day i.e. today based off a prescription object
 * @param {Object} prescription A prescription object received from the server
 * @returns {Object[]} Array of reminders
 */
export const createReminders = (prescription) => {
  const reminders = [];
  const startDate = datetime.getLocalDate(prescription.startDate);
  const endDate = datetime.getLocalDate(prescription.endDate);
  const currentDate = new Date();
  const { frequency, occurrences } = prescription;

  const addReminder = (time) => {
    const reminder = createSingleReminder(prescription, time);
    if (!reminder) return;
    reminders.push(reminder);
  };

  // If the reminder is before the start date or after the end date, do not create reminders
  if ((prescription.endDate && currentDate.getTime() > endDate.getTime())
    || (currentDate.getTime() < startDate.getTime())) return [];

  switch (frequency) {
    case 'daily':
      occurrences[0].times.forEach(addReminder);
      break;
    case 'weekly':
      occurrences.forEach((occurrence) => {
        if (datetime.isSameDay(occurrence.day)) {
          occurrence.times.forEach(addReminder);
        }
      });
      break;
    case 'biweekly':
      occurrences.forEach((occurrence) => {
        if (datetime.isSameDay(occurrence.day) && datetime.getDayDifferenceFromToday(occurrence.starting) % 14 === 0) {
          occurrence.times.forEach(addReminder);
        }
      });
      break;
    case 'monthly':
      occurrences.forEach((occurrence) => {
        if (datetime.isSameDay(occurrence.day) && datetime.getDayDifferenceFromToday(occurrence.starting) % 28 === 0) {
          occurrence.times.forEach(addReminder);
        }
      });
      break;
    case 'custom':
      occurrences.forEach((occurrence) => {
        if (datetime.isSameDate(occurrence.day)) {
          occurrence.times.forEach(addReminder);
        }
      });
      break;
  }

  return reminders;
};

/**
 * Generates reminders based off the list of prescriptions received from the server for a specific patient
 */
export const generate = () => {
  const reminders = readCborArray(REMINDERS_FILENAME).filter((reminder) => (
    datetime.lessThanEqualCurrentTime(reminder.reminderDate)
    || reminder.deferCount > 0
  ));

  const { prescriptions } = readCbor(PRESCRIPTIONS_FILENAME);
  if (!prescriptions) return;

  prescriptions.forEach((prescription) => {
    const createdReminders = createReminders(prescription);
    reminders = reminders.filter((reminder) => (
      createdReminders.every((newReminder) => !isSameReminder(newReminder, reminder))
    ));
    reminders.push(...createdReminders);
  });
  reminders.sort(datetime.sortByDate);
  fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
};

/**
 * Checks if two reminders are the same
 * @param {Object} a 
 * @param {Object} b
 * @returns {boolean} True if the reminders are the same, otherwise false
 */
export const isSameReminder = (a, b) => (
  ['prescriptionId', 'medicationName', 'unit', 'route', 'deferInterval'].every((key) => (
    a[key] === b[key]
  ))
);
