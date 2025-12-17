export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatCPF(cpf: string): string {
  return cpf
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatPhone(phone: string): string {
  return phone
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

export function formatCEP(cep: string): string {
  return cep
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d{3})/, '$1-$2');
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// Mask functions for real-time input
export function maskCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskPhone(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

// Safe date formatting function that handles various date formats
export function formatDateSafe(dateInput: string | Date | null | undefined): string {
  if (!dateInput) {
    return 'Data não disponível';
  }

  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      // Try to parse the date string
      // Handle various formats: ISO 8601, timestamp, etc.
      date = new Date(dateInput);

      // If invalid, try alternative parsing
      if (isNaN(date.getTime())) {
        // Try parsing as timestamp (milliseconds)
        const timestamp = parseInt(dateInput, 10);
        if (!isNaN(timestamp) && timestamp > 0) {
          date = new Date(timestamp);
        } else {
          return 'Data inválida';
        }
      }
    } else {
      date = dateInput;
    }

    // Final validation
    if (isNaN(date.getTime())) {
      return 'Data inválida';
    }

    return date.toLocaleDateString('pt-BR');
  } catch (error) {
    console.error('[formatDateSafe] Error parsing date:', error);
    return 'Data inválida';
  }
}
