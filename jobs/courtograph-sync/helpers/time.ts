export const getTimeDifference = (time1: string | undefined, time2: string | undefined): { minutes: number; seconds: number } => {
  const t1 = time1?.trim() ?? "";
  const t2 = time2?.trim() ?? "";
  if (!t1 || !t2) {
    return {minutes: 0, seconds: 0};
  }

  const [_h1, min1, sec1] = t1.split(":").map((val) => parseInt(val, 10));
  const [_h2, min2, sec2] = t2.split(":").map((val) => parseInt(val, 10));

  if ([min1, sec1, min2, sec2].some((n) => Number.isNaN(n))) {
    return {minutes: 0, seconds: 0};
  }

  const totalSeconds1 = min1 * 60 + sec1;
  const totalSeconds2 = min2 * 60 + sec2;

  const diff = Math.abs(totalSeconds1 - totalSeconds2);

  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;

  return {minutes, seconds};
};

export const addTimes = (time1: { minutes: number; seconds: number },
                         time2: { minutes: number; seconds: number }): { minutes: number; seconds: number } => {
  const totalSeconds = (time1.minutes * 60 + time1.seconds) + (time2.minutes * 60 + time2.seconds);

  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  };
};

