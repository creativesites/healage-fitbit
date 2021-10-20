import { vibration } from 'haptics';

export const start = () => {
  vibration.start('alert');
};

export const stop = () => {
  vibration.stop();
};
