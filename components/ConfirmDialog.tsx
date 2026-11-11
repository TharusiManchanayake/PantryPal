import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  emoji?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean; // red confirm button, for things like delete
  inline?: boolean; // render as an overlay inside a parent instead of its own Modal
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  emoji,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  inline = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!visible) return null;

  const content = (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, destructive && styles.confirmBtnDestructive]}
            onPress={onConfirm}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Inline mode is for use inside another Modal (e.g. the edit sheet), because
  // stacking two real Modals on top of each other is unreliable on iPhones.
  if (inline) {
    return <View style={StyleSheet.absoluteFill}>{content}</View>;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'center',
  },
  emoji: { fontSize: 34, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  message: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { color: colors.inkSoft, fontWeight: '700', fontSize: 13.5 },
  confirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  confirmBtnDestructive: { backgroundColor: colors.red },
  confirmText: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
});