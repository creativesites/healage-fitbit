import { vibration } from 'haptics';
import { me } from 'appbit';
import { battery } from 'power';
import { preferences } from 'user-settings';
import document from 'document';
import clock from 'clock';
import * as util from '../common/utils';
import * as messaging from 'messaging';
import * as fs from 'fs';
import { memory } from 'system';
import { inbox } from 'file-transfer';
import { outbox } from 'file-transfer';
import { minuteHistory, dayHistory } from 'user-activity';
import { display } from 'display';

const batteryDisplay = document.getElementById('batteryDisplay');
const batteryLevel = document.getElementById('batteryLevel');

const dayOfMonthDisplay = document.getElementById('dayOfMonthDisplay');
const monthDisplay = document.getElementById('monthDisplay');
const timeDisplay = document.getElementById('timeDisplay');

const gaitSpeedMeasurementDisplay = document.getElementById('gaitSpeedMeasurementDisplay');

const patientIdDisplay = document.getElementById('patientIdDisplay');
const notificationDisplay = document.getElementById('notificationDisplay');

const userFileName = 'user.cbor';
const prescriptionsFileName = 'prescriptions.cbor';
const remindersFileName = 'reminders.cbor';
const remindersHashFileName = 'remindersHash.cbor';

const appFolder = '/private/data/';

let remindersQueue = readCborArray(remindersFileName);
let remindersHashMap = readCbor(remindersHashFileName);
generateReminders();
deleteOldHashes(remindersHashMap);

if (me.appTimeoutEnabled) {
  me.appTimeoutEnabled = false;
}

me.onunload = () => {
  // Save only if there are objects in queue 
  if (remindersQueue !== null && remindersQueue.length > 0) {
    fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
  }

  // Save hashes to prevent duplicates of deleted/completed reminders when app reloads
  if (remindersHashMap !== null && Object.keys(remindersHashMap).length > 0) {
    fs.writeFileSync(remindersHashFileName, remindersHashMap, 'cbor');
  }
};

// All buttons
const backButton = document.getElementById('backButton');
const refreshButton = document.getElementById('refreshButton');
const userButton = document.getElementById('userButton');
const timerButton = document.getElementById('timerButton');
const restartButton = document.getElementById('restartButton');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const doneButton = document.getElementById('button-1');
const deferButton = document.getElementById('button-2');

let started = false; // tracks if the timer has started
let isMeasurementDisplayed = false; // tracks if a measurement is displayed
let startTime;
let endTime;
let timeElapsed;

backButton.addEventListener('click', (evt) => {
  if (currentScreen === 'user' || currentScreen === 'timer') {
    showClockFaceScreen();
  }
  isMeasurementDisplayed = false;
})

refreshButton.addEventListener('click', (evt) => {
  const patientId = readPatientId(userFileName);
  sendCheckPrescriptions(patientId);
})

userButton.addEventListener('click', (evt) => {
  showUserScreen();
})

timerButton.addEventListener('click', (evt) => {
  showTimerScreen();
})

restartButton.addEventListener('click', (evt) => {
  if (isMeasurementDisplayed === true) {
    gaitSpeedMeasurementDisplay.text = '0.0 m/s';
    isMeasurementDisplayed = false;
  }
  restartButton.style.display = 'none';
  startButton.style.display = 'inline';
})

startButton.addEventListener('click', (evt) => {
  startTime = new Date().getTime();
  startButton.style.display = 'none';
  stopButton.style.display = 'inline';
})

stopButton.addEventListener('click', (evt) => {
  endTime = new Date().getTime();
  timeElapsed = endTime - startTime;
  const gaitSpeed = Math.round((4 / (timeElapsed / 1000)) * 10) / 10;
  gaitSpeedMeasurementDisplay.text = `${gaitSpeed} m/s`;
  const patientId = readPatientId(userFileName);
  sendGaitSpeed(patientId, gaitSpeed);
  isMeasurementDisplayed = true;
  stopButton.style.display = 'none';
  restartButton.style.display = 'inline';
})

doneButton.addEventListener('click', (evt) => {
  stopVibration();
  remindersQueue[0].completed = true;
  let patientId = readPatientId(userFileName);
  sendStatus(patientId, remindersQueue[0].id, remindersQueue[0].reminderDate, 'completed');
  remindersQueue.shift();
  fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
  showClockFaceScreen();
})

deferButton.addEventListener('click', (evt) => {
  stopVibration();
  let futureDate = util.dateAdd(new Date(), 'minute', remindersQueue[0].deferInterval);
  remindersQueue[0].deferCount += 1;
  if (remindersQueue[0].deferCount >= 4) {
    let patientId = readPatientId(userFileName);
    sendStatus(patientId, remindersQueue[0].id, remindersQueue[0].reminderDate, 'missed');
    fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
  }
  remindersQueue[0].reminderDate = futureDate.toISOString();
  remindersQueue[0].completed = false;
  remindersQueue.sort(sortByDate);
  showClockFaceScreen();
})

// All screens
let screens = [];
const clockFaceScreen = document.getElementById('clockFaceScreen');
const userScreen = document.getElementById('userScreen');
const timerScreen = document.getElementById('timerScreen');
const notificationScreen = document.getElementById('notificationScreen');

screens.push(clockFaceScreen);
screens.push(userScreen);
screens.push(notificationScreen);
screens.push(timerScreen);

let currentScreen = 'clockface';
showClockFaceScreen();

/**
 * Compares to reminder objects by date and sorts oldest to newest
 * @param {object} a 
 * @param {object} b 
 * @returns 
 */
const sortByDate = (a, b) => {
  const timeA = (new Date(a.reminderDate)).getTime();
  const timeB = (new Date(b.reminderDate)).getTime();
  if (timeA > timeB) return 1;
  if (timeA < timeB) return -1;
  return 0;
}

/**
 * Prints an array of JSON objects
 * @param {object} inputArr 
 */
function printArray(inputArr) {
  for (let i = 0; i < inputArr.length; i++) {
    console.log(JSON.stringify(inputArr[i]));
  }
}

/**
 * Helper function that converts a reminderDate ISOstring to a date object to check if the time of the reminder is past or equal to the current time
 * @param {string} reminderDate 
 * @returns 
 */
function isLessThanEqualCurrentTime(reminderDate) {
  const currentDate = new Date();
  return new Date(reminderDate).getTime() <= currentDate.getTime() ? true : false;
}

// Initial check if the user data exists
if (fs.existsSync(appFolder + userFileName)) {
  if (!isPatientIdValid(userFileName)) {
    let patientId = util.generateUid();
    sendCheckId(patientId);
  }

  if (!isPatientIdVerified(userFileName)) {
    let patientId = readPatientId(userFileName);
    sendCheckId(patientId);
  }

  if (isPatientIdValid(userFileName) && isPatientIdVerified(userFileName)) {
    let patientId = readPatientId(userFileName);
    patientIdDisplay.text = patientId;
  }
} else {
  const patientId = util.generateUid();
  const userData = {
    patientId: patientId,
    verified: false,
  };
  fs.writeFileSync(userFileName, userData, 'cbor');
  sendCheckId(patientId);
}

let currentReminder;
clock.granularity = 'minutes';
clock.ontick = (evt) => {
  // Update the UI every tick with the current time
  let today = evt.date;
  let hours = today.getHours();
  if (preferences.clockDisplay === '12h') {
    hours = hours % 12 || 12;
  } else {
    hours = util.zeroPad(hours);
  }
  let mins = util.zeroPad(today.getMinutes());
  timeDisplay.text = `${hours}:${mins}`;

  let chargeLevel = battery.chargeLevel;
  batteryDisplay.text = `${Math.floor(chargeLevel)}%`;
  batteryLevel.width = (chargeLevel / 100) * 26;

  let date = new Date();
  let month = date.getMonth();
  let dayOfMonth = date.getDate();
  dayOfMonthDisplay.text = dayOfMonth;
  monthDisplay.text = util.getMonthAbbreviation(month);
  if (currentScreen === 'notification') {
    vibrate();
  }
}

messaging.peerSocket.addEventListener('message', (evt) => {
  if (evt.data.request === 'updateId') {
    let patientId = evt.data.id;
    let userData = {
      patientId: patientId,
      verified: true,
    };
    fs.writeFileSync(userFileName, userData, 'cbor');
    patientIdDisplay.text = patientId;
  } else if (evt.data.request === 'regenerateId') {
    let patientId = util.generateUid();
    sendCheckId(patientId);
  } else if (evt.data.request === 'deleteReminders') {
    let prescriptionId = evt.data.prescriptionId;
    deleteReminders(prescriptionId);
    remindersQueue.sort(sortByDate);
  }
});

function sendCheckId(patientId) {
  const data = {
    request: 'checkId',
    id: patientId,
  }
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    messaging.peerSocket.send(data);
  }
}

function sendGaitSpeed(patientId, gaitSpeed) {
  const data = {
    request: 'postGaitSpeed',
    id: patientId,
    gaitSpeed: gaitSpeed,
  }
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    messaging.peerSocket.send(data);
  }
}

function sendStatus(patientId, prescriptionId, reminderDate, status) {
  const reminderStatusFileName = 'reminderStatus' + new Date().getTime() + '.cbor';
  const reminderStatusData = {
    request: 'postStatus',
    patientId: patientId,
    prescriptionId: prescriptionId,
    reminderDate: reminderDate,
    status: status,
  }
  fs.writeFileSync(reminderStatusFileName, reminderStatusData, 'cbor');
  outbox.enqueueFile(appFolder + reminderStatusFileName);
}

function sendCheckPrescriptions(patientId) {
  if (!fs.existsSync(appFolder + prescriptionsFileName)) {
    fs.writeFileSync(prescriptionsFileName, [{ patientId: readPatientId(userFileName), }], 'cbor');
  } else {
    const prescriptions = readCborArray(prescriptionsFileName);
    // If there are currently no prescriptions in the file, we must create an object with the patientId 
    // in order to make a request from the companion 
    if (prescriptions.length === 0) {
      fs.writeFileSync(prescriptionsFileName, [{ patientId: readPatientId(userFileName), }], 'cbor');
    }
  }
  outbox.enqueueFile(appFolder + prescriptionsFileName);
}

function showNotificationScreen() {
  vibrate();
  hideScreens();
  notificationScreen.style.display = 'inline';
  const dateParts = new Date(currentReminder.reminderDate).toLocaleString().split(' ');
  const time = dateParts[4];
  const convertedTime = `${util.convertTo12hClock(time)} on ${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
  notificationDisplay.text = `Take ${currentReminder.dose} ${currentReminder.unit} of ${currentReminder.medicationName} by ${currentReminder.route} at ${convertedTime}`;
  currentScreen = 'notification';
  updateButtons();
}

function showUserScreen() {
  hideScreens();
  userScreen.style.display = 'inline';
  currentScreen = 'user';
  updateButtons();
}

function showTimerScreen() {
  hideScreens();
  timerScreen.style.display = 'inline';
  gaitSpeedMeasurementDisplay.text = '0.0 m/s';
  startButton.style.display = 'inline';
  stopButton.style.display = 'none';
  restartButton.style.display = 'none';
  currentScreen = 'timer';
  updateButtons();
}

function showClockFaceScreen() {
  hideScreens();
  stopVibration();
  clockFaceScreen.style.display = 'inline';
  currentScreen = 'clockface';
  updateButtons();
}

function hideScreens() {
  screens.forEach(screen => screen.style.display = 'none');
}

function updateButtons() {
  if (currentScreen === 'clockface' || currentScreen === 'notification') {
    backButton.style.display = 'none';
  } else if (currentScreen === 'user' || currentScreen === 'timer') {
    backButton.style.display = 'inline';
  }
}

function isPatientIdValid(file) {
  if (fs.existsSync(appFolder + file)) {
    let userJson = fs.readFileSync(file, 'cbor');
    if (userJson.patientId.length === 8) {
      return true;
    }
    return false;
  }
  return false;
}

function isPatientIdVerified(file) {
  if (fs.existsSync(appFolder + file)) {
    let userJson = fs.readFileSync(file, 'cbor');
    if (userJson.verified === true) {
      return true;
    }
    return false;
  }
  return false;
}

function readPatientId(file) {
  if (fs.existsSync(appFolder + file)) {
    let userJson = fs.readFileSync(file, 'cbor');
    if (userJson.patientId.length === 8) {
      return userJson.patientId;
    }
    return null;
  }
  return null;
}

function readCborArray(file) {
  if (fs.existsSync(appFolder + file)) {
    let jsonObject = fs.readFileSync(file, 'cbor');
    if (jsonObject.length > 0) {
      return jsonObject;
    }
    return [];
  }
  return [];
}

function readCbor(file) {
  if (fs.existsSync(appFolder + file)) {
    let jsonObject = fs.readFileSync(file, 'cbor');
    return jsonObject;
  }
  return {};
}

function deleteFile(file) {
  if (fs.existsSync(appFolder + file)) {
    fs.unlinkSync(file);
  }
}

function vibrate() {
  vibration.start('alert');
}

function stopVibration() {
  vibration.stop();
}

function processAllFiles() {
  let fileName;
  while (fileName = inbox.nextFile()) {
    if (fileName.indexOf('deleteFile') !== -1) {
      const request = readCbor(fileName);
      deleteFile(request.fileName);
    } else if (fileName.indexOf('prescriptions') !== -1) {
      generateReminders();
    }
  }

}
inbox.addEventListener('newfile', processAllFiles);

/**
 * Helper function to create a single reminder object based off the prescription and the calculated time for the reminder to be triggered to notify the patient
 * @param {*} prescription 
 * @param {*} time e.g. 12:30 is when this reminder will pop up as a notification on the Fitbit Device
 * @returns 
 */
function createSingleReminder(prescription, time) {
  const reminderDate = new Date();
  const { hour, min } = util.getHourAndMin(time);
  reminderDate.setHours(hour, min, 0, 0);

  let reminder = {
    id: prescription.id,
    medicationName: prescription.medicationName,
    dose: prescription.dose,
    unit: prescription.unit,
    route: prescription.route,
    reminderDate: reminderDate.toISOString(),
    completed: false,
    deferInterval: prescription.deferInterval,
    deferCount: 0,
  }
  return reminder;
}

/**
 * Deletes all reminders that have been marked as completed in the queue
 */
function deleteCompletedReminders() {
  let foundUncompleted = false;
  while (!foundUncompleted && remindersQueue !== null && remindersQueue.length > 0) {
    if (remindersQueue[0].completed === true) {
      fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
    } else {
      foundUncompleted = true;
    }
  }
}

/**
 * Checks if today is the same day as the given string
 * @param {string} day Day of the week e.g. Monday/Tuesday/Wednesday etc.
 * @returns Boolean True if the today is the same day, otherwise false
 */
function isSameDay(day) {
  const currentDate = new Date();
  return currentDate.getDay() === util.getDayFromString(day) ? true : false;
}

/**
 * Checks if today is the same ate as the given string
 * @param {string} dateString ISO formatted date string
 * @returns Boolean True if the today is the same date as the dateString
 */
function isSameDate(dateString) {
  let date = util.getCustomDate(dateString);
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() === today.getTime() ? true : false;
}

/**
 * Helper function to hash reminder objects
 * @param {object} reminder A reminder object that was created from a prescription object
 * @returns Hash string
 */
function hash(reminder) {
  const { id, medicationName, dose, unit, route, reminderDate } = reminder;
  const string = id + medicationName + dose + unit + route + reminderDate;
  return util.hashString(string);
}

/**
 * Creates reminders for 1 day i.e. today based off a prescription object
 * @param {object} prescription A prescription object received from the server
 */
function createReminders(prescription) {
  const currentDate = new Date();
  const startDate = util.getCustomDate(prescription.startDate);
  const endDate = util.getCustomDate(prescription.endDate);
  const frequency = prescription.frequency;
  const occurrences = prescription.occurrences;
  // If the reminder is after the start date (inclusive) and before the end date (exclusive), 
  if ((prescription.endDate === undefined && startDate.getTime() <= currentDate.getTime())
    || (prescription.endDate !== undefined && currentDate.getTime() < endDate.getTime() && startDate.getTime() <= currentDate.getTime())) {
    if (frequency === 'daily') {
      occurrences[0].times.forEach(time => {
        const reminder = createSingleReminder(prescription, time);
        if (!remindersHashMap.hasOwnProperty(hash(reminder))) {
          remindersHashMap[hash(reminder)] = currentDate.toISOString();
          remindersQueue.push(reminder);
        }
      })
    } else if (frequency === 'weekly') {
      occurrences.forEach(occurrence => {
        if (isSameDay(occurrence.day)) {
          occurrence.times.forEach(time => {
            const reminder = createSingleReminder(prescription, time);
            if (!remindersHashMap.hasOwnProperty(hash(reminder))) {
              remindersHashMap[hash(reminder)] = currentDate.toISOString();
              remindersQueue.push(reminder);
            }
          })
        }
      })
    } else if (frequency === 'biweekly') {
      occurrences.forEach(occurrence => {
        if (isSameDay(occurrence.day) && util.getDayDifferenceFromToday(occurrence.starting) % 14 === 0) {
          occurrence.times.forEach(time => {
            const reminder = createSingleReminder(prescription, time);
            if (!remindersHashMap.hasOwnProperty(hash(reminder))) {
              remindersHashMap[hash(reminder)] = currentDate.toISOString();
              remindersQueue.push(reminder);
            }
          })
        }
      })
    } else if (frequency === 'monthly') {
      occurrences.forEach(occurrence => {
        if (isSameDay(occurrence.day) && util.getDayDifferenceFromToday(occurrence.starting) % 28 === 0) {
          occurrence.times.forEach(time => {
            const reminder = createSingleReminder(prescription, time);
            if (!remindersHashMap.hasOwnProperty(hash(reminder))) {
              remindersHashMap[hash(reminder)] = currentDate.toISOString();
              remindersQueue.push(reminder);
            }
          })
        }
      })
    } else if (frequency === 'custom') {
      occurrences.forEach(occurrence => {
        currentDate.setHours(0, 0, 0, 0);
        const customDate = util.getCustomDate(occurrence.day);
        if (customDate.getTime() === currentDate.getTime()) {
          occurrence.times.forEach(time => {
            const reminder = createSingleReminder(prescription, time);
            if (!remindersHashMap.hasOwnProperty(hash(reminder))) {
              remindersHashMap[hash(reminder)] = currentDate.toISOString();
              remindersQueue.push(reminder);
            }
          })
        }
      })
    }
  }
}

/**
 * Generates reminders based off the list of prescriptions received from the server for a specific patient
 */
function generateReminders() {
  if (fs.existsSync(appFolder + prescriptionsFileName)) {
    const prescriptions = readCborArray(prescriptionsFileName);
    if (prescriptions !== null && prescriptions !== undefined && prescriptions.length > 0) {
      prescriptions.forEach(prescription => {
        if (prescription !== null && prescription !== undefined && isAPrescription(prescription))
          createReminders(prescription)
      });
      if (remindersQueue.length > 0) {
        remindersQueue.sort(sortByDate);
      }
    }
  }
}

/**
 * Deletes all hashes that are older than 24 hours since reminders are calculated on a per day basis.
 * @param {object} map 
 */
function deleteOldHashes(map) {
  for (const key in map) {
    const oldDate = new Date(map[key]);
    const currentDate = new Date();
    if (currentDate.getTime() - oldDate.getTime() > 24 * 60 * 60 * 1000) {
      delete map[key];
    }
  }
}

/**
 * Deletes all reminders linked to this prescriptionId
 * @param {string} prescriptionId 
 */
function deleteReminders(prescriptionId) {
  for (let i = 0; i < remindersQueue.length; i++) {
    if (remindersQueue[i].id === prescriptionId) {
      let element = (remindersQueue.splice(i, 1));
      fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
      let correspondingHash = hash(element[0]);
      delete remindersHashMap[correspondingHash];
    }
  }
}

/**
 * Deletes all reminder that have a defer count > 3
 */
function deleteBasedOnDeferCount() {
  for (let i = 0; i < remindersQueue.length; i++) {
    if (remindersQueue[i].deferCount >= 3) {
      const patientId = readPatientId(userFileName);
      const prescriptionId = remindersQueue[i].id;
      const reminderDate = remindersQueue[i].reminderDate;
      sendStatus(patientId, prescriptionId, reminderDate, 'missed');
      let element = (remindersQueue.splice(i, 1));
      fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
      // Screen needs to change when the notification is deleted so patient does not interact with a 
      // missed reminder
      if (isSameReminder(element[0], currentReminder) && currentScreen === 'notification') {
        showClockFaceScreen();
      }
    }
  }
}

/**
 * Deletes all reminder that have not been interacted with in 3 hours
 */
function deleteBasedOnTime() {
  for (let i = 0; i < remindersQueue.length; i++) {
    let oldDate = new Date(remindersQueue[i].reminderDate);
    let currentDate = new Date();
    if (currentDate.getTime() - oldDate.getTime() > 3 * 60 * 60 * 1000) {
      const patientId = readPatientId(userFileName);
      const prescriptionId = remindersQueue[i].id;
      const reminderDate = remindersQueue[i].reminderDate;
      sendStatus(patientId, prescriptionId, reminderDate, 'missed');
      let element = (remindersQueue.splice(i, 1));
      fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
      // Screen needs to change when the notification is deleted so patient does not interact with a 
      // missed reminder
      if (isSameReminder(element[0], currentReminder) && currentScreen === 'notification') {
        showClockFaceScreen();
      }
    }
  }
}

/**
 * Helper function to determine if an object meets all the requirements to be a complete prescription
 * @param {object} object 
 * @returns 
 */
function isAPrescription(object) {
  return (object.hasOwnProperty('id')
    && object.hasOwnProperty('occurrences')
    && object.hasOwnProperty('frequency')
    && object.hasOwnProperty('deferInterval')
    && object.hasOwnProperty('frequency')
    && object.hasOwnProperty('startDate')
    && object.hasOwnProperty('route')
    && object.hasOwnProperty('unit')
    && object.hasOwnProperty('dose')
    && object.hasOwnProperty('medicationName')
    && object.hasOwnProperty('patientId')
    && object.hasOwnProperty('prescriberName')
    && object.hasOwnProperty('createdAt')
    && object.hasOwnProperty('updatedAt'));
}

/**
 * Checks if two objects are the same by comparing each key and value pair
 * @param {object} obj1 
 * @param {object} obj2 
 * @returns True if the objects are the same, otherwise false
 */
function isSameReminder(obj1, obj2) {
  const obj1Length = Object.keys(obj1).length;
  const obj2Length = Object.keys(obj2).length;

  if (obj1Length === obj2Length) {
    return Object.keys(obj1).every(
      key => obj2.hasOwnProperty(key)
        && obj2[key] === obj1[key]);
  }
  return false;
}

/**
 *  Send to companion the user activity in the previous day
 */
function sendDayHistory() {
  if (me.permissions.granted("access_activity")) {

    // query for the data 1 day ago
    const dayRecords = dayHistory.query({ limit: 1 });
    dayRecords.forEach((day, index) => {
      const yesterday = new Date((new Date().getTime() - (24 * 60 * 60 * 1000)));
      const dayHistoryFileName = 'dayHistory' + yesterday.toISOString().substring(0, 10) + '.cbor';
      const dayHistoryData = {
        patientId: readPatientId(userFileName),
        steps: day.steps,
        averageHeartRate: day.averageHeartRate,
        restingHeartRate: day.restingHeartRate,
        calories: day.calories,
        distance: day.distance,
        elevationGain: day.elevationGain,
        date: yesterday.toISOString(),
      }
      fs.writeFileSync(dayHistoryFileName, dayHistoryData, 'cbor');
      outbox.enqueueFile(appFolder + dayHistoryFileName);
    });
  }
}


// Every 15 seconds, the Healage Fitbit Device application will delete any completed reminders
// and check if the current reminder is equal or past the current time. If so, it will display
// the reminder and vibrate the device as a notification to the patient.
setInterval(() => {
  deleteCompletedReminders();
  if (remindersQueue !== null && remindersQueue.length > 0 && currentScreen !== 'notification') {
    currentReminder = remindersQueue[0];
    if (currentReminder !== null && currentReminder !== undefined && isLessThanEqualCurrentTime(currentReminder.reminderDate)) {
      showNotificationScreen();
      fs.writeFileSync(remindersFileName, remindersQueue, 'cbor');
    }
  }
}, 15 * 1000);

// Every 20 seconds, the Healage Fitbit Device application will check if the patientId is 
// valid and verified in the event that the patientId has not been verified due to file 
// corruption, device-to-companion connection issues, or server down time
setInterval(() => {
  if (!isPatientIdValid(userFileName)) {
    const patientId = util.generateUid();
    sendCheckId(patientId);
  }

  if (!isPatientIdVerified(userFileName)) {
    const patientId = readPatientId(userFileName);
    sendCheckId(patientId);
  }
}, 20 * 1000);

// Every 5 minutes, the Healage Fitbit Device application will check prescriptions from the 
// server and update the prescriptions.cbor. Upon updating the prescriptions.cbor on the 
// device, new reminders will be generated, if applicable.
setInterval(() => {
  if (isPatientIdVerified(userFileName)) {
    const patientId = readPatientId(userFileName);
    sendCheckPrescriptions(patientId);
  }
}, 5 * 60 * 1000);

// Every 15 minutes, the Healage Fitbit Device application will turn on the Fitbit device 
// display in order to wake up the device. This 'wake up' process enables reminders that were 
// previously ignored to be triggered again and vibrate. Otherwise, ignored reminders will not 
// vibrate or display unless the patient manually taps the screen/buttons to turn on the device. 
setInterval(() => {
  display.poke();
}, 15 * 60 * 1000);

// Every 30 minutes, the Healage Fitbit Device application will delete all reminders that have either
// 1) Been unresponded in over 3 hours
// 2) Been deferred 4 times
setInterval(() => {
  deleteBasedOnDeferCount();
  deleteBasedOnTime();
}, 30 * 60 * 1000);

// Every 24 hours, the Healage Fitbit Device application will delete old hashes of reminders 
// and send the user's activity data over to the server. 
setInterval(() => {
  deleteOldHashes(remindersHashMap);
  sendDayHistory();
}, 24 * 60 * 60 * 1000);