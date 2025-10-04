import { useState, useMemo } from 'react';
import { Employee } from '../services/database';

export const useEmployeeSearch = <T extends { employee?: Employee }>(
  items: T[],
  getEmployee: (item: T) => Employee
) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const searchNumbers = searchTerm.replace(/\D/g, '');

    return items.filter(item => {
      const employee = getEmployee(item);
      if (!employee) return false;

      const nameMatch = employee.name.toLowerCase().includes(searchLower);
      const cpfMatch = searchNumbers && employee.cpf.includes(searchNumbers);
      return nameMatch || cpfMatch;
    });
  }, [items, searchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    filteredItems
  };
};
