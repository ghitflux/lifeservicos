import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { borderRadius, spacing } from '@/constants/theme';

interface AccordionItem {
  pergunta: string;
  resposta: string;
}

interface AccordionProps {
  items: AccordionItem[];
}

export default function Accordion({ items }: AccordionProps) {
  const { colors } = useTheme();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {items.map((item, index) => (
        <View 
          key={index} 
          style={[
            styles.item,
            { borderBottomColor: colors.border },
            index === items.length - 1 && styles.lastItem
          ]}
        >
          <Pressable
            style={styles.trigger}
            onPress={() => toggleItem(index)}
          >
            <Text style={[styles.question, { color: colors.text }]}>{item.pergunta}</Text>
            <Ionicons
              name={expandedIndex === index ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          {expandedIndex === index && (
            <View style={styles.content}>
              <Text style={[styles.answer, { color: colors.textSecondary }]}>{item.resposta}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  item: {
    borderBottomWidth: 1,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  question: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  answer: {
    fontSize: 14,
    lineHeight: 20,
  },
});

