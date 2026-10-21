const MAX_ODOMETER_KM = 1_500_000;

export const parseOdometerReading = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;

  const reading = Number(value);
  if (!Number.isSafeInteger(reading) || reading < 0 || reading > MAX_ODOMETER_KM) {
    throw new Error(`قراءة العداد يجب أن تكون عددًا صحيحًا بين صفر و${MAX_ODOMETER_KM.toLocaleString('ar-EG')} كم`);
  }

  return reading;
};