import { supabase } from '../lib/supabase';
import { getCurrentTimestamp } from '../utils/dateUtils';
import { upsertPayment } from './database';

export const applyBulkDailyRate = async (
  employeeIds: string[],
  attendances: any[],
  payments: any[],
  dailyRate: number,
  userId: string
): Promise<void> => {
  const promises = [];

  for (const employeeId of employeeIds) {
    const employeeAttendances = attendances.filter(
      att => att.employee_id === employeeId && att.status === 'present'
    );

    for (const attendance of employeeAttendances) {
      const existingPayment = payments.find(
        pay => pay.employee_id === employeeId && pay.date === attendance.date
      );

      const currentBonus = existingPayment?.bonus || 0;
      promises.push(
        upsertPayment(employeeId, attendance.date, dailyRate, currentBonus, userId)
      );
    }
  }

  await Promise.all(promises);
};

export const clearPaymentsBatch = async (
  employeeIds: string[],
  startDate?: string,
  endDate?: string
): Promise<void> => {
  const promises = employeeIds.map(employeeId => {
    let query = supabase
      .from('payments')
      .delete()
      .eq('employee_id', employeeId);

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    return query;
  });

  await Promise.all(promises);
};

export const applyErrorDiscounts = async (
  employeeErrorData: Array<{
    employeeId: string;
    errorRecords: any[];
  }>,
  discountValue: number,
  payments: any[],
  userId: string
): Promise<void> => {
  const updatePromises = [];

  for (const { employeeId, errorRecords } of employeeErrorData) {
    for (const errorRecord of errorRecords) {
      const discountAmount = errorRecord.error_count * discountValue;

      const existingPayment = payments.find(
        pay => pay.employee_id === employeeId && pay.date === errorRecord.date
      );

      if (existingPayment) {
        const originalDailyRate = existingPayment.daily_rate || 0;
        const originalBonus = existingPayment.bonus || 0;
        const newTotal = Math.max(0, originalDailyRate + originalBonus - discountAmount);

        updatePromises.push(
          supabase
            .from('payments')
            .update({ total: newTotal })
            .eq('employee_id', employeeId)
            .eq('date', errorRecord.date)
        );
      } else {
        const discountedTotal = Math.max(0, -discountAmount);

        updatePromises.push(
          upsertPayment(employeeId, errorRecord.date, 0, 0, userId).then(() =>
            supabase
              .from('payments')
              .update({ total: discountedTotal })
              .eq('employee_id', employeeId)
              .eq('date', errorRecord.date)
          )
        );
      }
    }
  }

  await Promise.all(updatePromises);
};
