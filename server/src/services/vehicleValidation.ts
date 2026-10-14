export const parseOdometerReading = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;

  const reading = Number(value);
  if (!Number.isSafeInteger(reading) || reading < 0) {
    throw new Error('قراءة العداد يجب أن تكون عددًا صحيحًا غير سالب');
  }

  return reading;
};