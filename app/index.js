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
const patientIdDisplay = document.getElementById('patientIdDisplay');
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
if (fs.existsSync(PATIENT_ID_FILENAME)) {
  patientIdDisplay.text = readPatientId(PATIENT_ID_FILENAME);
} else {
  send.generatePatientId();
}

// Generate reminders and update prescriptions
const generateAndUpdateReminders = () => {
  if (fs.existsSync(PRESCRIPTIONS_FILENAME)) remindersService.generate();
  send.updatePrescriptions();
}
generateAndUpdateReminders();

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

// Back buttons
document.getElementsByClassName('back-button').forEach((button) => {
  button.addEventListener('click', () => showScreen(clockFaceScreen));
});

// Clock face buttons
document.getElementById('refreshButton').addEventListener('click', send.updatePrescriptions);
document.getElementById('timerScreenButton').addEventListener('click', () => showScreen(timerScreen));
document.getElementById('userScreenButton').addEventListener('click', () => showScreen(userScreen));

// Timer screen buttons
let startTime;
let state = 'stopped';
const timerButton = document.getElementById('timerButton');
const gaitSpeedMeasurementDisplay = document.getElementById('gaitSpeedMeasurementDisplay');

const updateTimerState = (newState, image, text) => {
  state = newState;
  timerButton.image = image;
  gaitSpeedMeasurementDisplay.text = text;
}

timerButton.addEventListener('click', () => {
  switch (state) {
    case 'stopped':
      updateTimerState('started', 'stop.png', 'Press stop when done');
      startTime = new Date().getTime();
      break;
    case 'started':
      const timeElapsed = new Date().getTime() - startTime;
      const gaitSpeed = Math.round((4 / (timeElapsed / 1000)) * 10) / 10;
      updateTimerState('completed', 'restart.png', `Gait Speed: ${gaitSpeed} m/s`);
      send.gaitSpeed(gaitSpeed);
      break;
    case 'completed':
      updateTimerState('stopped', 'start.png', 'Press play and walk 4 meters');
      break;
  }
});

// Notification screen
let notificationShowing = false;
const notificationDisplay = document.getElementById('notificationDisplay');

const showNotification = () => {
  display.poke();
  vibration.start();
  showScreen(notificationScreen);
  notificationShowing = true;
};

const hideNotification = () => {
  vibration.stop();
  showScreen(clockFaceScreen);
  notificationShowing = false;
};

// Every [NOTIFICATION_INTERVAL], the Healage Fitbit Device application will delete any completed reminders
// and check if the current reminder is equal or past the current time. If so, it will display
// the reminder and vibrate the device as a notification to the patient.
setInterval(() => {
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders[0];
  if (!currentReminder) return;

  // Delete showing reminder if passed 2 hours
  if (notificationShowing) {
    const reminderDate = new Date(currentReminder.reminderDate);
    const currentDate = new Date();
    if (currentDate.getTime() - reminderDate.getTime() > DELETION_THRESHOLD) {
      send.status(currentReminder.prescriptionId, currentReminder.reminderDate, 'missed');
      reminders.splice(0, 1);
      fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
      hideNotification();
    }
    return;
  };

  // Check if the current reminder should be shown
  if (datetime.lessThanEqualCurrentTime(currentReminder.reminderDate)) {
    const dateParts = new Date(currentReminder.reminderDate).toLocaleString().split(' ');
    const time = dateParts[4];
    const convertedTime = `${datetime.convertTo12hClock(time)} on ${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;
    const { dose, unit, medicationName } = currentReminder;
    const optionalRoute = currentReminder.route ? `by ${currentReminder.route} ` : '';
    notificationDisplay.text = `Take ${dose} ${unit} of ${medicationName} ${optionalRoute}at ${convertedTime}`;
    showNotification();
  }
}, NOTIFICATION_INTERVAL);

document.getElementById('doneButton').addEventListener('click', () => {
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders.shift();
  send.status(currentReminder.prescriptionId, currentReminder.reminderDate, 'completed');
  fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
  hideNotification();
});

document.getElementById('deferButton').addEventListener('click', () => {
  const reminders = readCborArray(REMINDERS_FILENAME);
  const currentReminder = reminders[0];
  currentReminder.deferCount += 1;
  if (currentReminder.deferCount > DEFERRAL_THRESHOLD) {
    send.status(currentReminder.prescriptionId, currentReminder.reminderDate, 'missed');
    reminders.splice(0, 1);
  } else {
    const futureDate = new Date();
    futureDate.setMinutes(futureDate.getMinutes() + currentReminder.deferInterval);
    currentReminder.reminderDate = futureDate.toISOString();
    reminders.sort(datetime.sortByDate);
  }
  fs.writeFileSync(REMINDERS_FILENAME, reminders, 'cbor');
  hideNotification();
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
setInterval(generateAndUpdateReminders, UPDATE_INTERVAL);

// Every [POKE_INTERVAL], the Healage Fitbit Device application will show a notification if the
// screen has fallen asleep.
setInterval(() => {
  if (!notificationShowing) return;
  display.poke();
  vibration.start();
}, POKE_INTERVAL);

// Every 24 hours, send the day history
send.dayHistory();
setInterval(send.dayHistory, 24 * 60 * 60 * 1000);
