import document from 'document';
import clock from 'clock';
import * as fs from 'fs';
import { me } from 'appbit';
import { display } from 'display';
import { preferences } from 'user-settings';
import { inbox } from 'file-transfer';
import { battery } from 'power';
import {
  DEFERRAL_THRESHOLD,
  DELETION_THRESHOLD,
  NOTIFICATION_INTERVAL,
  PATIENT_ID_FILENAME,
  POKE_INTERVAL,
  PRESCRIPTIONS_FILENAME,
  REMINDERS_FILENAME,
  UPDATED_CONFIRMATION_TIMEOUT,
  UPDATE_INTERVAL,
} from '../common/config';
import * as datetime from './datetime';
import * as vibration from './vibration';
import {
  readCbor,
  readCborArray,
  deleteFile,
} from './file-system';;
import * as remindersService from './reminders';
import * as send from './send';
import { readPatientId } from './patientId';

if (me.appTimeoutEnabled) {
  me.appTimeoutEnabled = false;
}

// Process inbox files
const processAllFiles = () => {
  let filename;
  while (filename = inbox.nextFile()) {
    if (filename === PATIENT_ID_FILENAME) {
      const { patientId } = fs.readFileSync(PATIENT_ID_FILENAME, 'cbor');
      patientIdDisplay.text = patientId;
    } else if (filename === PRESCRIPTIONS_FILENAME) {
      remindersService.generate();
      const updatedConfirmationText = document.getElementById('updatedConfirmation');
      updatedConfirmationText.style.display = 'inline';
      setTimeout(() => {
        updatedConfirmationText.style.display = 'none';
      }, UPDATED_CONFIRMATION_TIMEOUT);
    } else if (filename.indexOf('deleteFile') !== -1) {
      const request = readCbor(filename);
      deleteFile(request.filename);
    }
  }
};
inbox.addEventListener('newfile', processAllFiles);
processAllFiles();

// Load/Generate patient id
const patientIdDisplay = document.getElementById('patientIdDisplay');
if (fs.existsSync(PATIENT_ID_FILENAME)) {
  patientIdDisplay.text = readPatientId(PATIENT_ID_FILENAME);
} else {
  send.generatePatientId();
}

// Generate reminders and update prescriptions
if (!fs.existsSync(REMINDERS_FILENAME)) {
  if (fs.existsSync(PRESCRIPTIONS_FILENAME)) {
    remindersService.generate();
  }
}
send.updatePrescriptions();

// Setup screens
const clockFaceScreen = document.getElementById('clockFaceScreen');
const userScreen = document.getElementById('userScreen');
const timerScreen = document.getElementById('timerScreen');
const notificationScreen = document.getElementById('notificationScreen');
const screens = [clockFaceScreen, userScreen, timerScreen, notificationScreen];
const showScreen = (screen) => {
  screens.forEach((screen) => screen.style.display = 'none');
  screen.style.display = 'inline';
};
showScreen(clockFaceScreen);

// Back buttons
document.getElementsByClassName('back-button').forEach((button) => {
  button.addEventListener('click', () => showScreen(clockFaceScreen));
});

// Clock face buttons
document.getElementById('refreshButton').addEventListener('click', send.updatePrescriptions);
document.getElementById('timerScreenButton').addEventListener('click', () => showScreen(timerScreen));
document.getElementById('userScreenButton').addEventListener('click', () => showScreen(userScreen));

// Timer screen buttons
const gaitSpeedMeasurementDisplay = document.getElementById('gaitSpeedMeasurementDisplay');
const timerButton = document.getElementById('timerButton');
let startTime;
let state = 'stopped';
timerButton.addEventListener('click', () => {
  if (state === 'stopped') {
    state = 'started';
    timerButton.image = 'stop.png';
    startTime = new Date().getTime();
    gaitSpeedMeasurementDisplay.text = 'Press stop when done';
  } else if (state === 'started') {
    state = 'completed';
    timerButton.image = 'restart.png';
    const timeElapsed = new Date().getTime() - startTime;
    const gaitSpeed = Math.round((4 / (timeElapsed / 1000)) * 10) / 10;
    gaitSpeedMeasurementDisplay.text = `Gait Speed: ${gaitSpeed} m/s`;
    send.gaitSpeed(gaitSpeed);
  } else if (state === 'completed') {
    state = 'stopped';
    timerButton.image = 'start.png';
    gaitSpeedMeasurementDisplay.text = 'Press play and walk 4 meters';
  }
});

// Notification screen
const notificationDisplay = document.getElementById('notificationDisplay');
let notificationShowing = false;

// Every [NOTIFICATION_INTERVAL], the Healage Fitbit Device application will delete any completed reminders
// and check if the current reminder is equal or past the current time. If so, it will display
// the reminder and vibrate the device as a notification to the patient.
setInterval(() => {
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders[0];
  if (!currentReminder) return;

  // Delete showing reminder if passed 2 hours
  if (notificationShowing) {
    const currentReminder = reminders[0];
    const reminderDate = new Date(currentReminder.reminderDate);
    const currentDate = new Date();
    if (currentDate.getTime() - reminderDate.getTime() > DELETION_THRESHOLD) {
      send.status(currentReminder.prescriptionId, currentReminder.reminderDate, 'missed');
      reminders.splice(0, 1);
      fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
      showScreen(clockFaceScreen);
      notificationShowing = false;
    }
    return;
  };

  // Check if the current reminder should be shown
  if (datetime.lessThanEqualCurrentTime(currentReminder.reminderDate)) {
    display.poke();
    vibration.start();
    const dateParts = new Date(currentReminder.reminderDate).toLocaleString().split(' ');
    const time = dateParts[4];
    const convertedTime = `${datetime.convertTo12hClock(time)} on ${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
    notificationDisplay.text = `Take ${currentReminder.dose} ${currentReminder.unit} of ${currentReminder.medicationName} by ${currentReminder.route} at ${convertedTime}`;
    showScreen(notificationScreen);
    notificationShowing = true;
  }
}, NOTIFICATION_INTERVAL);

document.getElementById('doneButton').addEventListener('click', () => {
  vibration.stop();
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders.shift();
  send.status(currentReminder.id, currentReminder.reminderDate, 'completed');
  fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
  showScreen(clockFaceScreen);
  notificationShowing = false;
});

document.getElementById('deferButton').addEventListener('click', () => {
  vibration.stop();
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders[0];
  const futureDate = new Date();
  futureDate.setMinutes(futureDate.getMinutes() + currentReminder.deferInterval);
  currentReminder.deferCount += 1;
  if (currentReminder.deferCount > DEFERRAL_THRESHOLD) {
    send.status(currentReminder.id, currentReminder.reminderDate, 'missed');
    reminders.splice(0, 1);
  } else {
    currentReminder.reminderDate = futureDate.toISOString();
    reminders.sort(datetime.sortByDate);
  }
  fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
  showScreen(clockFaceScreen);
  notificationShowing = false;
});

// Every tick, update clock face
const timeDisplay = document.getElementById('timeDisplay');
const batteryDisplay = document.getElementById('batteryDisplay');
const batteryLevel = document.getElementById('batteryLevel');
const dayOfMonthDisplay = document.getElementById('dayOfMonthDisplay');
const monthDisplay = document.getElementById('monthDisplay');
clock.granularity = 'minutes';
clock.addEventListener('tick', (e) => {
  const today = e.date;

  let hours = today.getHours();
  if (preferences.clockDisplay === '12h') {
    hours = hours % 12 || 12;
  } else {
    hours = datetime.zeroPad(hours);
  }
  const mins = datetime.zeroPad(today.getMinutes());
  timeDisplay.text = `${hours}:${mins}`;
  const { chargeLevel } = battery;
  batteryDisplay.text = `${Math.floor(chargeLevel)}%`;
  batteryLevel.width = (chargeLevel / 100) * 26;

  dayOfMonthDisplay.text = today.getDate();
  monthDisplay.text = datetime.getMonthAbbreviation(today.getMonth());
});

// Every [UPDATE_INTERVAL], the Healage Fitbit Device application will check prescriptions from the 
// server and update the prescriptions.cbor. Upon updating the prescriptions.cbor on the 
// device, new reminders will be generated, if applicable.
setInterval(send.updatePrescriptions, UPDATE_INTERVAL);

// Every [POKE_INTERVAL], the Healage Fitbit Device application will turn on the Fitbit device 
// display in order to wake up the device. This 'wake up' process enables reminders that were 
// previously ignored to be triggered again and vibrate. Otherwise, ignored reminders will not 
// vibrate or display unless the patient manually taps the screen/buttons to turn on the device. 
setInterval(() => {
  display.poke();
}, POKE_INTERVAL);

// Every 24 hours, send the day history
send.dayHistory();
setInterval(send.dayHistory, 24 * 60 * 60 * 1000);
