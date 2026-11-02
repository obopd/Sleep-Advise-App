// Demo data: two weeks of a moderately late sleeper with an early work start.
import { addDays } from '../engine/time.js';

export function sampleState(today) {
  const start = addDays(today, -14);
  const entries = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
    const freeDay = dow === 5 || dow === 6; // Fri & Sat nights → free mornings
    const lateCoffee = i % 3 === 0;
    entries.push({
      date,
      freeDay,
      alarm: !freeDay,
      bedTime: freeDay ? '01:15' : i % 2 ? '00:15' : '23:50',
      latencyMin: lateCoffee ? 40 : 20,
      wakeTime: freeDay ? '09:45' : '06:45',
      outOfBedTime: freeDay ? '10:05' : '06:55',
      wasoMin: lateCoffee ? 25 : 10,
      quality: lateCoffee ? 2 : freeDay ? 4 : 3,
      caffeine: [{ time: '07:30', mg: 95 }, ...(lateCoffee ? [{ time: '16:30', mg: 95 }] : [])],
      alcoholDrinks: freeDay ? 2 : 0,
      alcoholLastTime: freeDay ? '23:00' : '',
      exerciseEnd: i % 4 === 1 ? '19:00' : '',
      exerciseIntensity: i % 4 === 1 ? 'moderate' : 'none',
      morningLightMin: i % 2 ? 10 : 35,
      screensUntil: freeDay ? '01:00' : '23:45',
      lastMealTime: '20:00',
      napStart: '',
      napMin: 0,
    });
  }
  return {
    profile: {
      birthday: '1997-05-14',
      workWake: '06:45',
      personalNeedHours: '',
      shiftWork: false,
      mctq: { workdays: 5, workOnset: '00:10', workWake: '06:45', freeOnset: '01:35', freeWake: '09:45', freeAlarm: false },
      screening: {},
    },
    entries,
    measured: [],
  };
}
