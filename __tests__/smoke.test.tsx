import React from 'react';
import { render } from '@testing-library/react-native';
import { Button, Card, Input, Loading } from '@/components';

describe('Smoke Tests - Components', () => {
  it('renders Button component', () => {
    const { getByText } = render(<Button title="Test Button" onPress={() => {}} />);
    expect(getByText('Test Button')).toBeTruthy();
  });

  it('renders Card component', () => {
    const { getByText } = render(
      <Card>
        <></>
      </Card>
    );
    expect(getByText).toBeDefined();
  });

  it('renders Input component', () => {
    const { getByPlaceholderText } = render(
      <Input placeholder="Test Input" onChangeText={() => {}} />
    );
    expect(getByPlaceholderText('Test Input')).toBeTruthy();
  });

  it('renders Loading component', () => {
    const { container } = render(<Loading />);
    expect(container).toBeTruthy();
  });
});

describe('Smoke Tests - Utilities', () => {
  it('formatters exist', () => {
    const { formatCurrency, formatCPF, formatPhone } = require('@/utils/formatters');
    expect(typeof formatCurrency).toBe('function');
    expect(typeof formatCPF).toBe('function');
    expect(typeof formatPhone).toBe('function');
  });

  it('theme constants exist', () => {
    const { colors, spacing, typography } = require('@/constants/theme');
    expect(colors).toBeDefined();
    expect(spacing).toBeDefined();
    expect(typography).toBeDefined();
  });
});
