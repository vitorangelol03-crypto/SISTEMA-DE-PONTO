import { useState } from 'react';
import { getBrazilDate } from '../utils/dateUtils';

export interface DateFilters {
  startDate: string;
  endDate: string;
  employeeId?: string;
}

export const useDateFilter = (initialStartDate?: string, initialEndDate?: string) => {
  const [filters, setFilters] = useState<DateFilters>({
    startDate: initialStartDate || getBrazilDate(),
    endDate: initialEndDate || getBrazilDate(),
    employeeId: ''
  });

  const handleDateChange = (field: keyof DateFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      startDate: getBrazilDate(),
      endDate: getBrazilDate(),
      employeeId: ''
    });
  };

  return {
    filters,
    setFilters,
    handleDateChange,
    resetFilters
  };
};
