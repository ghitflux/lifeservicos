import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { spacing, borderRadius, typography } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export interface AlertDialogButton {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertDialogProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertDialogButton[];
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onDismiss?: () => void;
}

export function AlertDialog({
  visible,
  title,
  message,
  buttons,
  icon,
  iconColor,
  onDismiss,
}: AlertDialogProps) {
  const { colors } = useTheme();

  const handlePress = async (button: AlertDialogButton) => {
    if (button.onPress) {
      await button.onPress();
    }
    onDismiss?.();
  };

  const getButtonStyle = (style?: 'default' | 'cancel' | 'destructive') => {
    switch (style) {
      case 'destructive':
        return {
          backgroundColor: colors.error,
          textColor: '#FFFFFF',
        };
      case 'cancel':
        return {
          backgroundColor: colors.backgroundSecondary,
          textColor: colors.text,
        };
      default:
        return {
          backgroundColor: colors.primary,
          textColor: colors.background,
        };
    }
  };

  const defaultIconColor = iconColor || colors.primary;

  // Reorder buttons: action buttons (default/destructive) first, then cancel
  const orderedButtons = [
    ...buttons.filter((b) => b.style === 'default' || b.style === 'destructive'),
    ...buttons.filter((b) => b.style === 'cancel'),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
        onPress={onDismiss}
      >
        <Pressable
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {icon && (
            <View style={styles.iconContainer}>
              <Ionicons name={icon} size={48} color={defaultIconColor} />
            </View>
          )}

          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                ...typography.h3,
              },
            ]}
          >
            {title}
          </Text>

          <Text
            style={[
              styles.message,
              {
                color: colors.textSecondary,
                ...typography.body,
              },
            ]}
          >
            {message}
          </Text>

          <View style={styles.buttonContainer}>
            {orderedButtons.map((button, index) => {
              const buttonStyle = getButtonStyle(button.style);
              return (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: buttonStyle.backgroundColor,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={() => handlePress(button)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: buttonStyle.textColor,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {button.text.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  message: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'column',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    textAlign: 'center',
    fontSize: 14,
  },
});
